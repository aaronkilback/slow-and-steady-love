import { PageHeader } from "@/components/layout/PageHeader";
import { AgentDirectory } from "@/components/agents/AgentDirectory";

export default function AgentsPage() {
  return (
    <div className="flex flex-col">
      <PageHeader 
        title="Agent Directory" 
        subtitle="Specialized AI & human operators"
      />
      <AgentDirectory />
    </div>
  );
}
