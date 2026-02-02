-- Add agent_id column to track which agent the conversation is with
ALTER TABLE public.aegis_conversations 
ADD COLUMN IF NOT EXISTS agent_id text DEFAULT 'aegis';

-- Add agent_id to messages for filtering
ALTER TABLE public.aegis_messages
ADD COLUMN IF NOT EXISTS agent_id text DEFAULT 'aegis';

-- Create index for efficient agent-based queries
CREATE INDEX IF NOT EXISTS idx_aegis_conversations_agent 
ON public.aegis_conversations(user_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_aegis_messages_agent 
ON public.aegis_messages(conversation_id, agent_id);