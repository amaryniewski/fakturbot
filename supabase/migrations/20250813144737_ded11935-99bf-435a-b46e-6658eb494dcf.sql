-- Update ocr_comparisons table to support Claude Vision instead of Google AI
ALTER TABLE public.ocr_comparisons 
DROP COLUMN IF EXISTS google_ai_result_id;

ALTER TABLE public.ocr_comparisons 
ADD COLUMN claude_vision_result_id UUID REFERENCES public.ocr_results(id);