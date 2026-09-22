import { describe, expect, it } from "vitest";
import { EDUCATION_HISTORY_FIXTURE, mockAnalysis } from "./fixtures";
import { reduceLectureState } from "./state";
import { EMPTY_STATE } from "@/lib/types";
import { AdaptiveAnalysisScheduler } from "./scheduler";
import { enforceAnalysisPolicy } from "./policy";

describe("교직 수업형 관계 회귀", () => {
  it("사례·비교·시대 전환·불명확 전환을 인과 연결로 만들지 않는다", () => {
    for (const turn of EDUCATION_HISTORY_FIXTURE) {
      const result = enforceAnalysisPolicy({ ...mockAnalysis(turn), missingBridge: "잘못 추론한 인과" }, "auto");
      expect(result.relationType).toBe(turn.relation);
      if (["example", "contrast", "chronology", "unclear"].includes(turn.relation))
        expect(result.missingBridge).toBeNull();
    }
  });
  it("비교 프레임은 인과 화살표를 표시하지 않는다", () => {
    const turn = EDUCATION_HISTORY_FIXTURE.find(x => x.relation === "contrast")!;
    const result = enforceAnalysisPolicy({ ...mockAnalysis(turn), understandingFrame: "영웅교육 → 문답법" }, "auto");
    expect(result.understandingFrame).toBe("영웅교육 ↔ 문답법");
  });
  it("사례를 새 주제로 승격하지 않고 불명확한 링크에 인과를 기록하지 않는다", () => {
    const example = enforceAnalysisPolicy({ ...mockAnalysis(EDUCATION_HISTORY_FIXTURE[2]), fromConcept: "영웅교육", toConcept: "호메로스", currentTopic: "호메로스" }, "auto");
    expect(example.currentTopic).toBe("영웅교육");
    const unclear = enforceAnalysisPolicy({ ...mockAnalysis(EDUCATION_HISTORY_FIXTURE[4]), fromConcept: "영웅교육", toConcept: "문답법", statePatch: { conceptLinks: [{ from:"영웅교육", to:"문답법", relation:"cause" }] } }, "auto");
    expect(unclear.statePatch.conceptLinks?.[0].relation).toBe("unclear");
    expect(unclear.understandingFrame).toBe("영웅교육 … 문답법");
  });
  it("사례는 주제를 유지하고 교수 평가는 별도 위치에 저장한다", () => {
    let state = EMPTY_STATE;
    for (const turn of EDUCATION_HISTORY_FIXTURE) {
      state = reduceLectureState(state, mockAnalysis(turn));
      if (turn.move === "사례") expect(state.currentTopic).toBe("영웅교육");
    }
    expect(state.professorPosition).toContain("가장 좋은 방법");
    expect(state.recentClaims).not.toContain(state.professorPosition);
  });
  it("실패한 batch를 다음 분석으로 되돌린다", () => {
    const scheduler = new AdaptiveAnalysisScheduler();
    const first = {id:"1",text:EDUCATION_HISTORY_FIXTURE[0].utterance,timestamp:1,final:true as const};
    const second = {id:"2",text:EDUCATION_HISTORY_FIXTURE[4].utterance,timestamp:2,final:true as const};
    scheduler.add(first); scheduler.add(second);
    const batch = scheduler.consume();
    scheduler.requeue(batch);
    expect(scheduler.getPending().map(x => x.id)).toEqual(["1","2"]);
  });
});
