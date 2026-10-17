export default function HudFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const corner = "absolute h-6 w-6 border-[var(--accent)]";
  return (
    <div className={`relative ${className}`}>
      <span className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
      {children}
    </div>
  );
}
