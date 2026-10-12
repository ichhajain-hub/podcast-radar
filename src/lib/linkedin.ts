import { callGemini } from "./gemini";
import { db } from "./supabase";
import { normName } from "./text";

// LinkedIn + company website lookup (spec 5.6) with Gemini + Google Search grounding.
// A URL is kept ONLY if it appears in the response's grounding sources; otherwise the
// guest gets a LinkedIn people-search link and linkedin_verified = false.
// We never collect emails or phone numbers.

export function linkedinSearchUrl(name: string, company?: string | null): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([name, company].filter(Boolean).join(" "))}`;
}

/** Grounding chunk URIs are Google redirect links; follow one hop to get the real page URL. */
async function resolveRedirect(uri: string): Promise<string> {
  if (!/grounding-api-redirect|vertexaisearch/.test(uri)) return uri;
  try {
    const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return res.headers.get("location") ?? uri;
  } catch {
    return uri;
  }
}

const clean = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "");
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export type LookupResult = { linkedin_url: string; linkedin_verified: boolean; website_url: string | null; sources: string[] };

export async function lookupGuest(name: string, company: string | null, role: string | null, runId: string | null): Promise<LookupResult> {
  const res = await callGemini({
    task: "linkedin_lookup", runId, note: name,
    config: { tools: [{ googleSearch: {} }] },
    contents: `Find the public LinkedIn profile of ${name}${role ? `, ${role}` : ""}${company ? ` at ${company}` : ""} (an Indian business podcast guest), and the official website of ${company ? `"${company}"` : "their company"}.
Answer in exactly two lines:
LINKEDIN: <full linkedin.com/in/ URL or NONE>
WEBSITE: <official company website URL or NONE>
Only give URLs you found in search results. Do not include emails or phone numbers.`,
  });

  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = (await Promise.all(chunks.map((c) => (c.web?.uri ? resolveRedirect(c.web.uri) : null)))).filter((u): u is string => !!u);
  const text = res.text ?? "";
  const claimedLinkedIn = text.match(/LINKEDIN:\s*(https?:\/\/\S+)/i)?.[1];
  const claimedSite = text.match(/WEBSITE:\s*(https?:\/\/\S+)/i)?.[1];

  // LinkedIn: must be a grounded linkedin.com/in/ source (prefer the one the model named).
  const nameBits = normName(name).split(" ").filter((w) => w.length > 2);
  const profiles = sources.filter((u) => /linkedin\.com\/in\//i.test(u)).map(clean);
  const linkedin =
    profiles.find((u) => claimedLinkedIn && clean(claimedLinkedIn).toLowerCase() === u.toLowerCase()) ??
    profiles.find((u) => nameBits.some((b) => u.toLowerCase().includes(b)));

  // Website: the model's answer counts only if its domain is among the grounded sources.
  const groundedHosts = new Set(sources.map(host));
  const site = company && claimedSite && groundedHosts.has(host(claimedSite)) && !/linkedin|wikipedia|youtube|instagram|twitter|x\.com|facebook/.test(host(claimedSite))
    ? `https://${host(claimedSite)}`
    : null;

  return linkedin
    ? { linkedin_url: linkedin, linkedin_verified: true, website_url: site, sources }
    : { linkedin_url: linkedinSearchUrl(name, company), linkedin_verified: false, website_url: site, sources };
}

/** Looks up guests that passed the gate and haven't been looked up in 30 days. */
export async function lookupGuests(guests: { entity_id: string; name: string }[], runId: string | null, limit = 10) {
  const ids = guests.map((g) => g.entity_id);
  if (!ids.length) return 0;
  const { data } = await db().from("entities").select("id, canonical_name, company, role, lookup_at").in("id", ids);
  const due = (data ?? []).filter((e) => !e.lookup_at || Date.now() - Date.parse(e.lookup_at) > 30 * 864e5).slice(0, limit);
  for (const e of due) {
    try {
      const r = await lookupGuest(e.canonical_name, e.company, e.role, runId);
      await db().from("entities").update({
        linkedin_url: r.linkedin_url, linkedin_verified: r.linkedin_verified, website_url: r.website_url, lookup_at: new Date().toISOString(),
      }).eq("id", e.id);
    } catch (err) {
      console.error("lookup failed", e.canonical_name, (err as Error).message);
    }
  }
  return due.length;
}
