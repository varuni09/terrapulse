import Link from "next/link";

const links = [
  ["Discover", "/discover"], ["Explore", "/explore"], ["Insights", "/insights"],
  ["Scenarios", "/scenarios"], ["About", "/about"],
];

export default function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-sm">
      <Link href="/discover" className="font-mono text-sm tracking-[0.3em]">TERRAPULSE</Link>
      <ul className="hidden gap-6 font-mono text-xs uppercase tracking-widest md:flex">
        {links.map(([name, href]) => (
          <li key={href}><Link href={href} className="opacity-70 transition hover:opacity-100 hover:text-[var(--accent)]">{name}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
