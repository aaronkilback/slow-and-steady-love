import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AegisChat } from "@/components/aegis/AegisChat";
import { cn } from "@/lib/utils";

interface FloatingAegisProps {
  className?: string;
}

export function FloatingAegis({ className }: FloatingAegisProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={cn(
              "fixed bottom-24 right-4 z-40",
              className
            )}
          >
            <Button
              size="icon"
              onClick={() => setIsOpen(true)}
              className="h-14 w-14 rounded-full shadow-lg glow-cyan bg-primary hover:bg-primary/90"
            >
              <Shield className="h-6 w-6" />
            </Button>
            
            {/* Pulse animation */}
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aegis chat sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] p-0 rounded-t-2xl"
        >
          <div className="relative h-full">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="absolute right-2 top-2 z-10"
            >
              <X className="h-5 w-5" />
            </Button>
            <AegisChat />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
