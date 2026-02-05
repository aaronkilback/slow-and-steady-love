import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TravelReportsList } from "./TravelReportsList";
import { GenerateBriefingForm } from "./GenerateBriefingForm";
import { UploadReportForm } from "./UploadReportForm";
import { FileText, Sparkles, Upload } from "lucide-react";

export function TravelReportsHub() {
  const [activeTab, setActiveTab] = useState("reports");

  return (
    <div className="flex flex-col h-full bg-background">
      <PageHeader title="Travel Risk Intelligence" />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 border-b border-border">
          <TabsList className="w-full grid grid-cols-3 h-12 bg-transparent">
            <TabsTrigger 
              value="reports" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Reports</span>
            </TabsTrigger>
            <TabsTrigger 
              value="generate" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Generate</span>
            </TabsTrigger>
            <TabsTrigger 
              value="upload" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-2"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="reports" className="h-full m-0">
            <TravelReportsList />
          </TabsContent>
          
          <TabsContent value="generate" className="h-full m-0">
            <GenerateBriefingForm onSuccess={() => setActiveTab("reports")} />
          </TabsContent>
          
          <TabsContent value="upload" className="h-full m-0">
            <UploadReportForm onSuccess={() => setActiveTab("reports")} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
