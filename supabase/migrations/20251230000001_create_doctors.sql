-- Create doctors table for referral doctor management
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  commission_percentage NUMERIC(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create doctor_referrals table to track patient referrals
CREATE TABLE IF NOT EXISTS public.doctor_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_number TEXT,
  invoice_amount NUMERIC(10,2),
  commission_amount NUMERIC(10,2),
  commission_paid BOOLEAN DEFAULT false,
  referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_referrals ENABLE ROW LEVEL SECURITY;

-- RLS policies for doctors
CREATE POLICY "Staff can view doctors"
ON public.doctors FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage doctors"
ON public.doctors FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- RLS policies for doctor_referrals
CREATE POLICY "Staff can view doctor referrals"
ON public.doctor_referrals FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage doctor referrals"
ON public.doctor_referrals FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_doctor_id ON public.doctor_referrals(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_patient_id ON public.doctor_referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_invoice_id ON public.doctor_referrals(invoice_id);

-- Create trigger for updated_at
CREATE TRIGGER update_doctors_updated_at
BEFORE UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_doctor_referrals_updated_at
BEFORE UPDATE ON public.doctor_referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

