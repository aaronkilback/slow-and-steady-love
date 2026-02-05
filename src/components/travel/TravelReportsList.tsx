import { useState } from "react";
import { useTravelReports, TravelRiskReport } from "@/hooks/useTravelReports";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  Calendar, 
  ChevronRight, 
  FileText, 
  MapPin, 
  Shield, 
  Sparkles, 
  Trash2, 
  Upload 
} from "lucide-react";
import { TravelReportDetail } from "./TravelReportDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const riskColors: Record<string, string> = {
  insignificant: "bg-green-500/20 text-green-400 border-green-500/30",
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-400 border-red-500/30",
};

const sourceIcons: Record<string, React.ReactNode> = {
  generated: <Sparkles className="h-3 w-3" />,
  user_upload: <Upload className="h-3 w-3" />,
  isos: <Shield className="h-3 w-3" />,
  control_risks: <Shield className="h-3 w-3" />,
};

export function TravelReportsList() {
  const { reports, isLoading, deleteReport, isDeleting } = useTravelReports();
  const [selectedReport, setSelectedReport] = useState<TravelRiskReport | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-3" />
              <Skeleton className="h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No Travel Reports</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Generate AI-powered security briefings or upload reports from International SOS, Control Risks, and other providers.
        </p>
      </div>
    );
  }

  if (selectedReport) {
    return (
      <TravelReportDetail 
        report={selectedReport} 
        onBack={() => setSelectedReport(null)} 
      />
    );
  }

  const handleDelete = async () => {
    if (deleteConfirm) {
      await deleteReport(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          {reports.map((report) => (
            <Card 
              key={report.id} 
              className="bg-card/50 hover:bg-card/80 transition-colors cursor-pointer group"
              onClick={() => setSelectedReport(report)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate mb-1">{report.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{report.location}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {report.risk_rating && (
                        <Badge 
                          variant="outline" 
                          className={riskColors[report.risk_rating] || ""}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {report.risk_rating.toUpperCase()}
                        </Badge>
                      )}
                      
                      <Badge variant="outline" className="gap-1">
                        {sourceIcons[report.source] || <FileText className="h-3 w-3" />}
                        {report.source === "generated" ? "AI Generated" : 
                         report.source === "isos" ? "ISOS" :
                         report.source === "control_risks" ? "Control Risks" :
                         "Uploaded"}
                      </Badge>
                      
                      {report.report_date && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(report.report_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(report.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this travel report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
