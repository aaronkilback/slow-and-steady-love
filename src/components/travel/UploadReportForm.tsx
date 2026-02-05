import { useState, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTravelReports } from "@/hooks/useTravelReports";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  Loader2, 
  Upload, 
  X,
  Shield
} from "lucide-react";

interface UploadReportFormProps {
  onSuccess?: () => void;
}

export function UploadReportForm({ onSuccess }: UploadReportFormProps) {
  const { user } = useAuth();
  const { uploadReport, isUploading } = useTravelReports();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [source, setSource] = useState("user_upload");
  const [mode, setMode] = useState<"file" | "text">("file");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // If it's a text file, try to read content
      if (selectedFile.type === "text/plain" || selectedFile.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setTextContent(event.target?.result as string || "");
        };
        reader.readAsText(selectedFile);
      }
    }
  };

  const handleUpload = async () => {
    if (!user) return;
    
    if (mode === "text" && textContent.trim().length < 100) {
      return;
    }

    if (mode === "file" && !file) {
      return;
    }

    try {
      // For file mode, we need the text content
      // In a real implementation, you'd use a PDF parser
      const content = mode === "text" ? textContent : textContent;
      
      if (mode === "file" && file) {
        await uploadReport({
          file,
          userId: user.id,
          textContent: content || `Report uploaded: ${file.name}. Content extraction pending.`,
          source,
        });
      } else if (mode === "text") {
        // Create a text file from the content
        const blob = new Blob([textContent], { type: "text/plain" });
        const textFile = new File([blob], "report.txt", { type: "text/plain" });
        
        await uploadReport({
          file: textFile,
          userId: user.id,
          textContent,
          source,
        });
      }
      
      setFile(null);
      setTextContent("");
      setSource("user_upload");
      onSuccess?.();
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <div className="text-center pb-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-medium">Upload Travel Report</h2>
          <p className="text-sm text-muted-foreground">
            Import reports from International SOS, Control Risks, or paste report text
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg border border-border p-1">
          <Button
            variant={mode === "file" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("file")}
          >
            <FileText className="h-4 w-4 mr-2" />
            Upload File
          </Button>
          <Button
            variant={mode === "text" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("text")}
          >
            <Shield className="h-4 w-4 mr-2" />
            Paste Text
          </Button>
        </div>

        <div className="space-y-4">
          {/* Source Selection */}
          <div className="space-y-2">
            <Label>Report Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isos">International SOS</SelectItem>
                <SelectItem value="control_risks">Control Risks</SelectItem>
                <SelectItem value="user_upload">Other Provider</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "file" ? (
            <div className="space-y-2">
              <Label>Report File (PDF)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {file ? (
                <Card className="bg-card/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card 
                  className="bg-card/50 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CardContent className="p-8 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to select a PDF or TXT file
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Text content for parsing */}
              <div className="space-y-2 pt-2">
                <Label>Report Text Content (for AI parsing)</Label>
                <Textarea
                  placeholder="Paste the text content of the report here for AI analysis..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Copy and paste the text from your PDF for accurate parsing
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Report Content</Label>
              <Textarea
                placeholder="Paste the full text content of the travel risk report here...

Example content from International SOS or Control Risks reports including:
- Location overview and risk rating
- Key security risks
- Latest developments
- Emergency contacts
- Transportation and accommodation advice
- Areas of concern"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 100 characters required for AI analysis
              </p>
            </div>
          )}

          <Button 
            onClick={handleUpload} 
            disabled={
              isUploading || 
              (mode === "text" && textContent.trim().length < 100) ||
              (mode === "file" && (!file || textContent.trim().length < 100))
            }
            className="w-full gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading & Analyzing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload & Analyze Report
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Reports are securely stored and analyzed by AI to extract structured intelligence
        </div>
      </div>
    </ScrollArea>
  );
}
