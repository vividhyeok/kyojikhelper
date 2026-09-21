import { requireAuth } from "@/lib/server/auth";
import { finalizeSchema, finalNoteSchema } from "@/lib/server/schemas";
import { openaiFetch, responseOutputText } from "@/lib/server/openai";
const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "array", items: { type: "string" } },
    keyPoints: { type: "array", items: { type: "string" } },
    bridges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["from", "to", "explanation"],
      },
    },
    terms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { term: { type: "string" }, meaning: { type: "string" } },
        required: ["term", "meaning"],
      },
    },
    structure: { type: "string" },
    review: { type: "string" },
  },
  required: [
    "overview",
    "keyPoints",
    "bridges",
    "terms",
    "structure",
    "review",
  ],
};
const summarizeChunk = async (text: string) => {
  const data = await openaiFetch(
    "/responses",
    {
      model: process.env.OPENAI_SUMMARY_MODEL || "gpt-5.6-luna",
      input: `다음 강의 조각의 개념 이동과 핵심 주장만 700자 이하로 압축하라. 교수 의견은 의견으로 표시하라.\n${text}`,
      max_output_tokens: 350,
    },
    30_000,
  );
  return responseOutputText(data);
};
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") || 0) > 600_000)
      throw new Error("large");
    const input = finalizeSchema.parse(await request.json());
    const joined = input.transcript.join("\n");
    let source = joined;
    if (joined.length > 15_000) {
      const chunks = joined.match(/[\s\S]{1,8000}(?:\n|$)/g) ?? [joined];
      source = (await Promise.all(chunks.map(summarizeChunk))).join("\n---\n");
    }
    const data = await openaiFetch(
      "/responses",
      {
        model: process.env.OPENAI_SUMMARY_MODEL || "gpt-5.6-luna",
        input: [
          {
            role: "system",
            content:
              "단순 요약이 아니라 교수가 A에서 B로 간 논리 구조를 복원한다. 짧고 복습 가능한 한국어로 쓴다. 확실한 학술 내용과 교수 의견을 구분한다.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.title,
              rollingState: input.state,
              detectedBridges: input.events,
              transcriptOrChunkSummaries: source,
            }),
          },
        ],
        max_output_tokens: 1600,
        text: {
          format: {
            type: "json_schema",
            name: "lecture_note",
            strict: true,
            schema: NOTE_SCHEMA,
          },
        },
      },
      50_000,
    );
    return Response.json(
      finalNoteSchema.parse(JSON.parse(responseOutputText(data))),
    );
  } catch (error) {
    console.error(
      "Finalization failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      {
        error:
          "복습 노트를 만들지 못했습니다. 전사 기록은 안전하게 남아 있습니다.",
      },
      { status: 502 },
    );
  }
}
