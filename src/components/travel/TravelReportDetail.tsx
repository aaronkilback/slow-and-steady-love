import { TravelRiskReport } from "@/hooks/useTravelReports";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  ArrowLeft, 
  Calendar, 
  Car, 
  Hotel, 
  MapPin, 
  Phone, 
  Shield,
  Sparkles,
  Upload
} from "lucide-react";

interface TravelReportDetailProps {
  report: TravelRiskReport;
  onBack: () => void;
}

const riskColors: Record<string, string> = {
  insignificant: "bg-green-500/20 text-green-400 border-green-500/30",
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function TravelReportDetail({ report, onBack }: TravelReportDetailProps) {
  const parsedContent = report.parsed_content as Record<string, any> | null;
  const emergencyContacts = report.emergency_contacts as Record<string, string> | null;
  const areasOfConcern = report.areas_of_concern as { areas?: string[] } | null;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Reports
        </Button>

        {/* Header */}
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3" />
                  {report.location}
                </div>
              </div>
              {report.risk_rating && (
                <Badge 
                  variant="outline" 
                  className={riskColors[report.risk_rating] || ""}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {report.risk_rating.toUpperCase()} RISK
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                {report.source === "generated" ? (
                  <Sparkles className="h-3 w-3" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {report.source === "generated" ? "AI Generated" :
                 report.source === "isos" ? "International SOS" :
                 report.source === "control_risks" ? "Control Risks" :
                 "Uploaded"}
              </div>
              {report.report_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(report.report_date).toLocaleDateString()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Topline Advice */}
        {report.topline_advice && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <p className="text-sm font-medium">{report.topline_advice}</p>
            </CardContent>
          </Card>
        )}

        {/* Key Risks */}
        {report.key_risks && report.key_risks.length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Key Security Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {report.key_risks.map((risk, i) => (
                  <Badge key={i} variant="secondary">{risk}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Latest Developments */}
        {parsedContent?.latestDevelopments && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Latest Developments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {parsedContent.latestDevelopments}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Security Risks */}
        {parsedContent?.securityRisks && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Security Risk Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(parsedContent.securityRisks).map(([key, value]) => (
                value && (
                  <div key={key}>
                    <h4 className="font-medium text-sm capitalize mb-1">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </h4>
                    <p className="text-xs text-muted-foreground">{value as string}</p>
                  </div>
                )
              ))}
            </CardContent>
          </Card>
        )}

        {/* Transportation */}
        {report.transportation_notes && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Car className="h-4 w-4" />
                Transportation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{report.transportation_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Accommodation */}
        {report.accommodation_notes && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hotel className="h-4 w-4" />
                Accommodation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{report.accommodation_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Emergency Contacts */}
        {emergencyContacts && Object.keys(emergencyContacts).length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Emergency Contacts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(emergencyContacts).map(([key, value]) => (
                  value && (
                    <div key={key}>
                      <span className="text-muted-foreground capitalize">{key}: </span>
                      <span className="font-mono">{value}</span>
                    </div>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Areas of Concern */}
        {areasOfConcern?.areas && areasOfConcern.areas.length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Areas of Concern</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                {areasOfConcern.areas.map((area, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-1 text-yellow-500" />
                    {area}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* General Advice */}
        {parsedContent?.generalAdvice && parsedContent.generalAdvice.length > 0 && (
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Security Advice</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                {(parsedContent.generalAdvice as string[]).map((advice, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {advice}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
