import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TravelRiskReport {
  id: string;
  user_id: string;
  title: string;
  location: string;
  risk_rating: "insignificant" | "low" | "medium" | "high" | "extreme" | null;
  source: string;
  report_date: string | null;
  storage_path: string | null;
  parsed_content: Record<string, any> | null;
  key_risks: string[] | null;
  emergency_contacts: Record<string, any> | null;
  topline_advice: string | null;
  transportation_notes: string | null;
  accommodation_notes: string | null;
  areas_of_concern: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedBriefing {
  location: string;
  riskRating: string;
  keyRisks: string[];
  toplineAdvice: string;
  latestDevelopments: string;
  emergencyContacts: Record<string, string>;
  securityRisks: Record<string, string>;
  transportation: string;
  accommodation: string;
  areasOfConcern: string[];
  generalAdvice: string[];
}

export function useTravelReports() {
  const queryClient = useQueryClient();

  // Fetch all travel reports
  const {
    data: reports = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["travel-risk-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_risk_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TravelRiskReport[];
    },
  });

  // Generate a new travel briefing using Perplexity
  const generateBriefingMutation = useMutation({
    mutationFn: async (params: {
      location: string;
      country: string;
      travelDates?: string;
      purpose?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-travel-briefing", {
        body: params,
      });

      if (error) throw error;
      return data as { briefing: GeneratedBriefing; citations: string[]; generatedAt: string };
    },
    onSuccess: () => {
      toast.success("Travel briefing generated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate briefing: ${error.message}`);
    },
  });

  // Save a generated briefing to the database
  const saveBriefingMutation = useMutation({
    mutationFn: async (params: {
      briefing: GeneratedBriefing;
      userId: string;
    }) => {
      const { briefing, userId } = params;
      
      const { data, error } = await supabase
        .from("travel_risk_reports")
        .insert({
          user_id: userId,
          title: `Security Briefing: ${briefing.location}`,
          location: briefing.location,
          risk_rating: briefing.riskRating?.toLowerCase() as TravelRiskReport["risk_rating"],
          source: "generated",
          report_date: new Date().toISOString().split("T")[0],
          key_risks: briefing.keyRisks,
          emergency_contacts: briefing.emergencyContacts,
          topline_advice: briefing.toplineAdvice,
          transportation_notes: briefing.transportation,
          accommodation_notes: briefing.accommodation,
          areas_of_concern: { areas: briefing.areasOfConcern },
          parsed_content: {
            latestDevelopments: briefing.latestDevelopments,
            securityRisks: briefing.securityRisks,
            generalAdvice: briefing.generalAdvice,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-risk-reports"] });
      toast.success("Briefing saved successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save briefing: ${error.message}`);
    },
  });

  // Upload and parse a travel report PDF
  const uploadReportMutation = useMutation({
    mutationFn: async (params: {
      file: File;
      userId: string;
      textContent: string; // Pre-extracted text content
      source?: string;
    }) => {
      const { file, userId, textContent, source = "user_upload" } = params;

      // First, upload the file to storage
      const fileName = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("travel-reports")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Parse the report content
      const { data: parseData, error: parseError } = await supabase.functions.invoke(
        "parse-travel-report",
        {
          body: { content: textContent, source },
        }
      );

      if (parseError) throw parseError;

      const parsed = parseData.parsedReport;

      // Save to database
      const { data, error: dbError } = await supabase
        .from("travel_risk_reports")
        .insert({
          user_id: userId,
          title: parsed.title || file.name.replace(/\.pdf$/i, ""),
          location: `${parsed.location || "Unknown"}, ${parsed.country || "Unknown"}`,
          risk_rating: parsed.riskRating?.toLowerCase() as TravelRiskReport["risk_rating"],
          source: parsed.source || source,
          report_date: parsed.reportDate,
          storage_path: fileName,
          key_risks: parsed.keyRisks,
          emergency_contacts: parsed.emergencyContacts,
          topline_advice: parsed.toplineAdvice,
          transportation_notes: parsed.transportation,
          accommodation_notes: parsed.accommodation,
          areas_of_concern: { areas: parsed.areasOfConcern },
          parsed_content: {
            latestDevelopments: parsed.latestDevelopments,
            securityRisks: parsed.securityRisks,
            generalAdvice: parsed.generalAdvice,
          },
        })
        .select()
        .single();

      if (dbError) throw dbError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-risk-reports"] });
      toast.success("Report uploaded and analyzed successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to upload report: ${error.message}`);
    },
  });

  // Delete a report
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      
      // Delete from storage if exists
      if (report?.storage_path) {
        await supabase.storage.from("travel-reports").remove([report.storage_path]);
      }

      const { error } = await supabase
        .from("travel_risk_reports")
        .delete()
        .eq("id", reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-risk-reports"] });
      toast.success("Report deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete report: ${error.message}`);
    },
  });

  return {
    reports,
    isLoading,
    error,
    refetch,
    generateBriefing: generateBriefingMutation.mutateAsync,
    isGenerating: generateBriefingMutation.isPending,
    saveBriefing: saveBriefingMutation.mutateAsync,
    isSaving: saveBriefingMutation.isPending,
    uploadReport: uploadReportMutation.mutateAsync,
    isUploading: uploadReportMutation.isPending,
    deleteReport: deleteReportMutation.mutateAsync,
    isDeleting: deleteReportMutation.isPending,
  };
}
