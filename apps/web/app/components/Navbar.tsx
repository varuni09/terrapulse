"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "EXPLORE", href: "/explore" },
    { name: "INSIGHTS", href: "/insights" },
    { name: "SCENARIOS", href: "/scenarios" },
    { name: "ABOUT", href: "/about" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#02061a]/80 backdrop-blur-md border-b border-slate-800/60 font-mono text-xs">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-extrabold tracking-widest text-white text-sm hover:text-[#2ee6c5] transition-colors">
          TERRAPULSE
        </Link>
        <nav className="flex items-center gap-6 md:gap-8">
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
      </div>
    </header>
  );
}
