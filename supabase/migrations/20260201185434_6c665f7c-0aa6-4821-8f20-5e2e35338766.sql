-- Fix the overly permissive INSERT policy on conversations
-- Users should only create conversations where they are a participant
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

-- Create a function to handle conversation creation with initial participants
CREATE OR REPLACE FUNCTION public.create_conversation_with_participant(
  _name TEXT DEFAULT NULL,
  _is_group BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id UUID;
BEGIN
  -- Create the conversation
  INSERT INTO public.conversations (name, is_group)
  VALUES (_name, _is_group)
  RETURNING id INTO _conversation_id;
  
  -- Add the creator as a participant
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (_conversation_id, auth.uid());
  
  RETURN _conversation_id;
END;
$$;

-- Update the join policy to be more restrictive
-- Users can only add themselves if invited or creating
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

CREATE POLICY "Creator adds themselves on creation" ON public.conversation_participants
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND (
      -- Allow if no participants yet (creator)
      NOT EXISTS (
        SELECT 1 FROM public.conversation_participants cp 
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
      OR
      -- Allow admins to add anyone
      public.is_admin(auth.uid())
      OR
      -- Allow existing participants to invite others
      public.is_conversation_participant(conversation_participants.conversation_id, auth.uid())
    )
  );