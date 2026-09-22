import { z } from "zod";

export type ResponseStage = "openai_incomplete" | "empty_output" | "json_parse" | "schema_validation" | "openai_request";
export class ResponseProcessingError extends Error {
  constructor(readonly stage: ResponseStage, readonly retryable: boolean, readonly reason?: string) {
    super(stage);
  }
}
export interface OpenAIResponseBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string } | null;
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
}
export function completedOutputText(data: OpenAIResponseBody): string {
  if (data.status === "incomplete") {
    const reason = data.incomplete_details?.reason ?? "unknown";
    throw new ResponseProcessingError("openai_incomplete", reason === "max_output_tokens", reason);
  }
  if (data.status !== "completed") throw new ResponseProcessingError("openai_request", false, data.error?.code ?? data.status ?? "missing_status");
  const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
  if (!text.trim()) throw new ResponseProcessingError("empty_output", false);
  return text;
}
export function parseStructuredResponse<T>(data: OpenAIResponseBody, schema: z.ZodType<T>): T {
  const text = completedOutputText(data);
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { throw new ResponseProcessingError("json_parse", false); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ResponseProcessingError("schema_validation", false);
  return parsed.data;
}
