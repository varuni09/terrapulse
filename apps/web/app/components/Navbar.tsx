"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTerraPulseStore } from "@/lib/store";

export default function Navbar() {
  const pathname = usePathname();
  const { selectedCity, setSelectedCity } = useTerraPulseStore();

  const navItems = [
    { name: "EXPLORE", href: "/explore" },
    { name: "INSIGHTS", href: "/insights" },
    { name: "SCENARIOS", href: "/scenarios" },
    { name: "DECISION TOOL", href: "/decision" },
    { name: "ABOUT", href: "/about" },
  ];

  const CITIES = ["Chennai", "Delhi", "Tokyo", "Cairo", "New York"];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#02061a]/80 backdrop-blur-md border-b border-slate-800/60 font-mono text-xs">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-extrabold tracking-widest text-white text-sm hover:text-[#2ee6c5] transition-colors">
          TERRAPULSE
        </Link>

        <nav className="flex items-center gap-5 md:gap-7">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors tracking-wider ${
                  active ? "text-[#2ee6c5] font-bold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Dynamic Global City Selector */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase">City:</span>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-slate-200 text-[11px] outline-none focus:border-[#2ee6c5] cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}