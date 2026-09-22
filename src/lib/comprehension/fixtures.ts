import { ComprehensionAnalysis, RelationType } from "@/lib/types";

export interface LectureFixtureTurn {
  utterance: string;
  relation: RelationType;
  move: string;
  topic: string;
  display: boolean;
  frame: string | null;
}

export const EDUCATION_HISTORY_FIXTURE: LectureFixtureTurn[] = [
  { utterance: "영웅교육은 공동체가 요구하는 용기와 명예를 기르는 교육입니다.", relation: "definition", move: "정의", topic: "영웅교육", display: true, frame: "영웅교육 = 공동체가 요구하는 인간상 형성" },
  { utterance: "저도 예전에 이 이야기를 들으며 시험공부가 참 힘들었어요.", relation: "association", move: "여담", topic: "영웅교육", display: false, frame: null },
  { utterance: "예를 들어 호메로스의 영웅 이야기를 떠올려 봅시다.", relation: "example", move: "사례", topic: "영웅교육", display: false, frame: "영웅교육 → 예: 호메로스의 영웅" },
  { utterance: "다시 영웅교육의 목표로 돌아오면, 공동체가 원하는 인간상이 핵심입니다.", relation: "return", move: "앞 주제로 복귀", topic: "영웅교육", display: false, frame: null },
  { utterance: "그런데 소크라테스의 문답법을 보죠. 두 교육은 무엇이 다를까요?", relation: "unclear", move: "질문·새 논점", topic: "소크라테스의 문답법", display: true, frame: "영웅교육 … 문답법" },
  { utterance: "영웅교육이 이상적 인간상을 제시했다면, 문답법은 질문으로 스스로 답을 찾게 합니다.", relation: "contrast", move: "비교", topic: "교육 방식의 비교", display: true, frame: "영웅교육 ↔ 문답법 / 기준: 가르치는 방식" },
  { utterance: "그 뒤 헬레니즘 시기에는 교육의 범위가 더 넓어집니다.", relation: "chronology", move: "역사적 전환", topic: "헬레니즘 교육", display: true, frame: "고전기 이후: 헬레니즘 교육" },
  { utterance: "당시 폴리스의 변화라는 배경도 알아야 합니다.", relation: "premise", move: "배경 설명", topic: "헬레니즘 교육", display: false, frame: null },
  { utterance: "제 생각에는 문답법이 오늘날에도 가장 좋은 방법입니다.", relation: "association", move: "교수 개인 평가", topic: "문답법", display: false, frame: null },
];

export function mockAnalysis(turn: LectureFixtureTurn): ComprehensionAnalysis {
  return {
    shouldDisplay: turn.display,
    eventType: turn.display ? "orientation" : "none",
    confidence: 0.9,
    currentTopic: turn.topic,
    professorMove: turn.move,
    relationType: turn.relation,
    epistemicStatus: turn.move === "교수 개인 평가" ? "professor_opinion" : turn.relation === "unclear" ? "unclear" : "explicit",
    understandingFrame: turn.frame,
    relationExplanation: turn.relation === "unclear" ? "관계는 아직 교수 설명만으로 확정되지 않음." : null,
    fromConcept: null,
    toConcept: null,
    missingBridge: null,
    prerequisite: null,
    shortExplanation: null,
    nextFocus: turn.relation === "unclear" ? "두 개념을 어떻게 연결하는지 듣기" : null,
    importance: "normal",
    statePatch: { currentTopic: turn.topic, professorMove: turn.move, relationType: turn.relation, epistemicStatus: turn.move === "교수 개인 평가" ? "professor_opinion" : turn.relation === "unclear" ? "unclear" : "explicit", professorPosition: turn.move === "교수 개인 평가" ? "문답법이 오늘날에도 가장 좋은 방법이라는 평가" : null },
  };
}
