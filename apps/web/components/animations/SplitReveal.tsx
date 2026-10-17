"use client";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export default function SplitReveal({
  text, className = "", delay = 1.2,
}: { text: string; className?: string; delay?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(".word-inner", { yPercent: 110, duration: 1, ease: "power4.out", stagger: 0.06, delay });
  }, { scope: ref });

  return (
    <h1 ref={ref} className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="mr-[0.25em] inline-block overflow-hidden align-bottom">
          <span className="word-inner inline-block">{w}</span>
        </span>
      ))}
    </h1>
  );
}
