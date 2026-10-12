// Small text helpers shared by ingest, extraction and scoring.

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">",
  "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"', "&ndash;": "-", "&mdash;": "-", "&hellip;": "...",
};

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? (m.startsWith("&#") ? String.fromCharCode(Number(m.slice(2, -1))) : " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Keeps at most `n` words — evidence quotes are never longer than this. */
export function clipWords(s: string | null | undefined, n = 15): string | null {
  if (!s) return null;
  const words = s.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= n ? words.join(" ") : words.slice(0, n).join(" ") + "…";
}

const YT = /(?:youtube\.com\/(?:watch\?(?:[^"'\s<>]*?&(?:amp;)?)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Finds the first YouTube video link in raw text/HTML and returns a canonical watch URL. */
export function findYouTube(text: string): string | null {
  const m = text.match(YT);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

/** Lowercase, strip punctuation and collapse whitespace — used for exact-match entity lookups. */
export function normName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Appends `&t=<seconds>s` to a YouTube URL so the link opens at the sponsor read. */
export function withTimestamp(url: string, seconds: number | null | undefined): string {
  if (seconds == null || !/youtube\.com\/watch/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Math.max(0, Math.round(seconds))}s`;
}
