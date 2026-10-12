// Dev probe: checks JSON-schema output and thinking settings on GEMINI_MODEL.
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const schema = z.object({ items: z.array(z.object({ name: z.string(), score: z.number() })) });
for (const thinking of [undefined, { thinkingLevel: "low" }, { thinkingLevel: "minimal" }]) {
  try {
    const t = Date.now();
    const r = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: "List 2 Indian startup founders with a 1-5 fame score.",
      config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema), ...(thinking ? { thinkingConfig: thinking } : {}) },
    });
    console.log(JSON.stringify(thinking), Date.now() - t, "ms", JSON.stringify(r.usageMetadata), schema.safeParse(JSON.parse(r.text)).success);
  } catch (e) { console.log(JSON.stringify(thinking), "ERR", e.message.slice(0, 200)); }
}
