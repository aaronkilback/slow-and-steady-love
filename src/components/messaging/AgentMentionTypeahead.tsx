import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MentionableAgent {
  id: string;          // Fortress ai_agents.id (UUID)
  call_sign: string;   // e.g. AEGIS-CMD
  short_specialty: string; // 1-2 word display
}

interface AgentMentionTypeaheadProps {
  /** Free text after the trailing `@` (case-insensitive). Empty string = show all. */
  query: string;
  agents: MentionableAgent[];
  onSelect: (agent: MentionableAgent) => void;
  onClose: () => void;
}

export interface AgentMentionTypeaheadHandle {
  /** Called from the input's onKeyDown — returns true if the key was consumed. */
  handleKey: (e: React.KeyboardEvent) => boolean;
}

/**
 * Floating list shown above the message input when the operator types
 * `@` in a conversation. Each row: bot icon, call_sign, 1-2 word
 * specialty. Filters as the operator continues typing. Returns the
 * selected agent's UUID (which is the Fortress ai_agents.id) so the
 * mention is unambiguous on the wire.
 *
 * Supports keyboard navigation when the parent forwards key events
 * via the imperative `handleKey` API:
 *   ArrowUp / ArrowDown — move highlight
 *   Enter / Tab          — select highlighted agent
 *   Escape               — close popover
 */
export const AgentMentionTypeahead = forwardRef<AgentMentionTypeaheadHandle, AgentMentionTypeaheadProps>(
  function AgentMentionTypeahead({ query, agents, onSelect, onClose }, ref) {
    const listRef = useRef<HTMLDivElement>(null);
    const [highlight, setHighlight] = useState(0);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return agents.slice(0, 8);
      return agents
        .filter(
          (a) =>
            a.call_sign.toLowerCase().includes(q) ||
            a.short_specialty.toLowerCase().includes(q)
        )
        .slice(0, 8);
    }, [query, agents]);

    // Reset highlight when filter changes
    useEffect(() => {
      setHighlight(0);
    }, [query]);

    // Close on outside click
    useEffect(() => {
      function handler(e: MouseEvent) {
        if (!listRef.current) return;
        if (!listRef.current.contains(e.target as Node)) onClose();
      }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    useImperativeHandle(
      ref,
      () => ({
        handleKey: (e: React.KeyboardEvent) => {
          if (filtered.length === 0) return false;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % filtered.length);
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
            return true;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            onSelect(filtered[highlight]);
            return true;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return true;
          }
          return false;
        },
      }),
      [filtered, highlight, onSelect, onClose]
    );

    if (filtered.length === 0) return null;

    return (
      <div
        ref={listRef}
        className={cn(
          "absolute bottom-full mb-2 left-4 right-4 z-50",
          "rounded-lg border border-border bg-card shadow-lg overflow-hidden"
        )}
      >
        <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-card/60 flex items-center justify-between">
          <span>Mention an agent</span>
          <span className="text-[10px] normal-case tracking-normal opacity-60">↑↓ Enter</span>
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "w-full px-3 py-2 flex items-center gap-3 transition-colors text-left",
                i === highlight ? "bg-accent/60" : "hover:bg-accent/40"
              )}
              type="button"
            >
              <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{agent.call_sign}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {agent.short_specialty}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

/**
 * Compact a Fortress agent specialty string into 1-2 words for display
 * in the typeahead. Heuristic: take the first comma-separated phrase,
 * trim, cap at ~22 chars.
 */
export function shortenSpecialty(specialty: string | null | undefined): string {
  if (!specialty) return "Specialist";
  const first = specialty.split(/[,.]/)[0].trim();
  return first.length > 26 ? first.slice(0, 24) + "…" : first;
}
