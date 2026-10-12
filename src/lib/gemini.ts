import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentResponse, type Part } from "@google/genai";
import { z } from "zod";
import { db } from "./supabase";

// Every AI task in the product goes through this file, using the model named in GEMINI_MODEL.

export function geminiModel(): string {
  const m = process.env.GEMINI_MODEL;
  if (!m) throw new Error("GEMINI_MODEL not set");
  return m;
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export type UsageEntry = {
  task: string;
  model: string;
  at: string;
  ok: boolean;
  prompt_tokens: number;
  output_tokens: number;
  thought_tokens: number;
  total_tokens: number;
  note?: string;
};

async function logUsage(runId: string | null | undefined, entry: UsageEntry) {
  if (!runId) return;
  const { error } = await db().rpc("run_log_usage", { p_run: runId, p_entry: entry });
  if (error) console.error("usage log failed", error.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errStatus(e: unknown): string {
  const any = e as { status?: number; message?: string };
  return `${any.status ?? ""} ${any.message ?? String(e)}`;
}
const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed|ECONNRESET/i;

export type CallArgs = {
  task: string;
  runId?: string | null;
  contents: string | Part[];
  config?: GenerateContentConfig;
  note?: string;
};

/** One Gemini call with exponential backoff on 429/5xx; token counts go to runs.log. */
export async function callGemini(args: CallArgs): Promise<GenerateContentResponse> {
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: geminiModel(),
        contents: args.contents,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, ...args.config },
      });
      const u = res.usageMetadata ?? {};
      await logUsage(args.runId, {
        task: args.task, model: geminiModel(), at: new Date().toISOString(), ok: true,
        prompt_tokens: u.promptTokenCount ?? 0, output_tokens: u.candidatesTokenCount ?? 0,
        thought_tokens: u.thoughtsTokenCount ?? 0, total_tokens: u.totalTokenCount ?? 0, note: args.note,
      });
      return res;
    } catch (e) {
      if (attempt < 4 && RETRYABLE.test(errStatus(e))) {
        await sleep(delay + Math.random() * 500);
        delay *= 2;
        continue;
      }
      await logUsage(args.runId, {
        task: args.task, model: geminiModel(), at: new Date().toISOString(), ok: false,
        prompt_tokens: 0, output_tokens: 0, thought_tokens: 0, total_tokens: 0,
        note: `${args.note ?? ""} ${errStatus(e)}`.trim().slice(0, 300),
      });
      throw e;
    }
  }
}

/**
 * Structured JSON call: response schema enforced by Gemini, then validated with zod.
 * Retries once if the JSON is invalid or fails validation.
 */
export async function generateJson<S extends z.ZodType>(args: {
  task: string;
  runId?: string | null;
  prompt: string;
  parts?: Part[];
  schema: S;
  config?: GenerateContentConfig;
  note?: string;
}): Promise<z.infer<S>> {
  const contents: Part[] = [...(args.parts ?? []), { text: args.prompt }];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callGemini({
      task: args.task, runId: args.runId, contents, note: args.note,
      config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(args.schema), ...args.config },
    });
    try {
      return args.schema.parse(JSON.parse(res.text ?? ""));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Gemini returned invalid JSON for ${args.task}: ${String(lastErr).slice(0, 200)}`);
}
