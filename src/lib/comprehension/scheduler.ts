import { LectureState, TranscriptSegment } from "@/lib/types";

const MARKERS = [
  "그런데",
  "따라서",
  "그러므로",
  "즉",
  "결국",
  "반면",
  "한편",
  "이제",
  "다음으로",
  "그렇다면",
  "여기서",
  "중요한 것은",
  "예를 들어",
  "쉽게 말하면",
  "다시 말하면",
];
const DEFINITIONS = ["이란", "라고 합니다", "의미합니다", "뜻합니다"];
const CONCLUSIONS = ["결론", "요컨대", "때문입니다", "중요합니다"];

export interface SchedulerDecision {
  trigger: boolean;
  reason: string;
  pending: TranscriptSegment[];
}
export class AdaptiveAnalysisScheduler {
  private pending: TranscriptSegment[] = [];
  private lastAnalyzedAt = 0;
  private previousTerms = new Set<string>();
  constructor(
    private maxChars = 1400,
    private minChars = 90,
  ) {}
  add(
    segment: TranscriptSegment,
    previous?: TranscriptSegment,
  ): SchedulerDecision {
    if (this.pending.some((item) => item.id === segment.id))
      return {
        trigger: false,
        reason: "duplicate",
        pending: [...this.pending],
      };
    this.pending.push(segment);
    const text = this.pending.map((s) => s.text).join(" ");
    const marker =
      MARKERS.some((m) => segment.text.includes(m)) &&
      text.length >= this.minChars;
    const structural =
      (DEFINITIONS.some((m) => segment.text.includes(m)) ||
        CONCLUSIONS.some((m) => segment.text.includes(m))) &&
      text.length >= this.minChars;
    const pause =
      !!previous &&
      segment.timestamp - previous.timestamp > 7_000 &&
      text.length >= this.minChars;
    const terms = new Set(segment.text.match(/[가-힣A-Za-z]{3,}/g) ?? []);
    const overlap = this.previousTerms.size
      ? [...terms].filter((t) => this.previousTerms.has(t)).length /
        Math.max(terms.size, 1)
      : 1;
    const topicShift = this.pending.length >= 3 && overlap < 0.12;
    const overflow = text.length >= this.maxChars || this.pending.length >= 7;
    this.previousTerms = terms;
    const trigger = marker || structural || pause || topicShift || overflow;
    return {
      trigger,
      reason: marker
        ? "discourse"
        : structural
          ? "structure"
          : pause
            ? "pause"
            : topicShift
              ? "topic-shift"
              : overflow
                ? "safety"
                : "accumulate",
      pending: [...this.pending],
    };
  }
  force(reason = "user"): SchedulerDecision {
    return {
      trigger: this.pending.length > 0,
      reason,
      pending: [...this.pending],
    };
  }
  consume(now = Date.now()): TranscriptSegment[] {
    const value = [...this.pending];
    this.pending = [];
    this.lastAnalyzedAt = now;
    return value;
  }
  getPending() {
    return [...this.pending];
  }
  getLastAnalyzedAt() {
    return this.lastAnalyzedAt;
  }
}

export function boundedContext(segments: TranscriptSegment[], maxChars = 1500) {
  const chosen: TranscriptSegment[] = [];
  let total = 0;
  for (let i = segments.length - 1; i >= 0; i--) {
    const size = segments[i].text.length;
    if (total + size > maxChars && chosen.length) break;
    chosen.unshift(segments[i]);
    total += size;
  }
  return chosen;
}
export function analysisPayload(
  state: LectureState,
  recent: TranscriptSegment[],
  pending: TranscriptSegment[],
) {
  return {
    state,
    recent: boundedContext(recent).map((s) => s.text),
    pending: pending.map((s) => s.text),
  };
}
