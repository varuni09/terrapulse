"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HELP, SRC_POINT, SRC_TREND, SRC_UHI, composeCompare, composePoint, composeTrend, composeUhi, parseIntent } from "../../lib/analyst";

type Message = {
  id: string;
  sender: "user" | "ai";
  text: string;
  source?: string;
  actionLabel?: string;
  onAction?: () => void;
};
type Place = { name: string; label: string; lat: number; lon: number };

interface AiAnalystProps {
  onFlyTo?: (lat: number, lon: number, name: string) => void;
  onDiveIn?: () => void;
  onSwitchLayer?: (layer: "lst" | "ndvi") => void;
}

async function geocode(query: string): Promise<Place | null> {
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
  const place = (await response.json())?.results?.[0];
  return place ? {
    name: place.name,
    label: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
    lat: place.latitude,
    lon: place.longitude,
  } : null;
}

async function api(path: string) {
  const response = await fetch(path);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || `HTTP ${response.status}`);
  return result;
}

async function sample(place: Place) {
  const result = await api(`/api/gee/sample?lat=${place.lat}&lon=${place.lon}&range=30d`);
  return { lst: (result.data?.lst_c ?? null) as number | null, ndvi: (result.data?.ndvi ?? null) as number | null };
}

const PRESET_QUERIES = ["How hot is Phoenix?", "Compare Delhi and London", "Heat island of Cairo", "Is Lagos getting greener?"];

export default function AiAnalyst({ onFlyTo, onDiveIn, onSwitchLayer }: AiAnalystProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      sender: "ai",
      text: "I'm the TerraPulse analyst. I look up real satellite data for a place and tell you what it says, including when there isn't any. " + HELP,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const addMessage = (message: Omit<Message, "id">) => {
    setMessages((previous) => [...previous, { ...message, id: crypto.randomUUID() }]);
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || busy) return;
    addMessage({ sender: "user", text: query });
    setInput("");
    const intent = parseIntent(query);

    try {
      if (intent.kind === "help") {
        addMessage({ sender: "ai", text: HELP });
        return;
      }

      if (intent.kind === "compare") {
        setBusy("Looking up both places...");
        const [first, second] = await Promise.all(intent.places.map(geocode));
        const missing = !first ? intent.places[0] : !second ? intent.places[1] : null;
        if (missing) {
          addMessage({ sender: "ai", text: `I couldn't find a place called "${missing}". Try a city name.` });
          return;
        }
        setBusy("Reading satellite data...");
        const [firstValues, secondValues] = await Promise.all([sample(first!), sample(second!)]);
        addMessage({
          sender: "ai",
          text: composeCompare(first!.label, firstValues, second!.label, secondValues),
          source: SRC_POINT,
          actionLabel: `Fly to ${first!.name}`,
          onAction: () => {
            onSwitchLayer?.("lst");
            if (onFlyTo) onFlyTo(first!.lat, first!.lon, first!.name);
            else onDiveIn?.();
          },
        });
        return;
      }

      setBusy(`Looking up "${intent.place}"...`);
      const place = await geocode(intent.place);
      if (!place) {
        addMessage({ sender: "ai", text: `I couldn't find a place called "${intent.place}". Try a city name.` });
        return;
      }
      const flyToPlace = {
        actionLabel: `Fly to ${place.name}`,
        onAction: () => {
          onSwitchLayer?.("lst");
          if (onFlyTo) onFlyTo(place.lat, place.lon, place.name);
          else onDiveIn?.();
        },
      };

      setBusy("Reading satellite data...");
      if (intent.kind === "point") {
        addMessage({ sender: "ai", text: composePoint(place.label, await sample(place)), source: SRC_POINT, ...flyToPlace });
      } else if (intent.kind === "trend") {
        const result = await api(`/api/gee/series?lat=${place.lat}&lon=${place.lon}&months=24`);
        addMessage({ sender: "ai", text: composeTrend(place.label, result.series), source: SRC_TREND, ...flyToPlace });
      } else {
        const result = await api(`/api/gee/uhi?lat=${place.lat}&lon=${place.lon}`);
        addMessage({ sender: "ai", text: composeUhi(place.label, result), source: SRC_UHI, ...flyToPlace });
      }
    } catch (error) {
      addMessage({ sender: "ai", text: `I couldn't get the satellite data just now (${String(error instanceof Error ? error.message : error).slice(0, 120)}). I won't guess. Please try again.` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 font-mono">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mb-3 w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#04091f]/90 p-4 shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-[#2ee6c5] animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white">Ask the City · AI Copilot</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-xs text-slate-400 hover:text-white">✕</button>
            </div>

            {/* Chat Body */}
            <div className="my-3 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 text-xs">
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}>
                  <div className={`rounded-xl px-3 py-2 text-slate-200 leading-relaxed max-w-[88%] ${
                    m.sender === "user" ? "bg-[#2ee6c5]/20 border border-[#2ee6c5]/40 text-white" : "bg-white/5 border border-white/10"
                  }`}>
                    {m.text}
                    {m.source && <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] leading-snug text-slate-500">Source: {m.source}</div>}
                  </div>
                  {m.actionLabel && m.onAction && (
                    <button
                      onClick={m.onAction}
                      className="mt-1.5 rounded-lg border border-[#2ee6c5]/60 bg-[#2ee6c5]/10 px-2.5 py-1 text-[10px] font-semibold text-[#2ee6c5] transition hover:bg-[#2ee6c5] hover:text-[#02061a]"
                    >
                      ⚡ {m.actionLabel}
                    </button>
                  )}
                </div>
              ))}
              {busy && <div className="text-[10px] text-slate-500 animate-pulse">{busy}</div>}
            </div>

            {/* Presets */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((preset) => (
                <button
                  key={preset}
                  disabled={!!busy}
                  onClick={() => handleSend(preset)}
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-300 transition hover:border-[#2ee6c5]/50 hover:text-white disabled:opacity-40"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about a city..."
                className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#2ee6c5] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!!busy}
                className="rounded-xl bg-gradient-to-r from-[#2ee6c5] to-[#7dd3fc] px-3.5 py-2 text-xs font-bold text-[#02061a] transition hover:opacity-90"
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-2xl border border-[#2ee6c5]/40 bg-[#04091f]/90 px-4 py-3 text-xs font-bold text-white shadow-2xl backdrop-blur-xl transition hover:scale-105 hover:border-[#2ee6c5]"
        >
          <div className="h-2.5 w-2.5 rounded-full bg-[#2ee6c5] animate-pulse" />
          <span>Ask the satellite analyst</span>
        </button>
      )}
    </div>
  );
}
