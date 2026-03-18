import SystemSettings from "@/components/admin/SystemSettings";
import PlatformRoute from "@/components/platform/PlatformRoute";

export default function PlatformSettings() {
  return (
    <PlatformRoute>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">Platform Settings</h2>
        <p className="text-sm text-slate-500">
          Platform-wide credentials and defaults. These apply globally and are not
          overridden by individual tenant settings — e.g. ABDM Bridge credentials,
          platform-level email/SMS sender defaults.
        </p>
      </div>
      <SystemSettings platformMode />
    </PlatformRoute>
  );
}
