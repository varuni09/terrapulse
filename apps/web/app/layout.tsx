import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Preloader from "@/components/animations/Preloader";
import SmoothScroll from "@/components/animations/SmoothScroll";
import Nav from "@/components/ui/Nav";

const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TERRAPULSE — Urban environmental intelligence",
  description: "Explore urban heat and land-cover change from satellite data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Preloader assets={["/textures/earth.jpg"]} />
        <Nav />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
