import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTravelReports, GeneratedBriefing } from "@/hooks/useTravelReports";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Loader2, 
  MapPin, 
  Sparkles, 
  Save,
  Phone,
  Car,
  Hotel,
  Shield,
  ArrowLeft
} from "lucide-react";

interface GenerateBriefingFormProps {
  onSuccess?: () => void;
}

const riskColors: Record<string, string> = {
  insignificant: "bg-green-500/20 text-green-400 border-green-500/30",
  low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  extreme: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function GenerateBriefingForm({ onSuccess }: GenerateBriefingFormProps) {
  const { user } = useAuth();
  const { generateBriefing, isGenerating, saveBriefing, isSaving } = useTravelReports();
  
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [travelDates, setTravelDates] = useState("");
  const [purpose, setPurpose] = useState("");
  const [generatedBriefing, setGeneratedBriefing] = useState<GeneratedBriefing | null>(null);

  const handleGenerate = async () => {
    if (!location || !country) return;
    
    try {
      const result = await generateBriefing({
        location,
        country,
        travelDates: travelDates || undefined,
        purpose: purpose || undefined,
      });
      setGeneratedBriefing(result.briefing);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleSave = async () => {
    if (!generatedBriefing || !user) return;
    
    try {
      await saveBriefing({
        briefing: generatedBriefing,
        userId: user.id,
      });
      setGeneratedBriefing(null);
      setLocation("");
      setCountry("");
      setTravelDates("");
      setPurpose("");
      onSuccess?.();
    } catch (error) {
      // Error handled by hook
    }
  };

  if (generatedBriefing) {
    return (
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setGeneratedBriefing(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Briefing
            </Button>
          </div>

          {/* Header */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <CardTitle>{generatedBriefing.location}</CardTitle>
                </div>
                <Badge 
                  variant="outline" 
                  className={riskColors[generatedBriefing.riskRating?.toLowerCase()] || ""}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {generatedBriefing.riskRating?.toUpperCase()} RISK
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{generatedBriefing.toplineAdvice}</p>
            </CardContent>
          </Card>

          {/* Key Risks */}
          {generatedBriefing.keyRisks?.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Key Security Risks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {generatedBriefing.keyRisks.map((risk, i) => (
                    <Badge key={i} variant="secondary">{risk}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Latest Developments */}
          {generatedBriefing.latestDevelopments && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Latest Developments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {generatedBriefing.latestDevelopments}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Security Risks */}
          {generatedBriefing.securityRisks && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Security Risk Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(generatedBriefing.securityRisks).map(([key, value]) => (
                  value && (
                    <div key={key}>
                      <h4 className="font-medium text-sm capitalize mb-1">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </h4>
                      <p className="text-xs text-muted-foreground">{value}</p>
                    </div>
                  )
                ))}
              </CardContent>
            </Card>
          )}

          {/* Transportation */}
          {generatedBriefing.transportation && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Transportation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{generatedBriefing.transportation}</p>
              </CardContent>
            </Card>
          )}

          {/* Accommodation */}
          {generatedBriefing.accommodation && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hotel className="h-4 w-4" />
                  Accommodation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{generatedBriefing.accommodation}</p>
              </CardContent>
            </Card>
          )}

          {/* Emergency Contacts */}
          {generatedBriefing.emergencyContacts && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Emergency Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(generatedBriefing.emergencyContacts).map(([key, value]) => (
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
          {generatedBriefing.areasOfConcern?.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Areas of Concern</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {generatedBriefing.areasOfConcern.map((area, i) => (
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
          {generatedBriefing.generalAdvice?.length > 0 && (
            <Card className="bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Security Advice</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  {generatedBriefing.generalAdvice.map((advice, i) => (
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

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <div className="text-center pb-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-medium">Generate Security Briefing</h2>
          <p className="text-sm text-muted-foreground">
            Create an ISOS-style travel risk briefing using real-time intelligence
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">City / Location *</Label>
              <Input
                id="location"
                placeholder="e.g., Kuala Lumpur"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                placeholder="e.g., Malaysia"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dates">Travel Dates (optional)</Label>
            <Input
              id="dates"
              placeholder="e.g., March 15-22, 2026"
              value={travelDates}
              onChange={(e) => setTravelDates(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose">Travel Purpose (optional)</Label>
            <Textarea
              id="purpose"
              placeholder="e.g., Business meetings, executive travel, site visit..."
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
            />
          </div>

          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !location || !country}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Briefing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Security Briefing
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Powered by real-time intelligence from global news and security sources
        </div>
      </div>
    </ScrollArea>
  );
}
