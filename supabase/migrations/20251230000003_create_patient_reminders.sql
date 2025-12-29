-- Create patient_reminders table for managing patient reminders
CREATE TABLE IF NOT EXISTS public.patient_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL DEFAULT 'follow_up' CHECK (reminder_type IN ('follow_up', 'checkup', 'payment', 'test_result', 'custom')),
  title TEXT NOT NULL,
  message TEXT,
  reminder_date DATE NOT NULL,
  due_date DATE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN DEFAULT false,
  notification_method TEXT DEFAULT 'both' CHECK (notification_method IN ('email', 'sms', 'both', 'none')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for patient_reminders
CREATE POLICY "Staff can view all reminders"
ON public.patient_reminders FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Patients can view their own reminders"
ON public.patient_reminders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patients p 
    WHERE p.id = patient_reminders.patient_id 
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage reminders"
ON public.patient_reminders FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_reminders_patient_id ON public.patient_reminders(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_reminder_date ON public.patient_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_is_completed ON public.patient_reminders(is_completed);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_reminder_type ON public.patient_reminders(reminder_type);

-- Create trigger for updated_at
CREATE TRIGGER update_patient_reminders_updated_at
BEFORE UPDATE ON public.patient_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

