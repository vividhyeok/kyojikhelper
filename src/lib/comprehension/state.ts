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
    conceptLinks: [...(state.conceptLinks ?? []), ...(p.conceptLinks ?? [])].filter((link, index, all) => all.findIndex(x => x.from === link.from && x.to === link.to && x.relation === link.relation) === index).slice(-20),
    professorMove: p.professorMove ?? analysis.professorMove ?? state.professorMove ?? null,
    relationType: p.relationType ?? analysis.relationType ?? state.relationType ?? "unclear",
    epistemicStatus: p.epistemicStatus ?? analysis.epistemicStatus ?? state.epistemicStatus ?? "unclear",
    nextFocus: p.nextFocus ?? analysis.nextFocus ?? state.nextFocus ?? null,
    professorPosition: p.professorPosition === undefined ? state.professorPosition : p.professorPosition,
  };
}
