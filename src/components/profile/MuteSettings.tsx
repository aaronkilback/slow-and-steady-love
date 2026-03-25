import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BellOff, Loader2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function MuteSettings() {
  const [enabled, setEnabled] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMutePreferences();
  }, []);

  const loadMutePreferences = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('mute_preferences')
      .select('*')
      .maybeSingle();

    if (data) {
      setEnabled(data.enabled);
      setSelectedDays(data.days_of_week || []);
      setStartTime(data.start_time || "00:00");
      setEndTime(data.end_time || "23:59");
    }
    
    setIsLoading(false);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('mute_preferences')
      .upsert({
        user_id: user?.id,
        enabled,
        days_of_week: selectedDays,
        start_time: startTime,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to save preferences",
        description: error.message,
      });
    } else {
      toast({
        title: "Preferences saved",
        description: "Your mute schedule has been updated",
      });
    }
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="p-4 border-border bg-card">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BellOff className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Mute on Days Off</h3>
                <p className="text-xs text-muted-foreground">
                  Pause notifications during your time off
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </div>

        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="space-y-4 pt-4 border-t border-border"
          >
            {/* Day selection */}
            <div className="space-y-2">
              <Label>Days to mute</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <Button
                    key={day.value}
                    variant={selectedDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDay(day.value)}
                    className="w-12"
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Broadcasts and notifications will be muted on selected days between the specified times.
              Leave times blank to mute all day.
            </p>
          </motion.div>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="w-full mt-4">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Save Preferences
        </Button>
      </Card>
    </motion.div>
  );
}
