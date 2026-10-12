// Verifies each secret in .env.local works, printing only pass/fail (never the values).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

try {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.from("weights").select("key");
  console.log("Supabase:", error ? "FAIL " + error.message : `ok (${data.length} weights readable)`);
} catch (e) {
  console.log("Supabase: FAIL", e.message);
}

try {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const r = await ai.models.generateContent({ model: env.GEMINI_MODEL, contents: "Reply with the single word: pong" });
  console.log("Gemini:", `ok (${env.GEMINI_MODEL} replied "${r.text?.trim().slice(0, 20)}", tokens ${r.usageMetadata?.totalTokenCount})`);
} catch (e) {
  console.log("Gemini: FAIL", String(e.message).slice(0, 300));
}

console.log("Resend key format:", env.RESEND_API_KEY?.startsWith("re_") ? "ok" : "unexpected");
console.log("Recipient looks like email:", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.BRIEF_RECIPIENT_EMAIL ?? ""));
