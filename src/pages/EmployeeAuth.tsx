import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, Shield, Users, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const EmployeeAuth = () => {
  const navigate = useNavigate();
  const { signIn, user, loading: authLoading, isStaff, isCollector, hasRole } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user && isStaff) {
      // Redirect collectors to collector dashboard, others to admin dashboard
      if (isCollector) {
        navigate("/collector");
      } else {
        navigate("/admin");
      }
    }
  }, [user, authLoading, isStaff, isCollector, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Signed in successfully!");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-subtle-gradient">
        <div className="animate-pulse text-clinical-navy">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-clinical-navy p-12 flex-col justify-between">
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
            Employee Portal
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            Access the laboratory management system to manage patient records, 
            test results, and appointments.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Shield className="h-5 w-5" />
              <span>Secure Staff Access</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Users className="h-5 w-5" />
              <span>Lab Management System</span>
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-2xl p-8 shadow-xl border border-border"
          >
            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                Employee Login
              </h2>
              <p className="text-muted-foreground">
                Sign in with your employee credentials
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    name="password"
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => toast.info("Contact administrator to reset password")}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                variant="default"
                size="lg"
                className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Are you a patient?{" "}
                <Link to="/auth/patient" className="text-primary hover:underline">
                  Patient Login
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

export default EmployeeAuth;
