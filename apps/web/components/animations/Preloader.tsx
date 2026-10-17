"use client";
import { useEffect, useState } from "react";
import gsap from "gsap";

// Progress reflects real loading: fonts + any asset URLs you pass in.
export default function Preloader({ assets = [] as string[] }) {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const total = assets.length + 1; // +1 for fonts
    const bump = () => setPct(Math.round((++loaded / total) * 100));
    document.fonts.ready.then(bump);
    assets.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = bump;
      img.src = src;
    });
  }, [assets]);

  useEffect(() => {
    if (pct < 100) return;
    gsap.to("#preloader", {
      opacity: 0, duration: 0.6, delay: 0.3, onComplete: () => setDone(true),
    });
  }, [pct]);

  if (done) return null;
  return (
    <div id="preloader" className="fixed inset-0 z-[100] grid place-items-center bg-black">
      <div className="text-center">
        <div className="font-mono text-6xl tabular-nums text-[var(--accent)]">{pct}%</div>
        <div className="mt-3 font-mono text-xs tracking-[0.3em] opacity-60">ACQUIRING SIGNAL</div>
      </div>
    </div>
  );
}
