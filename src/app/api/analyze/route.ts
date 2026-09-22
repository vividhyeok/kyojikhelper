import { requireAuth } from "@/lib/server/auth";
import { openaiFetch, responseOutputText } from "@/lib/server/openai";
import { enforceAnalysisPolicy } from "@/lib/comprehension/policy";
import {
  ANALYSIS_JSON_SCHEMA,
  analysisSchema,
  analyzeRequestSchema,
} from "@/lib/server/schemas";
const SYSTEM = `당신은 교직·인문사회 강의를 학습자의 개념 형성 문법으로 치환하는 Cognitive Translator다. 요약하지 않는다. 먼저 교수의 설명 동작(정의/비교/사례/구체화/역사적 배경/주장/의견/질문/복귀/여담)과 앞뒤 개념의 관계를 판별한다. 관계는 cause, premise, problem_solution, contrast, example, elaboration, definition, category, chronology, return, association, unclear 중 하나다. '그런데'만으로 인과를 추정하지 않는다. 교수가 아직 관계를 설명하지 않았다면 unclear로 두고 missingBridge를 창작하지 않는다. 예시를 새 주제로 승격하지 않는다. 인과가 아닌 관계를 화살표 인과 사슬로 만들지 않는다. 교수의 명시 발화 explicit, 문맥상 추론 inferred, 일반 배경지식 background, 교수 개인 평가 professor_opinion, 불명확 unclear를 구분한다. 배경지식이나 AI 추론을 교수 주장으로 단정하지 않는다. understandingFrame은 화면의 유일한 주 메시지다. 35~55자 이내의 한 관계만 써라. 비교는 'A ↔ B: 비교 기준', 사례는 'A → 예: B', 정의는 'A = 의미'처럼 쓴다. 쉼표로 여러 주장을 잇거나 '이라는 대비입니다' 같은 메타 설명을 붙이지 않는다. relationExplanation, shortExplanation, nextFocus에 같은 뜻을 다시 쓰지 않는다. 정말 필수인 보충 한 단계가 없으면 이 필드는 null로 둔다. 설명이 충분하거나 반복·여담이면 shouldDisplay=false여도 statePatch의 주제·move·관계를 갱신한다. 진짜 생략된 필수 전제만 missingBridge에 넣는다. 주제·관계·교수의 설명 역할이 의미 있게 바뀌면 짧은 이해 프레임을 표시할 가치가 있다. 기본 최소 밀도에서도 이 전환을 놓친 뒤 설명하면 늦다. 출력은 1~2초에 훑을 수 있어야 한다. statePatch의 conceptLinks는 새로 확인된 핵심 관계만 담는다. 교수 개인 의견이면 professorPosition을 갱신하고 recentClaims에 객관적 사실처럼 넣지 않는다.`;
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    if (Number(request.headers.get("content-length") || 0) > 30_000)
      throw new Error("large");
    const input = analyzeRequestSchema.parse(await request.json());
    const mode =
      input.mode === "missed"
          ? "놓침: 전체 요약이 아니라 여기까지의 핵심 위치 → 지금 하는 설명 동작 → 다음에 들을 점을 3~5초 분량으로 복구한다."
        : input.mode === "why"
          ? "왜?: 관계 종류에 맞게 답한다. 비교는 비교 기준, 사례는 앞 개념의 구체화, 불명확하면 아직 근거가 없음을 말한다. 인과를 만들지 않는다."
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
        max_output_tokens: 850,
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
      "conceptLinks",
      "professorMove",
      "relationType",
      "epistemicStatus",
      "nextFocus",
    ] as const)
      if (raw.statePatch[key] === null) delete raw.statePatch[key];
    for (const link of raw.statePatch.conceptLinks ?? [])
      if (link.label === null) delete link.label;
    const result = enforceAnalysisPolicy(analysisSchema.parse(raw), input.mode);
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
