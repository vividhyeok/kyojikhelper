import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { openaiFetch } from "@/lib/server/openai";
import { transcriptionSession } from "@/lib/transcription-config";
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
    const data = await openaiFetch(
      "/realtime/client_secrets",
      transcriptionSession({
        model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-live-transcribe",
        topic: input.topic,
        keywords: input.keywords,
      }),
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
