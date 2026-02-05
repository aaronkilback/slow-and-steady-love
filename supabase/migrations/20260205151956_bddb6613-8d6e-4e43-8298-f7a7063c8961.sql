-- Create storage bucket for travel risk reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('travel-reports', 'travel-reports', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for travel-reports bucket
CREATE POLICY "Authenticated users can upload travel reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'travel-reports' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view travel reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'travel-reports'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their own travel reports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'travel-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create table to track uploaded and generated travel risk reports
CREATE TABLE public.travel_risk_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  risk_rating TEXT CHECK (risk_rating IN ('insignificant', 'low', 'medium', 'high', 'extreme')),
  source TEXT NOT NULL DEFAULT 'user_upload', -- 'user_upload', 'isos', 'control_risks', 'generated'
  report_date DATE,
  storage_path TEXT, -- Path in storage bucket for uploaded PDFs
  parsed_content JSONB, -- Structured content extracted from reports
  key_risks TEXT[], -- Array of key risk categories
  emergency_contacts JSONB, -- Emergency contact information
  topline_advice TEXT,
  transportation_notes TEXT,
  accommodation_notes TEXT,
  areas_of_concern JSONB, -- Map/location data
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.travel_risk_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view all travel reports"
ON public.travel_risk_reports FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create travel reports"
ON public.travel_risk_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports"
ON public.travel_risk_reports FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports"
ON public.travel_risk_reports FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_travel_risk_reports_updated_at
BEFORE UPDATE ON public.travel_risk_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();