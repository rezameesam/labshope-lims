import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, QrCode } from "lucide-react";

interface TokenData {
  token_id: string;
  token_value: string;
  hip_id: string;
  facility_id: string;
  context: string;
  expires_at: string;
  wait_time_minutes: number;
  qr_payload: string;
}

interface Props {
  organizationId: string;
  labId?: string;
}

async function generateToken(organizationId: string, labId?: string): Promise<TokenData> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abdm-running-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organization_id: organizationId, lab_id: labId }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Failed to generate token");
  return body as TokenData;
}

export function AbdmQrCodeDisplay({ organizationId, labId }: Props) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateToken(organizationId, labId);
      setTokenData(data);
      const secs = Math.max(0, Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, labId]);

  // Auto-refresh on mount and when expired
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (secondsLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          void refresh(); // auto-regenerate when expired
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [secondsLeft, refresh]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timerStr = `${minutes}:${String(seconds).padStart(2, "0")}`;
  const urgent = secondsLeft > 0 && secondsLeft < 60;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  if (loading && !tokenData) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Generating QR code…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {tokenData ? (
          <div className="rounded-xl border-2 border-blue-200 bg-white p-3 shadow-sm">
            <QRCodeSVG value={tokenData.qr_payload} size={180} level="M" includeMargin={false} />
          </div>
        ) : (
          <div className="flex h-[204px] w-[204px] items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30">
            <QrCode className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {tokenData && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-lg tracking-widest px-4 py-1">
              {tokenData.token_value}
            </Badge>
          </div>
          <div className="text-center space-y-0.5">
            <p className={`text-sm font-medium ${urgent ? "text-amber-600" : "text-muted-foreground"}`}>
              {secondsLeft > 0 ? `Refreshes in ${timerStr}` : "Refreshing…"}
            </p>
            <p className="text-xs text-muted-foreground">
              Est. wait: ~{tokenData.wait_time_minutes} min · HIP: {tokenData.hip_id}
            </p>
          </div>
        </>
      )}

      <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Refresh QR
      </Button>
    </div>
  );
}
