import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AgentChatView } from "@/components/aegis/AgentChatView";

export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!agentId) navigate("/agents", { replace: true });
  }, [agentId, navigate]);

  if (!agentId) return null;

  return (
    <AgentChatView 
      agentId={agentId} 
      onBack={() => navigate("/agents")}
    />
  );
}
