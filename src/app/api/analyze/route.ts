import { requireAuth } from "@/lib/server/auth";
import { openaiFetch, responseOutputText } from "@/lib/server/openai";
import {
  ANALYSIS_JSON_SCHEMA,
  analysisSchema,
  analyzeRequestSchema,
} from "@/lib/server/schemas";
const SYSTEM = `당신은 교직·인문사회 강의의 실시간 이해 보조기다. 교수 발화를 요약하거나 반복하지 말고, 학습자가 흐름을 놓치게 만드는 생략된 한두 단계만 찾는다. 충분히 이해 가능하거나 예시·반복·여담이면 shouldDisplay=false. 인과와 구조를 우선하고 A → B → C처럼 1~3줄로 쓴다. 추상어를 다른 추상어로 설명하지 않는다. 생소한 전제가 전체 이해를 막을 때만 prerequisite를 준다. 교수의 의견과 학술적 사실을 구분하고 교수 의도는 확신하지 못하면 단정하지 않는다. 낮은 confidence의 추측은 표시하지 않는다. nextFocus는 곧 실제 강의로 돌아가 무엇을 들을지 짧게 쓴다. statePatch에는 압축된 강의 상태만 둔다.`;
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") || 0) > 30_000)
      throw new Error("large");
    const input = analyzeRequestSchema.parse(await request.json());
    const mode =
      input.mode === "missed"
        ? "놓침: 3~5초 안에 읽을 현재 위치 복구를 만든다."
        : input.mode === "why"
          ? "왜?: 마지막 개념 전환이 왜 생겼는지만 한 화면 이내로 설명한다."
          : "자동 분석: 정말 말할 가치가 있을 때만 표시한다.";
    const data = await openaiFetch(
      "/responses",
      {
        model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.6-luna",
        input: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `${mode}\n설명 밀도: ${input.density}\n이해 프로필: ${input.profile}\nJSON 자료:\n${JSON.stringify({ state: input.state, recent: input.recent, pending: input.pending })}`,
          },
        ],
        max_output_tokens: 500,
        text: {
          format: {
            type: "json_schema",
            name: "comprehension_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
          },
        },
      },
      25_000,
    );
    const raw = JSON.parse(responseOutputText(data));
    for (const key of [
      "currentTopic",
      "conceptChain",
      "recentClaims",
      "unresolved",
    ] as const)
      if (raw.statePatch[key] === null) delete raw.statePatch[key];
    const result = analysisSchema.parse(raw);
    if (result.confidence < 0.58 && input.mode === "auto")
      result.shouldDisplay = false;
    return Response.json(result);
  } catch (error) {
    console.error(
      "Analysis failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "지금은 분석을 갱신하지 못했습니다." },
      { status: 502 },
    );
  }
}
