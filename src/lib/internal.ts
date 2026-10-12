// Calls between this app's own routes (orchestrator -> ingest -> finalize).
// Each call returns 202 quickly and the work continues in its own function invocation.

export function selfOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.LOCAL_ORIGIN ?? "http://localhost:3000";
}

export async function kick(path: string, body: unknown = {}): Promise<void> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    "content-type": "application/json",
  };
  // Preview deployments sit behind Vercel login; this system secret lets the app call itself.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const res = await fetch(`${selfOrigin()}${path}`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
}
