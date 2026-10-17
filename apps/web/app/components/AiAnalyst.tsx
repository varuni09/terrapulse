"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  id: string;
  sender: "user" | "ai";
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

interface AiAnalystProps {
  onSelectHotspot?: (cellId: string) => void;
  onDiveIn?: () => void;
  onSwitchLayer?: (layer: "lst" | "ndvi") => void;
}

export default function AiAnalyst({ onSelectHotspot, onDiveIn, onSwitchLayer }: AiAnalystProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "ai",
      text: "Hello! I'm your TerraPulse AI Spatial Analyst. Ask me about thermal anomalies, urban vegetation, or high-risk heat zones across Chennai.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const PRESET_QUERIES = [
    { label: "🔥 Find hottest cell", query: "Where is the highest surface temperature recording?" },
    { label: "🌱 Low vegetation zones", query: "Which area has the lowest NDVI rating?" },
    { label: "✈ Dive into Port/Industrial district", query: "Take me to the industrial port corridor." },
  ];

  const handleSend = (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), sender: "user", text: query };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setIsThinking(true);

    setTimeout(() => {
      let responseText = "Analyzing satellite telemetry and H3 cell grids...";
      let actionLabel: string | undefined = undefined;
      let actionFn: (() => void) | undefined = undefined;

      const q = query.toLowerCase();

      if (q.includes("thermal") || q.includes("temperature") || q.includes("hottest") || q.includes("heat")) {
        responseText = "The primary thermal anomaly is centered around H3 cell ...49b9fffff (North Port / Industrial Belt) peaking above 44 °C.";
        actionLabel = "Fly to Hottest Cell";
        actionFn = () => {
          onSwitchLayer?.("lst");
          onSelectHotspot?.("88618c49b9fffff");
        };
      } else if (q.includes("vegetation") || q.includes("ndvi") || q.includes("green") || q.includes("trees")) {
        responseText = "Vegetation density (NDVI < 0.20) is minimal along central urban corridors. Guindy National Reserve contains the densest green canopy cover.";
        actionLabel = "Switch to Vegetation Layer";
        actionFn = () => onSwitchLayer?.("ndvi");
      } else if (q.includes("industrial") || q.includes("port") || q.includes("take me") || q.includes("dive")) {
        responseText = "Navigating camera view to the North Port / Industrial Belt. High built-up density and exposed concrete contribute heavily to surface heat retention.";
        actionLabel = "Dive into Port Corridor";
        actionFn = () => {
          onDiveIn?.();
          onSelectHotspot?.("88618c49b9fffff");
        };
      } else {
        responseText = `Ingested telemetry query for "${query}". Thermal divergence correlates directly with impervious surface ratio and low canopy fraction.`;
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: responseText,
        actionLabel,
        onAction: actionFn,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 800);
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
                  <div
                    className={`rounded-xl px-3 py-2 text-slate-200 leading-relaxed max-w-[85%] ${
                      m.sender === "user" ? "bg-[#2ee6c5]/20 border border-[#2ee6c5]/40 text-white" : "bg-white/5 border border-white/10"
                    }`}
                  >
                    {m.text}
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
              {isThinking && (
                <div className="text-[10px] text-slate-500 animate-pulse">Evaluating Landsat 8/9 telemetry & spatial cells...</div>
              )}
            </div>

            {/* Presets */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p.query)}
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-300 transition hover:border-[#2ee6c5]/50 hover:text-white"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about spatial heat risk..."
                className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#2ee6c5] focus:outline-none"
              />
              <button
                type="submit"
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
          <span>Ask the City AI</span>
        </button>
      )}
    </div>
  );
}
