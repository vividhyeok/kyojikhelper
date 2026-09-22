import { describe, expect, it } from "vitest";
import { reduceLectureState } from "./state";
import { EMPTY_STATE, ComprehensionAnalysis } from "@/lib/types";
const a: ComprehensionAnalysis = {
  shouldDisplay: true,
  eventType: "bridge",
  confidence: 0.9,
  currentTopic: "계약",
  professorMove: null,
  fromConcept: "교환",
  toConcept: "계약",
  missingBridge: "보장이 필요함",
  prerequisite: null,
  shortExplanation: null,
  nextFocus: "국가",
  importance: "normal",
  statePatch: {
    currentTopic: "계약",
    conceptChain: ["개인", "교환", "계약"],
    recentClaims: ["교환에는 보장이 필요하다"],
  },
};
describe("lecture state", () =>
  it("applies compact state patch", () => {
    const s = reduceLectureState(EMPTY_STATE, a);
    expect(s.currentTopic).toBe("계약");
    expect(s.conceptChain).toEqual(["개인", "교환", "계약"]);
  }));
it("preserves relation-aware links without promoting professor opinion to a fact", () => {
  const opinion = { ...a, relationType: "contrast" as const, epistemicStatus: "professor_opinion" as const, professorMove: "교수 개인 평가", statePatch: { conceptLinks: [{ from: "영웅교육", to: "문답법", relation: "contrast" as const }], professorPosition: "문답법이 더 낫다는 교수 평가" } };
  const first = reduceLectureState(EMPTY_STATE, opinion);
  const second = reduceLectureState(first, opinion);
  expect(second.conceptLinks).toHaveLength(1);
  expect(second.professorPosition).toContain("교수 평가");
  expect(second.recentClaims).toEqual([]);
});
