import { ComprehensionAnalysis, RelationType } from "@/lib/types";

const NON_CAUSAL = new Set<RelationType>(["contrast", "example", "elaboration", "definition", "category", "chronology", "return", "association", "unclear"]);

export function enforceAnalysisPolicy(value: ComprehensionAnalysis, mode: "auto" | "missed" | "why"): ComprehensionAnalysis {
  const result = { ...value };
  if (result.relationType && NON_CAUSAL.has(result.relationType)) {
    result.missingBridge = null;
    if (result.eventType === "bridge") result.eventType = "orientation";
    result.statePatch = {
      ...result.statePatch,
      conceptLinks: result.statePatch.conceptLinks?.map(link => ({ ...link, relation: result.relationType! })),
    };
  }
  if (result.relationType === "example" && result.fromConcept) {
    result.currentTopic = result.fromConcept;
    result.statePatch = { ...result.statePatch, currentTopic: result.fromConcept };
  }
  if (result.relationType === "unclear") {
    result.epistemicStatus = "unclear";
    result.relationExplanation = "관계는 아직 교수 설명만으로 확정되지 않음.";
    if (result.fromConcept && result.toConcept)
      result.understandingFrame = `${result.fromConcept} … ${result.toConcept}`;
  }
  if (result.relationType === "contrast" && result.understandingFrame)
    result.understandingFrame = result.understandingFrame.replace(/→/g, "↔");
  if (result.epistemicStatus === "professor_opinion") {
    result.statePatch = { ...result.statePatch, recentClaims: undefined };
  }
  if (mode === "auto" && result.confidence < 0.58) result.shouldDisplay = false;
  return result;
}
