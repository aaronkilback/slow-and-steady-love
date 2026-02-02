import { useParams, useNavigate } from "react-router-dom";
import { AgentChatView } from "@/components/aegis/AgentChatView";

export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  return (
    <AgentChatView 
      agentId={agentId || "aegis"} 
      onBack={() => navigate("/agents")}
    />
  );
}
