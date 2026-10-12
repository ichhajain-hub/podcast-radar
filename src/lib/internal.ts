// Calls from the orchestrator to this app's own routes. Always one hop deep: Vercel rejects
// deeper self-call chains with HTTP 508 (loop detected).

export function selfOrigin(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.LOCAL_ORIGIN ?? "http://localhost:3000";
}

/** POSTs to one of this app's own routes and returns its JSON reply. */
export async function kickAndWait<T>(path: string, body: unknown = {}, timeoutMs = 30_000): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    "content-type": "application/json",
  };
  // Preview deployments sit behind Vercel login; this system secret lets the app call itself.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const res = await fetch(`${selfOrigin()}${path}`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
