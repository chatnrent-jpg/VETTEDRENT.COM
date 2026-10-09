import { Seam } from "seam";

/**
 * Server-only Seam client. Throws when SEAM_API_KEY is missing.
 */
export function getSeamClient(): Seam {
  const apiKey = process.env.SEAM_API_KEY;
  if (!apiKey) {
    throw new Error("SEAM_API_KEY is not configured");
  }
  return new Seam({ apiKey });
}

/**
 * Deny access by locking one device. Lock is the only hardware action.
 */
export async function applyHardwareConstraint(deviceId: string): Promise<void> {
  const trimmedDeviceId = deviceId.trim();
  if (!trimmedDeviceId) {
    throw new Error("deviceId is required");
  }
  const seam = getSeamClient();
  // TODO(Henry): confirm this lock call is the production hardware constraint.
  await seam.locks.lockDoor({ device_id: trimmedDeviceId });
}
