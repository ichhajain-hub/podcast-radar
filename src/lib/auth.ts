import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

// Admin session for /settings: a signed httpOnly cookie that lasts 7 days.
// Cron and internal pipeline calls use `Authorization: Bearer ${CRON_SECRET}` instead.

const COOKIE = "radar_admin";
const MAX_AGE = 7 * 24 * 60 * 60;

function sessionToken(): string {
  const secret = process.env.CRON_SECRET;
  const pw = process.env.ADMIN_PASSWORD;
  if (!secret || !pw) throw new Error("CRON_SECRET / ADMIN_PASSWORD not set");
  return createHmac("sha256", secret).update(`admin:${pw}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string): boolean {
  return !!process.env.ADMIN_PASSWORD && safeEqual(input, process.env.ADMIN_PASSWORD);
}

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  return !!v && safeEqual(v, sessionToken());
}

export async function startSession() {
  (await cookies()).set(COOKIE, sessionToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: MAX_AGE, path: "/",
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export function unauthorized() {
  return Response.json({ error: "Not signed in. Open /settings and enter the admin password." }, { status: 401 });
}
