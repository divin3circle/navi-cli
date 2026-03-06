"use client";

import { Hero } from "@/components/ui/animated-hero";
import { SparklesText } from "@/components/ui/sparkles-text";

export default function ConnectPage() {
  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-black overflow-hidden relative">
      {/* Cool subtle background effect utilizing SparklesText to set the vibe before Hero takes over */}
      <div className="absolute top-10 pointer-events-none opacity-50 blur-sm scale-150">
        <SparklesText text="GenSSH" colors={{ first: "#4c1d95", second: "#7c3aed" }} sparklesCount={5} />
      </div>
      
      <div className="relative z-10 w-full flex items-center justify-center">
        <Hero />
      </div>
    </div>
  );
}
