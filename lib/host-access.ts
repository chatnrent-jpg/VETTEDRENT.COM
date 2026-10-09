import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Host gate. app_metadata.role wins when it is present.
 * Otherwise the role is read from profiles.role for this user id.
 * Any lookup failure denies access.
 */
export async function resolveCallerRole(
  supabase: SupabaseClient,
  user: User,
): Promise<string | null> {
  const metadataRole = readRole(user.app_metadata);
  if (metadataRole) {
    return metadataRole;
  }
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      return null;
    }
    return readRole(data);
  } catch {
    return null;
  }
}

export function isHostRole(role: string | null): boolean {
  return role === "host";
}

function readRole(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const role = (value as { role?: unknown }).role;
  if (typeof role !== "string") {
    return null;
  }
  const trimmed = role.trim();
  return trimmed === "" ? null : trimmed;
}
