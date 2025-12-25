-- Create app roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'patient');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    date_of_birth DATE,
    gender TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create employees table
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    employee_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    designation TEXT,
    department TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Create patients table
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    date_of_birth DATE,
    gender TEXT,
    blood_group TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on patients
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Create test_categories table
CREATE TABLE public.test_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on test_categories
ALTER TABLE public.test_categories ENABLE ROW LEVEL SECURITY;

-- Create tests table
CREATE TABLE public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.test_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on tests
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

-- Create patient_tests table for test records
CREATE TABLE public.patient_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
    test_name TEXT NOT NULL,
    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    report_url TEXT,
    notes TEXT,
    performed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on patient_tests
ALTER TABLE public.patient_tests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- User roles: users can view their own roles, admins/employees can view all
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Profiles: users can view/update their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Employees: employees/admins can view all employees, admins can manage
CREATE POLICY "Employees can view all employees"
ON public.employees FOR SELECT
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Admins can manage employees"
ON public.employees FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Patients: employees/admins can view all, patients can view their own
CREATE POLICY "Staff can view all patients"
ON public.patients FOR SELECT
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Patients can view their own record"
ON public.patients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Staff can manage patients"
ON public.patients FOR ALL
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'employee')
);

-- Test categories: publicly readable, admins can manage
CREATE POLICY "Anyone can view test categories"
ON public.test_categories FOR SELECT
USING (true);

CREATE POLICY "Admins can manage test categories"
ON public.test_categories FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Tests: publicly readable, admins can manage
CREATE POLICY "Anyone can view tests"
ON public.tests FOR SELECT
USING (true);

CREATE POLICY "Admins can manage tests"
ON public.tests FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Patient tests: staff can view/manage all, patients can view their own
CREATE POLICY "Staff can view all patient tests"
ON public.patient_tests FOR SELECT
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Patients can view their own tests"
ON public.patient_tests FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.patients p 
        WHERE p.id = patient_tests.patient_id 
        AND p.user_id = auth.uid()
    )
);

CREATE POLICY "Staff can manage patient tests"
ON public.patient_tests FOR ALL
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'employee')
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patient_tests_updated_at
BEFORE UPDATE ON public.patient_tests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default test categories
INSERT INTO public.test_categories (name, description) VALUES
('HAEMATOLOGY', 'Blood cell counts, hemoglobin, and related tests'),
('BIOCHEMISTRY', 'Blood chemistry analysis including glucose, lipids, etc.'),
('URINE EXAMINATION', 'Complete urine analysis and microscopy'),
('HEPATITIS B', 'Hepatitis B surface antigen and related markers'),
('IMMUNOLOGY', 'Immune system function tests and antibody detection'),
('SEROLOGY', 'Blood serum analysis for infections'),
('THYROID PROFILE', 'Thyroid hormone levels and function tests'),
('LIVER FUNCTION', 'Liver enzyme and bilirubin tests'),
('KIDNEY FUNCTION', 'Creatinine, urea, and kidney markers'),
('LIPID PROFILE', 'Cholesterol and triglyceride levels');