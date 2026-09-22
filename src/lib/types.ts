export type EventType =
  | "none"
  | "bridge"
  | "definition"
  | "prerequisite"
  | "orientation"
  | "contrast";
export type Importance = "low" | "normal" | "high";
export type RelationType = "cause" | "premise" | "problem_solution" | "contrast" | "example" | "elaboration" | "definition" | "category" | "chronology" | "return" | "association" | "unclear";
export type EpistemicStatus = "explicit" | "inferred" | "background" | "professor_opinion" | "unclear";
export interface ConceptLink { from: string; to: string; relation: RelationType; label?: string }

export interface LectureState {
  currentTopic: string;
  conceptChain: string[];
  recentClaims: string[];
  unresolved: string[];
  professorPosition: string | null;
  conceptLinks?: ConceptLink[];
  professorMove?: string | null;
  relationType?: RelationType;
  epistemicStatus?: EpistemicStatus;
  nextFocus?: string | null;
}

export interface ComprehensionAnalysis {
  shouldDisplay: boolean;
  eventType: EventType;
  confidence: number;
  currentTopic: string;
  professorMove: string | null;
  relationType?: RelationType;
  epistemicStatus?: EpistemicStatus;
  understandingFrame?: string | null;
  relationExplanation?: string | null;
  fromConcept: string | null;
  toConcept: string | null;
  missingBridge: string | null;
  prerequisite: string | null;
  shortExplanation: string | null;
  nextFocus: string | null;
  importance: Importance;
  statePatch: Partial<LectureState>;
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
  demo?: boolean;
  analysisCursor?: string;
  transcriptSegments: TranscriptSegment[];
  comprehensionEvents: ComprehensionEvent[];
  conceptLinks?: ConceptLink[];
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
  conceptLinks: [],
  professorMove: null,
  relationType: "unclear",
  epistemicStatus: "unclear",
  nextFocus: null,
};
