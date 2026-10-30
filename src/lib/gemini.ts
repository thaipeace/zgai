import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

const g = globalThis as unknown as { __genai?: GoogleGenAI };
function client(): GoogleGenAI {
  g.__genai ??= new GoogleGenAI({ apiKey: config.geminiApiKey });
  return g.__genai;
}

type JsonSchema = Record<string, unknown>;

/**
 * Gọi Gemini qua Interactions API.
 * `store: false` để Google không lưu lại hội thoại phía server (dữ liệu nhóm là dữ liệu nhạy cảm).
 */
export async function generateJson<T>(system: string, input: string, schema: JsonSchema): Promise<T> {
  const interaction = await client().interactions.create({
    model: config.geminiModel,
    system_instruction: system,
    input,
    response_format: { type: "text", mime_type: "application/json", schema },
    store: false,
  });
  const text = interaction.output_text;
  if (!text) throw new Error("Gemini không trả về nội dung");
  return JSON.parse(text) as T;
}

export async function generateText(system: string, input: string): Promise<string> {
  const interaction = await client().interactions.create({
    model: config.geminiModel,
    system_instruction: system,
    input,
    store: false,
  });
  return interaction.output_text ?? "";
}

