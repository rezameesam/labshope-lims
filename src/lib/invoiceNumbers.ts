import { supabase } from "@/integrations/supabase/client";

export async function generateScopedInvoiceNumber(organizationId: string) {
  const { data, error } = await supabase.rpc("generate_invoice_number", {
    p_organization_id: organizationId,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to generate invoice number");
  }

  return data;
}
