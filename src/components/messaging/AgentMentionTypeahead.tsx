import { useEffect, useMemo, useRef } from "react";
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

/**
 * Floating list shown above the message input when the operator types
 * `@` in a conversation. Each row: bot icon, call_sign, 1-2 word
 * specialty. Filters as the operator continues typing. Returns the
 * selected agent's UUID (which is the Fortress ai_agents.id) so the
 * mention is unambiguous on the wire.
 */
export function AgentMentionTypeahead({
  query,
  agents,
  onSelect,
  onClose,
}: AgentMentionTypeaheadProps) {
  const listRef = useRef<HTMLDivElement>(null);

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

  // Close when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!listRef.current) return;
      if (!listRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        "absolute bottom-full mb-2 left-4 right-4 z-50",
        "rounded-lg border border-border bg-card shadow-lg overflow-hidden"
      )}
    >
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-card/60">
        Mention an agent
      </div>
      <div className="max-h-56 overflow-y-auto">
        {filtered.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-accent/40 transition-colors text-left"
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
