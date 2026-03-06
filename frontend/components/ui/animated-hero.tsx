import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MoveRight, Loader2, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SparklesText } from "./sparkles-text";
import { useRouter } from "next/navigation";
import { useRelay } from "@/hooks/useRelay";

function Hero() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["intelligent", "native", "direct", "secure", "live"],
    []
  );

  const router = useRouter();
  const [agentOnline, setAgentOnline] = useState(false);
  const { status: relayStatus } = useRelay({
    relayUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:3001",
    userId: "demo-user-123",
    onAgentStatus: (online) => setAgentOnline(online)
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-20 lg:py-40 items-center justify-center flex-col">
          <div>
            <Button variant="secondary" size="sm" className="gap-4 font-mono">
               <Terminal className="w-4 h-4 text-violet-400" />
               <span className="text-muted-foreground">{relayStatus === 'connected' ? 'Relay Active' : 'Connecting to Relay...'}</span> 
            </Button>
          </div>
          <div className="flex gap-4 flex-col items-center">
            
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span className="text-foreground">Agent control is</span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-semibold text-violet-500"
                    initial={{ opacity: 0, y: "-100" }}
                    transition={{ type: "spring", stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? {
                            y: 0,
                            opacity: 1,
                          }
                        : {
                            y: titleNumber > index ? -150 : 150,
                            opacity: 0,
                          }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>

            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center">
              Manage your servers with natural voice. Direct local execution via WebSockets and Gemini Flash 2.0. No open inbound ports required.
            </p>
          </div>
          <div className="flex flex-row gap-3 pt-6">
            <Button 
              size="lg" 
              className="gap-4 px-8" 
              variant="default"
              onClick={() => router.push('/dashboard')}
              disabled={relayStatus !== 'connected'}
            >
              {relayStatus !== 'connected' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for Cloud Relay</>
              ) : agentOnline ? (
                 <>Enter Command Center <Sparkles className="w-4 h-4" /></>
              ) : (
                <>Setup & Connect Agent <MoveRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Hero };
