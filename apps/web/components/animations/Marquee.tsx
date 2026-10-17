export default function Marquee({ text = "TERRAPULSE" }: { text?: string }) {
  const row = Array.from({ length: 6 }, (_, i) => (
    <span key={i} className="px-8 text-[12vw] font-bold leading-none tracking-tight text-transparent [-webkit-text-stroke:1px_var(--line)]">
      {text}
    </span>
  ));
  return (
    <div className="overflow-hidden py-10" aria-hidden>
      <div className="marquee-track">{row}{row}</div>
    </div>
  );
}
