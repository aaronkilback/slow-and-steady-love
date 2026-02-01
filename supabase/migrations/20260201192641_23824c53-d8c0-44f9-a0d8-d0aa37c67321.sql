-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for AI conversation sessions
CREATE TABLE public.aegis_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for AI messages
CREATE TABLE public.aegis_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.aegis_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aegis_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for aegis_conversations
CREATE POLICY "Users can view own conversations"
ON public.aegis_conversations FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own conversations"
ON public.aegis_conversations FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversations"
ON public.aegis_conversations FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations"
ON public.aegis_conversations FOR DELETE
USING (user_id = auth.uid());

-- RLS policies for aegis_messages
CREATE POLICY "Users can view messages in own conversations"
ON public.aegis_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.aegis_conversations
  WHERE id = aegis_messages.conversation_id AND user_id = auth.uid()
));

CREATE POLICY "Users can create messages in own conversations"
ON public.aegis_messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.aegis_conversations
  WHERE id = aegis_messages.conversation_id AND user_id = auth.uid()
));

-- Trigger for updated_at
CREATE TRIGGER update_aegis_conversations_updated_at
BEFORE UPDATE ON public.aegis_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.aegis_messages;