import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Loader2,
  Shield,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react";

export interface AbhaEnrolledResult {
  abha_number: string;
  abha_address: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  mobile: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  patientId?: string;
  onEnrolled: (result: AbhaEnrolledResult) => void;
}

type Method = "aadhaar_otp" | "mobile_otp" | "face" | "demographic";

async function callEnroll(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abdm-enroll-abha`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const METHODS: { id: Method; label: string; desc: string; icon: React.ElementType; badge?: string }[] = [
  {
    id: "aadhaar_otp",
    label: "Aadhaar OTP",
    desc: "Create a new ABHA using Aadhaar. OTP is sent to the Aadhaar-linked mobile.",
    icon: Shield,
    badge: "New ABHA",
  },
  {
    id: "mobile_otp",
    label: "Mobile OTP",
    desc: "Verify an existing ABHA holder via OTP sent to their registered mobile number.",
    icon: Smartphone,
    badge: "Existing ABHA",
  },
  {
    id: "face",
    label: "Face Recognition",
    desc: "Verify an existing ABHA holder by capturing their face using the device camera.",
    icon: Camera,
    badge: "Existing ABHA",
  },
  {
    id: "demographic",
    label: "Demographic",
    desc: "Verify an existing ABHA holder using name, date of birth, and gender — no OTP needed.",
    icon: Users,
    badge: "Existing ABHA",
  },
];

export function AbhaEnrollmentDialog({
  open,
  onOpenChange,
  organizationId,
  patientId,
  onEnrolled,
}: Props) {
  const [method, setMethod]             = useState<Method | null>(null);
  const [step, setStep]                 = useState<string>("method");
  const [loading, setLoading]           = useState(false);
  const [sessionId, setSessionId]       = useState("");
  const [pendingResult, setPendingResult] = useState<Partial<AbhaEnrolledResult>>({});

  // Aadhaar OTP fields
  const [aadhaar, setAadhaar]           = useState("");
  const [otp, setOtp]                   = useState("");
  const [suggestions, setSuggestions]   = useState<string[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [customAddress, setCustomAddress] = useState("");

  // Mobile OTP fields
  const [loginHint, setLoginHint]       = useState<"mobile" | "abha-number" | "abha-address">("mobile");
  const [loginId, setLoginId]           = useState("");
  const [mobileOtp, setMobileOtp]       = useState("");

  // Face auth fields
  const [abhaForFace, setAbhaForFace]   = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Demographic fields
  const [demoAbha, setDemoAbha]         = useState("");
  const [demoName, setDemoName]         = useState("");
  const [demoDob, setDemoDob]           = useState("");
  const [demoGender, setDemoGender]     = useState<"M" | "F" | "O">("M");
  const [demoMobile, setDemoMobile]     = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  function reset() {
    stopCamera();
    setMethod(null);
    setStep("method");
    setLoading(false);
    setSessionId("");
    setPendingResult({});
    setAadhaar(""); setOtp(""); setSuggestions([]); setSelectedAddress(""); setCustomAddress("");
    setLoginHint("mobile"); setLoginId(""); setMobileOtp("");
    setAbhaForFace(""); setCapturedImage(null);
    setDemoAbha(""); setDemoName(""); setDemoDob(""); setDemoGender("M"); setDemoMobile("");
  }

  // Stop camera when dialog closes
  useEffect(() => {
    if (!open) stopCamera();
  }, [open]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }

  function captureFrame() {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    // Strip data URL prefix, keep only base64
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    setCapturedImage(base64);
    stopCamera();
  }

  // ── Aadhaar OTP flow ──────────────────────────────────────────────────────

  async function handleAadhaarSendOtp() {
    if (!/^\d{12}$/.test(aadhaar.replace(/\s/g, ""))) {
      toast.error("Enter a valid 12-digit Aadhaar number"); return;
    }
    setLoading(true);
    try {
      const r = await callEnroll("send_otp", { organization_id: organizationId, aadhaar: aadhaar.replace(/\s/g, "") });
      setSessionId(r.session_id);
      setStep("aadhaar_otp");
      toast.success("OTP sent to Aadhaar-linked mobile");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleAadhaarVerifyOtp() {
    if (otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("verify_otp", { organization_id: organizationId, session_id: sessionId, otp });
      setPendingResult({ abha_number: r.abha_number, full_name: r.full_name, gender: r.gender, date_of_birth: r.date_of_birth, mobile: r.mobile });
      const s = await callEnroll("get_suggestions", { organization_id: organizationId, session_id: sessionId });
      setSuggestions(s.suggestions || []);
      if (s.suggestions?.[0]) setSelectedAddress(s.suggestions[0]);
      setStep("address");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleSetAddress() {
    const address = selectedAddress || customAddress.trim();
    if (!address) { toast.error("Choose or enter an ABHA address"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("set_address", { organization_id: organizationId, session_id: sessionId, abha_address: address, patient_id: patientId });
      setPendingResult((p) => ({ ...p, abha_address: r.abha_address, abha_number: r.abha_number || p.abha_number }));
      setStep("done");
      toast.success("ABHA address set successfully");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  // ── Mobile OTP flow ───────────────────────────────────────────────────────

  async function handleMobileSendOtp() {
    if (!loginId.trim()) { toast.error("Enter your mobile number or ABHA ID"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("send_mobile_otp", { organization_id: organizationId, login_hint: loginHint, login_id: loginId.trim() });
      setSessionId(r.session_id);
      setStep("mobile_otp");
      toast.success("OTP sent to registered mobile");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleMobileVerifyOtp() {
    if (mobileOtp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("verify_mobile_otp", { organization_id: organizationId, session_id: sessionId, otp: mobileOtp, patient_id: patientId });
      setPendingResult({ abha_number: r.abha_number, abha_address: r.abha_address, full_name: r.full_name, gender: r.gender, date_of_birth: r.date_of_birth, mobile: r.mobile });
      setStep("done");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  // ── Face auth flow ────────────────────────────────────────────────────────

  async function handleFaceInit() {
    if (!abhaForFace.trim()) { toast.error("Enter ABHA number or address"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("init_face_auth", { organization_id: organizationId, abha_number: abhaForFace.trim() });
      setSessionId(r.session_id);
      setStep("face_camera");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleFaceVerify() {
    if (!capturedImage) { toast.error("Capture the patient's face first"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("verify_face", { organization_id: organizationId, session_id: sessionId, face_image: capturedImage, patient_id: patientId });
      setPendingResult({ abha_number: r.abha_number, abha_address: r.abha_address, full_name: r.full_name, gender: r.gender, date_of_birth: r.date_of_birth, mobile: r.mobile });
      setStep("done");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  // ── Demographic flow ──────────────────────────────────────────────────────

  async function handleDemographic() {
    if (!demoAbha.trim()) { toast.error("Enter ABHA number or address"); return; }
    if (!demoName.trim())  { toast.error("Enter patient name"); return; }
    if (!demoDob)          { toast.error("Enter date of birth"); return; }
    setLoading(true);
    try {
      const r = await callEnroll("verify_demographic", {
        organization_id: organizationId,
        abha_number: demoAbha.trim(),
        name: demoName.trim(),
        date_of_birth: demoDob,
        gender: demoGender,
        mobile: demoMobile.trim() || undefined,
        patient_id: patientId,
      });
      setPendingResult({ abha_number: r.abha_number, abha_address: r.abha_address, full_name: r.full_name, gender: r.gender, date_of_birth: r.date_of_birth, mobile: r.mobile });
      setStep("done");
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  function handleApply() {
    if (!pendingResult.abha_number && !pendingResult.abha_address) return;
    onEnrolled(pendingResult as AbhaEnrolledResult);
    onOpenChange(false);
    reset();
  }

  const title = method
    ? METHODS.find((m) => m.id === method)?.label ?? "ABHA Verification"
    : "ABHA Verification";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === "method" ? "Choose how to verify or create the patient's ABHA identity." : null}
            {step === "aadhaar_input" && "Step 1 — Enter Aadhaar"}
            {step === "aadhaar_otp" && "Step 2 — Verify OTP"}
            {step === "address" && "Step 3 — Choose ABHA Address"}
            {step === "mobile_input" && "Step 1 — Enter identifier"}
            {step === "mobile_otp" && "Step 2 — Verify OTP"}
            {step === "face_input" && "Step 1 — Enter ABHA ID"}
            {step === "face_camera" && "Step 2 — Capture face"}
            {step === "demographic_form" && "Enter patient demographics"}
            {step === "done" && "Verification complete"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Method picker ── */}
        {step === "method" && (
          <div className="space-y-2">
            {METHODS.map(({ id, label, desc, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMethod(id);
                  setStep(
                    id === "aadhaar_otp" ? "aadhaar_input"
                    : id === "mobile_otp" ? "mobile_input"
                    : id === "face" ? "face_input"
                    : "demographic_form"
                  );
                }}
                className="group flex w-full items-start gap-3 rounded-xl border border-border/70 bg-muted/35 p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/60"
              >
                <div className="mt-0.5 shrink-0 rounded-lg border border-border/70 bg-background/85 p-2 transition-colors group-hover:border-primary/30 group-hover:bg-background">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    {badge && <span className="rounded-full border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{badge}</span>}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </button>
            ))}
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── Aadhaar OTP: Step 1 ── */}
        {step === "aadhaar_input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the patient's 12-digit Aadhaar number. An OTP will be sent to their Aadhaar-linked mobile.</p>
            <div className="space-y-1.5">
              <Label htmlFor="aadhaar-input">Aadhaar Number</Label>
              <Input
                id="aadhaar-input" type="password" inputMode="numeric" maxLength={12}
                placeholder="············" value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Encrypted before leaving the device.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("method")}>Back</Button>
              <Button onClick={() => void handleAadhaarSendOtp()} disabled={loading || aadhaar.length < 12}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send OTP
              </Button>
            </div>
          </div>
        )}

        {/* ── Aadhaar OTP: Step 2 ── */}
        {step === "aadhaar_otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit OTP sent to the Aadhaar-linked mobile number.</p>
            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>{[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("aadhaar_input")}>Back</Button>
              <Button onClick={() => void handleAadhaarVerifyOtp()} disabled={loading || otp.length < 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify OTP
              </Button>
            </div>
          </div>
        )}

        {/* ── Address selection ── */}
        {step === "address" && (
          <div className="space-y-4">
            {pendingResult.abha_number && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <p><span className="font-medium">ABHA Number:</span> {pendingResult.abha_number}</p>
                {pendingResult.full_name && <p><span className="font-medium">Name:</span> {pendingResult.full_name}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label>Choose ABHA Address</Label>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Badge key={s} variant={selectedAddress === s ? "default" : "outline"} className="cursor-pointer"
                      onClick={() => { setSelectedAddress(s); setCustomAddress(""); }}>
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              <Input placeholder="Or type a custom address (e.g. name@abdm)" value={customAddress}
                onChange={(e) => { setCustomAddress(e.target.value); setSelectedAddress(""); }} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("aadhaar_otp")}>Back</Button>
              <Button onClick={() => void handleSetAddress()} disabled={loading || (!selectedAddress && !customAddress.trim())}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Address
              </Button>
            </div>
          </div>
        )}

        {/* ── Mobile OTP: Step 1 ── */}
        {step === "mobile_input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The patient must already have an ABHA number. Enter their mobile number, ABHA number, or ABHA address to send an OTP.</p>
            <div className="space-y-2">
              <Label>Identifier type</Label>
              <div className="flex gap-2 flex-wrap">
                {(["mobile", "abha-number", "abha-address"] as const).map((h) => (
                  <button key={h} type="button"
                    onClick={() => setLoginHint(h)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${loginHint === h ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                    {h === "mobile" ? "Mobile" : h === "abha-number" ? "ABHA Number" : "ABHA Address"}
                  </button>
                ))}
              </div>
              <Input
                placeholder={loginHint === "mobile" ? "10-digit mobile number" : loginHint === "abha-number" ? "14-digit ABHA number" : "name@abdm"}
                value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="off"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("method")}>Back</Button>
              <Button onClick={() => void handleMobileSendOtp()} disabled={loading || !loginId.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send OTP
              </Button>
            </div>
          </div>
        )}

        {/* ── Mobile OTP: Step 2 ── */}
        {step === "mobile_otp" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the 6-digit OTP sent to the registered mobile number.</p>
            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={mobileOtp} onChange={setMobileOtp}>
                <InputOTPGroup>{[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("mobile_input")}>Back</Button>
              <Button onClick={() => void handleMobileVerifyOtp()} disabled={loading || mobileOtp.length < 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify OTP
              </Button>
            </div>
          </div>
        )}

        {/* ── Face: Step 1 (enter ABHA ID) ── */}
        {step === "face_input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter the patient's ABHA number or address to start face verification.</p>
            <div className="space-y-1.5">
              <Label>ABHA Number / Address</Label>
              <Input placeholder="14-digit ABHA number or name@abdm" value={abhaForFace}
                onChange={(e) => setAbhaForFace(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("method")}>Back</Button>
              <Button onClick={() => void handleFaceInit()} disabled={loading || !abhaForFace.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── Face: Step 2 (camera capture) ── */}
        {step === "face_camera" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Point the camera at the patient's face and capture.</p>

            {!capturedImage ? (
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
                    <Camera className="h-8 w-8 text-slate-400" />
                    <Button size="sm" onClick={() => void startCamera()}>Open Camera</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden bg-black aspect-video">
                <img
                  src={`data:image/jpeg;base64,${capturedImage}`}
                  alt="Captured face"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => { stopCamera(); setCapturedImage(null); setStep("face_input"); }}>Back</Button>
              <div className="flex gap-2">
                {capturedImage ? (
                  <Button variant="outline" onClick={() => { setCapturedImage(null); void startCamera(); }}>Retake</Button>
                ) : (
                  cameraActive && <Button variant="outline" onClick={captureFrame}>Capture</Button>
                )}
                <Button onClick={() => void handleFaceVerify()} disabled={loading || !capturedImage}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify Face
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Demographic form ── */}
        {step === "demographic_form" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Details must match the patient's ABHA record exactly.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>ABHA Number / Address</Label>
                <Input placeholder="14-digit number or name@abdm" value={demoAbha}
                  onChange={(e) => setDemoAbha(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="As on Aadhaar" value={demoName}
                  onChange={(e) => setDemoName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <DatePicker value={demoDob} onChange={setDemoDob} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <div className="flex gap-2 pt-0.5">
                  {(["M", "F", "O"] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setDemoGender(g)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${demoGender === g ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                      {g === "M" ? "Male" : g === "F" ? "Female" : "Other"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Mobile <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder="Registered mobile number" value={demoMobile}
                  onChange={(e) => setDemoMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("method")}>Back</Button>
              <Button onClick={() => void handleDemographic()} disabled={loading || !demoAbha.trim() || !demoName.trim() || !demoDob}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Fingerprint className="mr-2 h-4 w-4" />
                Verify Identity
              </Button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-emerald-900">ABHA Verified Successfully</p>
                {pendingResult.full_name && <p className="text-sm text-emerald-800">{pendingResult.full_name}</p>}
                {pendingResult.abha_address && <p className="text-sm text-emerald-700">{pendingResult.abha_address}</p>}
                {pendingResult.abha_number && <p className="text-xs text-emerald-600">ABHA #{pendingResult.abha_number}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Close</Button>
              <Button onClick={handleApply}>
                <UserCheck className="mr-2 h-4 w-4" />
                Apply to Patient
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
