/**
 * Map mobile agent slugs to the matching Fortress ai_agents row UUID.
 *
 * The Fortress agent_conversations table is keyed by `agent_id` (UUID, NOT NULL),
 * so every conversation we create from mobile must use a real Fortress agent UUID.
 * When mobile and Fortress write/read the same agent_id, chat history is
 * automatically shared between platforms.
 *
 * Resolution order in `resolveFortressAgentId`:
 *   1. If the input already looks like a UUID, pass it through unchanged.
 *   2. Otherwise look up the slug in this map.
 *   3. Fallback: AEGIS-CMD (so we never insert a null/invalid agent_id).
 */

const SLUG_TO_FORTRESS_UUID: Record<string, string> = {
  aegis:    "c40a45b2-b285-4b55-a4df-35fa8c3cfa18", // AEGIS-CMD — Fortress Framework Protocol Execution
  sentinel: "65ae06b3-3990-4e6e-b8a1-c05dc74d3ed0", // AUTO-SENT — Automated Threat Monitoring
  osint:    "eca2452b-7ea5-478e-ac34-fd103df7a754", // ECHO-WATCH — Social Engineering Detection / OSINT
  monitor:  "b304c547-ab87-41a6-805c-e65330ee0f05", // MATRIX — Pattern detection / behavioral analysis
  wraith:   "5b4915c2-950e-4f97-91e6-66b2cfbfa8a7", // WRAITH — Offensive Security / Ethical Hacking
};

const AEGIS_CMD_UUID = "c40a45b2-b285-4b55-a4df-35fa8c3cfa18";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function resolveFortressAgentId(input: string | null | undefined): string {
  if (!input) return AEGIS_CMD_UUID;
  if (isUuid(input)) return input;
  const mapped = SLUG_TO_FORTRESS_UUID[input.toLowerCase()];
  return mapped ?? AEGIS_CMD_UUID;
}

export const AEGIS_FORTRESS_AGENT_ID = AEGIS_CMD_UUID;
