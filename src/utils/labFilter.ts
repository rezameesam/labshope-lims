import { SupabaseClient } from "@supabase/supabase-js";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

/**
 * Helper function to add lab_id filter to Supabase queries
 * @param query - The Supabase query builder
 * @param currentLabId - The current lab ID (null if no lab selected)
 * @param isAdmin - Whether the user is a system admin
 * @param showAllLabs - Whether to show all labs (admin only)
 * @returns The query with lab filter applied (if needed)
 */
export function addLabFilter<T>(
  query: PostgrestFilterBuilder<any, any, any, any>,
  currentLabId: string | null,
  isAdmin: boolean = false,
  showAllLabs: boolean = false
): PostgrestFilterBuilder<any, any, any, any> {
  // If admin wants to see all labs, don't filter
  if (isAdmin && showAllLabs) {
    return query;
  }

  // If there's a current lab, filter by it
  if (currentLabId) {
    return query.eq("lab_id", currentLabId);
  }

  // If no lab selected and not admin, return empty result
  // (This prevents showing data when no lab is selected)
  return query.eq("lab_id", "00000000-0000-0000-0000-000000000000"); // Non-existent UUID
}

/**
 * Helper to get lab_id for insert/update operations
 * @param currentLabId - The current lab ID
 * @param isAdmin - Whether the user is a system admin
 * @param allowNull - Whether to allow null lab_id (for shared resources)
 * @returns The lab_id to use, or null if allowed
 */
export function getLabIdForOperation(
  currentLabId: string | null,
  isAdmin: boolean = false,
  allowNull: boolean = false
): string | null {
  if (allowNull) {
    return currentLabId;
  }

  if (!currentLabId && !isAdmin) {
    throw new Error("No lab selected. Please select a lab first.");
  }

  return currentLabId;
}

/**
 * Check if a resource should be filtered by lab based on settings
 * @param resourceType - Type of resource ('test_catalog', 'inventory', 'patient', 'doctor')
 * @param labSettings - Lab settings object from database
 * @returns Whether to filter by lab_id
 */
export function shouldFilterByLab(
  resourceType: "test_catalog" | "inventory" | "patient" | "doctor",
  labSettings: any
): boolean {
  if (!labSettings) return true; // Default to filtering

  const settingsMap: Record<string, string> = {
    test_catalog: "test_catalog_shared",
    inventory: "inventory_shared",
    patient: "patient_shared",
    doctor: "doctor_shared",
  };

  const settingKey = settingsMap[resourceType];
  if (!settingKey) return true;

  // If shared is true, don't filter; if false or null, filter
  return !labSettings[settingKey];
}

