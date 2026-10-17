"use client";
import dynamic from "next/dynamic";

const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => <div className="globe-stub spin-slow mx-auto mt-[10vh] h-[50vmin] w-[50vmin] rounded-full opacity-60" />,
});

export default function GlobeClient() {
  return <Globe />;
}
