import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { openaiFetch } from "@/lib/server/openai";
const schema = z.object({
  keywords: z.array(z.string().max(80)).max(30).default([]),
  topic: z.string().max(200).optional(),
});
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") || 0) > 10_000)
      throw new Error("large");
    const input = schema.parse(await request.json());
    const prompt = [
      "한국어 교직·인문사회 강의. 영어 전문용어가 섞일 수 있음.",
      input.topic,
      ...input.keywords,
    ]
      .filter(Boolean)
      .join("; ");
    const data = await openaiFetch(
      "/realtime/client_secrets",
      {
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: {
                model:
                  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-live-transcribe",
                language: "ko",
                prompt,
                delay: "low",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            },
          },
        },
      },
      15_000,
    );
    return Response.json(
      { value: data.value, expires_at: data.expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Realtime credential creation failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "실시간 연결을 준비하지 못했습니다." },
      { status: 502 },
    );
  }
}
