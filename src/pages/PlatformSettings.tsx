import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SystemSettings from "@/components/admin/SystemSettings";
import PlatformAdminLayout from "@/components/platform/PlatformAdminLayout";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

export default function PlatformSettings() {
  const { isPlatformAdmin, loading } = usePlatformAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isPlatformAdmin) {
      navigate("/platform/login", { replace: true });
    }
  }, [loading, isPlatformAdmin, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-pulse text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <PlatformAdminLayout>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">Platform Settings</h2>
        <p className="text-sm text-slate-500">
          Platform-wide credentials and defaults. These apply globally and are not
          overridden by individual tenant settings — e.g. ABDM Bridge credentials,
          platform-level email/SMS sender defaults.
        </p>
      </div>
      <SystemSettings platformMode />
    </PlatformAdminLayout>
  );
}
