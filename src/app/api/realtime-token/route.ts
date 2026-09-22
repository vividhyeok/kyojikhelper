import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { OpenAIRequestError, openaiFetch } from "@/lib/server/openai";
import {
  minimalTranscriptionSession,
  transcriptionSession,
} from "@/lib/transcription-config";

const schema = z.object({
  keywords: z.array(z.string()).default([]),
  topic: z.string().optional(),
  title: z.string().max(120).optional(),
  quality: z.enum(["accuracy", "balanced"]).default("accuracy"),
});

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let input: z.infer<typeof schema>;
  try {
    if (Number(request.headers.get("content-length") || 0) > 10_000)
      return Response.json({ error: "입력이 너무 깁니다." }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 10_000)
      return Response.json({ error: "입력이 너무 깁니다." }, { status: 413, headers });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ error: "수업 설정을 확인해 주세요." }, { status: 400, headers });
    input = parsed.data;
  } catch {
    return Response.json({ error: "수업 설정을 읽지 못했습니다." }, { status: 400, headers });
  }

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-live-transcribe";
  const payload = transcriptionSession({
    model,
    topic: input.topic?.slice(0, 200),
    title: input.title,
    quality: input.quality,
    keywords: input.keywords,
  });

  try {
    let data;
    try {
      data = await openaiFetch("/realtime/client_secrets", payload, 20_000);
    } catch (error) {
      if (
        !(error instanceof OpenAIRequestError) ||
        error.status !== 400 ||
        !error.param?.startsWith("session.audio.input.transcription")
      ) throw error;
      // If optional hints are rejected, keep transcription available without them.
      data = await openaiFetch(
        "/realtime/client_secrets",
        minimalTranscriptionSession(model),
        20_000,
      );
    }
    return Response.json(
      { value: data.value, expires_at: data.expires_at },
      { headers },
    );
  } catch (error) {
    const diagnostic =
      error instanceof OpenAIRequestError
        ? { status: error.status, code: error.code, param: error.param }
        : error instanceof Error && error.name === "TimeoutError"
          ? { code: "upstream_timeout" }
          : { code: "server_error" };
    console.error("Realtime credential creation failed", diagnostic);
    return Response.json(
      { error: "실시간 연결을 준비하지 못했습니다.", diagnostic },
      { status: 502, headers },
    );
  }
}
