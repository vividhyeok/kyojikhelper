import { LectureState, ComprehensionAnalysis } from "@/lib/types";

const uniqueLast = (values: string[], limit: number) =>
  [...new Set(values.filter(Boolean))].slice(-limit);
export function reduceLectureState(
  state: LectureState,
  analysis: ComprehensionAnalysis,
): LectureState {
  const p = analysis.statePatch;
  return {
    ...state,
    currentTopic: p.currentTopic || analysis.currentTopic || state.currentTopic,
    conceptChain: uniqueLast(p.conceptChain ?? state.conceptChain, 8),
    recentClaims: uniqueLast(p.recentClaims ?? state.recentClaims, 5),
    unresolved: uniqueLast(p.unresolved ?? state.unresolved, 5),
  };
}
