"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Terminal, Activity, Server, ShieldCheck, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AIVoiceInput } from "@/components/ui/ai-voice-input";
import { useVoice } from "@/hooks/useVoice";
import { useRelay } from "@/hooks/useRelay";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";

export default function VoiceCommandCenter() {
  const [logs, setLogs] = useState<{ id: string; type: "user" | "agent" | "system"; text: string }[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Add log helper
  const addLog = (type: "user" | "agent" | "system", text: string) => {
    if (!text) return;
    setLogs((prev) => [...prev, { id: Math.random().toString(36).substr(2, 9), type, text }]);
  };

  const { playChunk, stopAll, initAudio } = useAudioPlayback();

  const [wsUrl, setWsUrl] = useState("ws://localhost:3000/ws");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      setWsUrl(`${protocol}//${window.location.host}/ws`);
    }
  }, []);

  // 1. Setup Relay Connection
  const { status: relayStatus, sendMessage } = useRelay({
    relayUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL || wsUrl,
    userId: "local-user", // Since runs local, auth isn't deeply necessary but keeping ID format
    onAgentStatus: (online) => {
      setAgentOnline(online);
      if (online) {
        addLog("system", "Direct connection to GenSSH agent established.");
      } else {
        addLog("system", "GenSSH agent disconnected.");
      }
    },
    onMessage: (msg) => {
      if (msg.type === "text_response") {
        addLog("agent", msg.payload.text);
      } else if (msg.type === "audio_response") {
        playChunk(msg.payload.audioBase64);
      } else if (msg.type === "interrupted") {
        stopAll();
      } else if (msg.type === "execution_result") {
        addLog("system", `Executed: ${msg.payload.command}\n${msg.payload.output}`);
      } else if (msg.type === "error") {
        addLog("system", `ERROR: ${msg.message}`);
      }
    }
  });

  // 2. Setup Voice Capture
  const { 
    isRecording, 
    startRecording, 
    stopRecording, 
    decibels,
    error: voiceError
  } = useVoice({
    chunkIntervalMs: 250,
    onAudioChunk: (base64Chunk) => {
      if (relayStatus === "connected" && agentOnline) {
        sendMessage({
          type: "audio_chunk",
          payload: { audioBase64: base64Chunk }
        });
      }
    }
  });

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (voiceError) {
      addLog("system", `Mic Error: ${voiceError}`);
    }
  }, [voiceError]);

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">GenSSH</h1>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={relayStatus === "connected" ? "default" : "destructive"} className="gap-1.5 flex items-center">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${relayStatus === "connected" ? "bg-primary" : "bg-destructive"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${relayStatus === "connected" ? "bg-primary" : "bg-destructive"}`}></span>
            </span>
            Relay Server
          </Badge>
          
          <Badge variant={agentOnline ? "default" : "secondary"} className="gap-1.5 flex items-center">
             <Server className="h-3 w-3" />
             {agentOnline ? "Agent Online" : "Agent Offline"}
          </Badge>

          <Button variant="outline" size="sm" className="hidden md:flex gap-2">
             <ShieldCheck className="h-4 w-4 text-green-500" />
             E2E Encrypted Bridge
          </Button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Command & Control */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card className="border-border bg-card/50 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity className="h-5 w-5 text-primary" />
                Live Command Center
              </CardTitle>
              <CardDescription>
                Hold to issue voice commands directly to your secure server.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-8">
               
              <div onClick={() => initAudio()} className="cursor-pointer">
                <AIVoiceInput
                  onStart={startRecording}
                  onStop={stopRecording}
                  disabled={relayStatus !== "connected" || !agentOnline}
                  visualizerBars={24}
                />
              </div>

              {!agentOnline && (
                <div className="text-center space-y-2 p-4 bg-muted/30 rounded-lg border border-border">
                  <Power className="h-5 w-5 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for GenSSH agent to connect. Run <code className="bg-background px-1 py-0.5 rounded border">genssh start</code> locally.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Terminal Logs */}
        <div className="lg:col-span-2 h-full flex flex-col">
          <Card className="border-border bg-[#0a0a0a] flex-1 flex flex-col shadow-2xl overflow-hidden font-mono">
            <CardHeader className="border-b border-border/50 bg-black/40 py-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80"></div>
                <div className="h-3 w-3 rounded-full bg-yellow-500/80"></div>
                <div className="h-3 w-3 rounded-full bg-green-500/80"></div>
                <span className="ml-2 text-xs text-muted-foreground font-sans font-medium uppercase tracking-wider">Terminal Output</span>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative">
              <ScrollArea className="h-[600px] w-full" ref={scrollRef}>
                <div className="p-6 space-y-4">
                  {logs.length === 0 ? (
                     <div className="text-muted-foreground/50 italic">System initialized. Awaiting commands...</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="text-sm leading-relaxed whitespace-pre-wrap">
                        {log.type === "system" && (
                           <span className="text-emerald-500 font-bold">[sys] </span>
                        )}
                        {log.type === "user" && (
                           <span className="text-purple-400 font-bold">[cmd] </span>
                        )}
                        {log.type === "agent" && (
                           <span className="text-blue-400 font-bold">[agent] </span>
                        )}
                        <span className={log.type === "system" ? "text-emerald-500/80" : "text-gray-300"}>
                          {log.text}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {/* Scanline effect layer */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20"></div>
            </CardContent>
          </Card>
        </div>

      </div>
    </main>
  );
}