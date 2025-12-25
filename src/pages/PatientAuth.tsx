import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Phone, ArrowRight, ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

const PatientAuth = () => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    setIsLoading(true);
    // Simulate OTP sending
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsLoading(false);
    setStep("otp");
    toast.success("OTP sent to your phone number");
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }
    setIsLoading(true);
    // Simulate OTP verification
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsLoading(false);
    toast.info("Backend integration required for OTP verification");
  };

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-hero-gradient p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="IRM Clinical Laboratory" className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-primary-foreground">
              IRM Clinical
            </h1>
            <p className="text-xs text-primary-foreground/70">Laboratory</p>
          </div>
        </Link>

        <div>
          <h2 className="text-4xl font-heading font-bold text-primary-foreground mb-4">
            Patient Portal
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            Access your test reports, track your health records, and manage your 
            appointments all in one place.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Shield className="h-5 w-5" />
              <span>Secure & Private Access</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Phone className="h-5 w-5" />
              <span>OTP Verified Login</span>
            </div>
          </div>
        </div>

        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} IRM Clinical Laboratory
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={logo} alt="IRM Clinical Laboratory" className="h-14 w-14" />
              <div className="text-left">
                <h1 className="text-lg font-heading font-bold text-clinical-navy">
                  IRM Clinical
                </h1>
                <p className="text-xs text-muted-foreground">Laboratory</p>
              </div>
            </Link>
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-2xl p-8 shadow-xl border border-border"
          >
            {step === "phone" ? (
              <>
                <div className="mb-8">
                  <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                    Patient Login
                  </h2>
                  <p className="text-muted-foreground">
                    Enter your phone number to receive a one-time password
                  </p>
                </div>

                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        +91
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="Enter 10-digit number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="pl-12"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="clinical"
                    size="lg"
                    className="w-full"
                    disabled={isLoading || phone.length !== 10}
                  >
                    {isLoading ? "Sending OTP..." : "Send OTP"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <button
                    onClick={() => setStep("phone")}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Change number
                  </button>
                  <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                    Verify OTP
                  </h2>
                  <p className="text-muted-foreground">
                    Enter the 6-digit code sent to +91 {phone}
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={setOtp}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button
                    type="submit"
                    variant="clinical"
                    size="lg"
                    className="w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? "Verifying..." : "Verify & Login"}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    <button
                      type="button"
                      onClick={() => toast.info("Resending OTP...")}
                      className="text-primary hover:underline"
                    >
                      Resend
                    </button>
                  </p>
                </form>
              </>
            )}

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Are you an employee?{" "}
                <Link to="/auth/employee" className="text-primary hover:underline">
                  Employee Login
                </Link>
              </p>
            </div>
          </motion.div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PatientAuth;
