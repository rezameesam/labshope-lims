CREATE TABLE public.booking_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  booking_type TEXT NOT NULL DEFAULT 'walk_in' CHECK (booking_type IN ('walk_in', 'home_collection')),
  test_details TEXT,
  preferred_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'scheduled', 'converted', 'closed')),
  source TEXT NOT NULL DEFAULT 'website',
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  collection_center_id UUID REFERENCES public.collection_centers(id) ON DELETE SET NULL,
  converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_requests_status_created_at
ON public.booking_requests(status, created_at DESC);

CREATE INDEX idx_booking_requests_phone
ON public.booking_requests(phone);

CREATE INDEX idx_booking_requests_patient_id
ON public.booking_requests(patient_id);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking requests"
ON public.booking_requests
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'employee')
  OR has_role(auth.uid(), 'collector')
);

CREATE POLICY "Staff can manage booking requests"
ON public.booking_requests
FOR ALL
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'employee')
  OR has_role(auth.uid(), 'collector')
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'employee')
  OR has_role(auth.uid(), 'collector')
);

CREATE TRIGGER update_booking_requests_updated_at
BEFORE UPDATE ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
