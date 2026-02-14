
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own conversations" ON public.aegis_conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.aegis_conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.aegis_conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.aegis_conversations;
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.aegis_messages;
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.aegis_messages;

-- Create permissive policies since auth is handled by external Fortress platform
CREATE POLICY "Allow all select on aegis_conversations" ON public.aegis_conversations FOR SELECT USING (true);
CREATE POLICY "Allow all insert on aegis_conversations" ON public.aegis_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on aegis_conversations" ON public.aegis_conversations FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on aegis_conversations" ON public.aegis_conversations FOR DELETE USING (true);

CREATE POLICY "Allow all select on aegis_messages" ON public.aegis_messages FOR SELECT USING (true);
CREATE POLICY "Allow all insert on aegis_messages" ON public.aegis_messages FOR INSERT WITH CHECK (true);
