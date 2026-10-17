"use client";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen place-items-center font-mono text-xs uppercase tracking-widest opacity-60">
      Loading map…
    </div>
  ),
});

export default function ExploreClient() { return <MapView />; }
