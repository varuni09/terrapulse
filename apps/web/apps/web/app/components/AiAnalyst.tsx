"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HELP, SRC_POINT, SRC_TREND, SRC_UHI, composeCompare, composePoint, composeTrend, composeUhi, parseIntent } from "../../lib/analyst";

type Message = { id: string; sender: "user" | "ai"; text: string; source?: string; actionLabel?: string; onAction?: () => void };
type Place = { name: string; label: string; lat: number; lon: number };
interface Props {
  onFlyTo?: (lat: number, lon: number, name: string) => void;
  onSwitchLayer?: (layer: "lst" | "ndvi") => void;
}

async function geocode(q: string): Promise<Place | null> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  const p = (await r.json())?.results?.[0];
  return p ? { name: p.name, label: [p.name, p.admin1, p.country].filter(Boolean).join(", "), lat: p.latitude, lon: p.longitude } : null;
}
async function api(path: string) {
  const r = await fetch(path);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}
const sample = async (p: Place) => {
  const j = await api(`/api/gee/sample?lat=${p.lat}&lon=${p.lon}&range=30d`);
  return { lst: (j.data?.lst_c ?? null) as number | null, ndvi: (j.data?.ndvi ?? null) as number | null };
};

const PRESETS = ["How hot is Phoenix?", "Compare Delhi and London", "Heat island of Cairo", "Is Lagos getting greener?"];

export default function AiAnalyst({ onFlyTo, onSwitchLayer }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", sender: "ai", text: "I'm the TerraPulse analyst. I look up real satellite data for a place and tell you what it says, including when there isn't any. " + HELP },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = (m: Omit<Message, "id">) => setMessages((p) => [...p, { ...m, id: crypto.randomUUID() }]);

  const handleSend = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    add({ sender: "user", text: q });
    setInput("");
    const intent = parseIntent(q);
    try {
      if (intent.kind === "help") return add({ sender: "ai", text: HELP });

      if (intent.kind === "compare") {
        setBusy("Looking up both places…");
        const [a, b] = await Promise.all(intent.places.map(geocode));
        const miss = !a ? intent.places[0] : !b ? intent.places[1] : null;
        if (miss) return add({ sender: "ai", text: `I couldn't find a place called “${miss}”. Try a city name.` });
        setBusy("Reading satellite data…");
        const [va, vb] = await Promise.all([sample(a!), sample(b!)]);
        return add({ sender: "ai", text: composeCompare(a!.label, va, b!.label, vb), source: SRC_POINT, actionLabel: `Fly to ${a!.name}`, onAction: () => { onSwitchLayer?.("lst"); onFlyTo?.(a!.lat, a!.lon, a!.name); } });
      }

      setBusy(`Looking up “${intent.place}”…`);
      const p = await geocode(intent.place);
      if (!p) return add({ sender: "ai", text: `I couldn't find a place called “${intent.place}”. Try a city name.` });
      const fly = { actionLabel: `Fly to ${p.name}`, onAction: () => { onSwitchLayer?.("lst"); onFlyTo?.(p.lat, p.lon, p.name); } };

      setBusy("Reading satellite data…");
      if (intent.kind === "point") {
        add({ sender: "ai", text: composePoint(p.label, await sample(p)), source: SRC_POINT, ...fly });
      } else if (intent.kind === "trend") {
        const j = await api(`/api/gee/series?lat=${p.lat}&lon=${p.lon}&months=24`);
        add({ sender: "ai", text: composeTrend(p.label, j.series), source: SRC_TREND, ...fly });
      } else {
        add({ sender: "ai", text: composeUhi(p.label, await api(`/api/gee/uhi?lat=${p.lat}&lon=${p.lon}`)), source: SRC_UHI, ...fly });
      }
    } catch (e: any) {
      add({ sender: "ai", text: `I couldn't get the satellite data just now (${String(e?.message ?? e).slice(0, 120)}). I won't guess. Please try again.` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 font-mono">
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mb-3 w-80 rounded-2xl border border-white/10 bg-[#04091f]/90 p-4 shadow-2xl backdrop-blur-2xl sm:w-96">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#2ee6c5]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white">Satellite analyst</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-xs text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="my-3 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 text-xs">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[88%] rounded-xl px-3 py-2 leading-relaxed ${m.sender === "user" ? "border border-[#2ee6c5]/40 bg-[#2ee6c5]/20 text-white" : "border border-white/10 bg-white/5 text-slate-200"}`}>
                    {m.text}
                    {m.source && <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] leading-snug text-slate-500">Source: {m.source}</div>}
                  </div>
                  {m.actionLabel && m.onAction && (
                    <button onClick={m.onAction} className="mt-1.5 rounded-lg border border-[#2ee6c5]/60 bg-[#2ee6c5]/10 px-2.5 py-1 text-[10px] font-semibold text-[#2ee6c5] transition hover:bg-[#2ee6c5] hover:text-[#02061a]">
                      ⚡ {m.actionLabel}
                    </button>
                  )}
                </div>
              ))}
              {busy && <div className="animate-pulse text-[10px] text-slate-500">{busy}</div>}
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p} disabled={!!busy} onClick={() => handleSend(p)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-300 transition hover:border-[#2ee6c5]/50 hover:text-white disabled:opacity-40">{p}</button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a city…" className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#2ee6c5] focus:outline-none" />
              <button type="submit" disabled={!!busy} className="rounded-xl bg-gradient-to-r from-[#2ee6c5] to-[#7dd3fc] px-3.5 py-2 text-xs font-bold text-[#02061a] transition hover:opacity-90 disabled:opacity-50">Send</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} className="flex items-center gap-2 rounded-2xl border border-[#2ee6c5]/40 bg-[#04091f]/90 px-4 py-3 text-xs font-bold text-white shadow-2xl backdrop-blur-xl transition hover:scale-105 hover:border-[#2ee6c5]">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#2ee6c5]" /><span>Ask the satellite analyst</span>
        </button>
      )}
    </div>
  );
}
