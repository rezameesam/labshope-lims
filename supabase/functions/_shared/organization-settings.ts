import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface OrganizationResolverOptions {
  supabaseUrl: string;
  supabaseAnonKey?: string | null;
  serviceRoleKey: string;
  authHeader?: string | null;
  organizationId?: string | null;
  patientId?: string | null;
}

interface OrganizationIdentity {
  organizationId: string | null;
  userId: string | null;
}

export const createServiceClient = (supabaseUrl: string, serviceRoleKey: string) =>
  createClient(supabaseUrl, serviceRoleKey);

export async function resolveOrganizationIdentity(
  options: OrganizationResolverOptions,
): Promise<OrganizationIdentity> {
  const {
    supabaseUrl,
    supabaseAnonKey,
    serviceRoleKey,
    authHeader,
    organizationId,
    patientId,
  } = options;

  const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey);

  if (organizationId) {
    return {
      organizationId,
      userId: null,
    };
  }

  if (patientId) {
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("organization_id")
      .eq("id", patientId)
      .maybeSingle();

    const patientOrganizationId =
      (patient as { organization_id?: string | null } | null)?.organization_id ?? null;

    if (patientOrganizationId) {
      return {
        organizationId: patientOrganizationId,
        userId: null,
      };
    }
  }

  if (!authHeader || !supabaseAnonKey) {
    return {
      organizationId: null,
      userId: null,
    };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return {
      organizationId: null,
      userId: null,
    };
  }

  const { data: memberships } = await supabaseAdmin
    .from("organization_users" as any)
    .select("organization_id, is_primary")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const membership = (memberships || [])[0] as { organization_id?: string | null } | undefined;

  return {
    organizationId: membership?.organization_id ?? null,
    userId: authData.user.id,
  };
}

export async function fetchScopedSettings(
  supabaseUrl: string,
  serviceRoleKey: string,
  keys: string[],
  organizationId?: string | null,
): Promise<Map<string, string>> {
  const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey);
  const settingsMap = new Map<string, string>();
  const uniqueKeys = Array.from(new Set(keys));

  if (organizationId && uniqueKeys.length > 0) {
    const { data: organizationSettings } = await supabaseAdmin
      .from("organization_settings" as any)
      .select("setting_key, setting_value")
      .eq("organization_id", organizationId)
      .in("setting_key", uniqueKeys);

    (organizationSettings || []).forEach((row: any) => {
      if (row.setting_key) {
        settingsMap.set(row.setting_key, row.setting_value || "");
      }
    });
  }

  const missingKeys = uniqueKeys.filter((key) => !settingsMap.get(key)?.trim());
  if (missingKeys.length === 0) {
    return settingsMap;
  }

  const { data: systemSettings } = await supabaseAdmin
    .from("system_settings")
    .select("setting_key, setting_value")
    .in("setting_key", missingKeys);

  (systemSettings || []).forEach((row: any) => {
    if (row.setting_key && !settingsMap.get(row.setting_key)?.trim()) {
      settingsMap.set(row.setting_key, row.setting_value || "");
    }
  });

  return settingsMap;
}

export async function fetchOrganizationBranding(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId?: string | null,
): Promise<{
  displayName: string | null;
  primaryEmail: string | null;
} | null> {
  if (!organizationId) {
    return null;
  }

  const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey);
  const { data } = await supabaseAdmin
    .from("organizations" as any)
    .select("display_name, primary_email")
    .eq("id", organizationId)
    .maybeSingle();

  return (data as { display_name?: string | null; primary_email?: string | null } | null)
    ? {
        displayName: (data as any).display_name ?? null,
        primaryEmail: (data as any).primary_email ?? null,
      }
    : null;
}
