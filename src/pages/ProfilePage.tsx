import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileSettings } from "@/components/profile/ProfileSettings";

export default function ProfilePage() {
  return (
    <div className="flex flex-col">
      <PageHeader 
        title="Profile" 
        subtitle="Settings & account"
      />
      <ProfileSettings />
    </div>
  );
}
