import crypto from "crypto";

/**
 * Derives a deterministic session token from the ACCESS_KEY.
 * Both login route and middleware use this to verify sessions.
 */
export function getSessionToken(): string {
  const accessKey = process.env.ACCESS_KEY || "";
  return crypto.createHash("sha256").update(`session:${accessKey}`).digest("hex");
}
