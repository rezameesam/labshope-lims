import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { 
  Phone, 
  ArrowRight, 
  ArrowLeft, 
  Shield, 
  FileText, 
  Clock, 
  HeartPulse,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const PatientAuth = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, sendOtp, verifyOtp } = usePatientAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/patient/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    setIsLoading(true);
    
    const { error } = await sendOtp(phone);
    
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    
    setStep("otp");
    setCountdown(60);
    toast.success("OTP sent to your phone number");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }
    setIsLoading(true);
    
    const { error } = await verifyOtp(phone, otp);
    
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Welcome to your Patient Portal!");
    navigate("/patient/dashboard");
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    
    const { error } = await sendOtp(phone);
    
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    
    setCountdown(60);
    toast.success("OTP resent successfully");
  };

  const features = [
    { icon: FileText, title: "View Reports", desc: "Access all your test results" },
    { icon: Clock, title: "Track Progress", desc: "Monitor your health history" },
    { icon: HeartPulse, title: "Health Insights", desc: "Get personalized health tips" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-subtle-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-hero-gradient p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <Link to="/" className="flex items-center gap-3 relative z-10">
          <img src={logo} alt="IRM Clinical Laboratory" className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-primary-foreground">
              IRM Clinical
            </h1>
            <p className="text-xs text-primary-foreground/70">Laboratory</p>
          </div>
        </Link>

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-heading font-bold text-primary-foreground mb-4">
              Patient Portal
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-md mb-8">
              Access your test reports, track your health records, and manage your 
              health journey all in one secure place.
            </p>
          </motion.div>

          <div className="space-y-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-4"
              >
                <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-primary-foreground">{feature.title}</h3>
                  <p className="text-sm text-primary-foreground/70">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary-foreground/60" />
          <p className="text-primary-foreground/60 text-sm">
            Your data is encrypted and secure
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={logo} alt="IRM Clinical Laboratory" className="h-14 w-14" />
              <div className="text-left">
                <h1 className="text-lg font-heading font-bold text-foreground">
                  IRM Clinical
                </h1>
                <p className="text-xs text-muted-foreground">Laboratory</p>
              </div>
            </Link>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-card rounded-2xl p-8 shadow-xl border border-border"
            >
              {step === "phone" ? (
                <>
                  <div className="mb-8">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-4">
                      <Phone className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                      Welcome Back
                    </h2>
                    <p className="text-muted-foreground">
                      Enter your registered phone number to access your portal
                    </p>
                  </div>

                  <form onSubmit={handleSendOtp} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                          +91
                        </span>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="Enter 10-digit number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          className="pl-14 h-12 text-lg"
                          required
                          autoComplete="tel"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        We'll send a one-time password to verify your identity
                      </p>
                    </div>

                    <Button
                      type="submit"
                      variant="clinical"
                      size="lg"
                      className="w-full h-12"
                      disabled={isLoading || phone.length !== 10}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending OTP...
                        </>
                      ) : (
                        <>
                          Continue
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-8">
                    <button
                      onClick={() => {
                        setStep("phone");
                        setOtp("");
                      }}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Change number
                    </button>
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-green-100 mb-4">
                      <CheckCircle2 className="h-7 w-7 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                      Verify OTP
                    </h2>
                    <p className="text-muted-foreground">
                      Enter the 6-digit code sent to{" "}
                      <span className="font-medium text-foreground">+91 {phone}</span>
                    </p>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={setOtp}
                        className="gap-2"
                      >
                        <InputOTPGroup className="gap-2">
                          <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                          <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                          <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                          <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                          <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                          <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    <Button
                      type="submit"
                      variant="clinical"
                      size="lg"
                      className="w-full h-12"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify & Login
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Didn't receive the code?{" "}
                      {countdown > 0 ? (
                        <span className="text-foreground font-medium">
                          Resend in {countdown}s
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          className="text-primary hover:underline font-medium"
                          disabled={isLoading}
                        >
                          Resend OTP
                        </button>
                      )}
                    </p>
                  </form>
                </>
              )}

              <div className="mt-6 pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Are you an employee?{" "}
                  <Link to="/auth/employee" className="text-primary hover:underline font-medium">
                    Employee Login
                  </Link>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary transition-colors">
              ← Back to Home
            </Link>
          </p>

          {/* Demo Mode Notice */}
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              <strong>Demo Mode:</strong> Use OTP <span className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">123456</span> to login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientAuth;
