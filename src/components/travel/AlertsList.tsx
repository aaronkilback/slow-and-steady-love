import { useTravelAlerts } from "@/hooks/useTravelData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  Bell, 
  CheckCircle, 
  Info, 
  MapPin 
} from "lucide-react";
import { format } from "date-fns";

const severityConfig: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  warning: { icon: AlertTriangle, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  critical: { icon: AlertTriangle, color: "bg-destructive/20 text-destructive border-destructive/30" },
};

export function AlertsList() {
  const { alerts, isLoading, markAsRead } = useTravelAlerts();

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <Card key={i} className="bg-card/50">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-3" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No Active Alerts</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          You'll receive alerts about security, weather, and travel advisories for your destinations.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity] || severityConfig.info;
          const Icon = config.icon;
          
          return (
            <Card 
              key={alert.id} 
              className={`bg-card/50 transition-colors ${!alert.is_read ? 'border-l-2 border-l-primary' : ''}`}
              onClick={() => !alert.is_read && markAsRead(alert.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-medium">{alert.title}</h3>
                      <Badge variant="outline" className={config.color}>
                        {alert.severity}
                      </Badge>
                    </div>
                    
                    {alert.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {alert.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {alert.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {alert.location}
                        </span>
                      )}
                      {alert.category && (
                        <Badge variant="secondary" className="text-xs">
                          {alert.category}
                        </Badge>
                      )}
                      <span>{format(new Date(alert.created_at), "MMM d, h:mm a")}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
