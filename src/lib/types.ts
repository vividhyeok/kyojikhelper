export type EventType =
  | "none"
  | "bridge"
  | "definition"
  | "prerequisite"
  | "orientation"
  | "contrast";
export type Importance = "low" | "normal" | "high";

export interface LectureState {
  currentTopic: string;
  conceptChain: string[];
  recentClaims: string[];
  unresolved: string[];
  professorPosition: string | null;
}

export interface ComprehensionAnalysis {
  shouldDisplay: boolean;
  eventType: EventType;
  confidence: number;
  currentTopic: string;
  professorMove: string | null;
  fromConcept: string | null;
  toConcept: string | null;
  missingBridge: string | null;
  prerequisite: string | null;
  shortExplanation: string | null;
  nextFocus: string | null;
  importance: Importance;
  statePatch: Partial<
    Pick<
      LectureState,
      "currentTopic" | "conceptChain" | "recentClaims" | "unresolved"
    >
  >;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  final: true;
}
export interface ComprehensionEvent extends ComprehensionAnalysis {
  id: string;
  timestamp: number;
  source: "auto" | "missed" | "why";
}
export interface FinalNote {
  overview: string[];
  keyPoints: string[];
  bridges: { from: string; to: string; explanation: string }[];
  terms: { term: string; meaning: string }[];
  structure: string;
  review: string;
}
export interface Lecture {
  id: string;
  title: string;
  topic?: string;
  keywords: string[];
  startedAt: number;
  endedAt?: number;
  duration: number;
  status: "live" | "finished";
  transcriptSegments: TranscriptSegment[];
  comprehensionEvents: ComprehensionEvent[];
  stateSnapshots: { timestamp: number; state: LectureState }[];
  finalNote?: FinalNote;
}
export interface Settings {
  density: "minimal" | "normal";
  profile: string;
  transcriptDisplay: "hidden" | "small";
}
export const EMPTY_STATE: LectureState = {
  currentTopic: "강의를 듣는 중",
  conceptChain: [],
  recentClaims: [],
  unresolved: [],
  professorPosition: null,
};
