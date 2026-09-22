import { LectureState, TranscriptSegment } from "@/lib/types";
import { ANALYSIS_LIMITS } from "./limits";

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
  private quietBatches = 0;
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
      segment.text.length >= 22 && (!!previous || this.pending.length >= 2);
    const structural =
      (DEFINITIONS.some((m) => segment.text.includes(m)) ||
        CONCLUSIONS.some((m) => segment.text.includes(m))) &&
      text.length >= Math.min(this.minChars, 55);
    const pause =
      !!previous &&
      segment.timestamp - previous.timestamp > 7_000 &&
      text.length >= Math.min(this.minChars, 70);
    const terms = new Set(segment.text.match(/[가-힣A-Za-z]{3,}/g) ?? []);
    const overlap = this.previousTerms.size
      ? [...terms].filter((t) => this.previousTerms.has(t)).length /
        Math.max(terms.size, 1)
      : 1;
    const namedTransition = /(?:이제|다음은|다음으로|이번에는|한편|반면|에 비해|와 달리|라는 개념)/.test(segment.text);
    const topicShift = this.pending.length >= 2 && namedTransition && overlap < 0.25 && text.length >= 100;
    const meaningfulBatch = this.pending.length >= 2 && text.length >= (this.quietBatches >= 2 ? 120 : 95);
    const substantialTurn = !!previous && segment.text.length >= 150;
    const overflow = text.length >= this.maxChars || this.pending.length >= 7;
    this.previousTerms = terms;
    const trigger = marker || structural || pause || topicShift || meaningfulBatch || substantialTurn || overflow;
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
              : meaningfulBatch
                ? "batch"
                : substantialTurn
                  ? "substantial-turn"
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
  requeue(segments: TranscriptSegment[]) {
    const ids = new Set(this.pending.map(s => s.id));
    this.pending = [...segments.filter(s => !ids.has(s.id)), ...this.pending];
  }
  recordOutcome(displayed: boolean) {
    this.quietBatches = displayed ? 0 : Math.min(3, this.quietBatches + 1);
  }
  getPending() {
    return [...this.pending];
  }
  getLastAnalyzedAt() {
    return this.lastAnalyzedAt;
  }
}

export function boundedContext(
  segments: TranscriptSegment[],
  limits: { maxChars: number; maxSegments: number } = {
    maxChars: ANALYSIS_LIMITS.recentMaxChars,
    maxSegments: ANALYSIS_LIMITS.recentMaxSegments,
  },
) {
  const chosen: TranscriptSegment[] = [];
  let total = 0;
  const seen = new Set<string>();
  for (let i = segments.length - 1; i >= 0 && chosen.length < limits.maxSegments; i--) {
    const segment = segments[i];
    if (seen.has(segment.id)) continue;
    const text = segment.text.slice(-ANALYSIS_LIMITS.segmentMaxChars);
    const remaining = limits.maxChars - total;
    if (remaining <= 0) break;
    const kept = text.slice(-remaining);
    chosen.unshift({ ...segment, text: kept });
    seen.add(segment.id);
    total += kept.length;
  }
  return chosen;
}
export function analysisPayload(
  state: LectureState,
  recent: TranscriptSegment[],
  pending: TranscriptSegment[],
) {
  const latestPending = boundedContext(pending, {
    maxChars: ANALYSIS_LIMITS.pendingMaxChars,
    maxSegments: ANALYSIS_LIMITS.pendingMaxSegments,
  });
  const chosenIds = new Set(latestPending.map((s) => s.id));
  const overflow = pending.filter((s) => !chosenIds.has(s.id));
  const latestRecent = boundedContext([...recent, ...overflow], {
    maxChars: ANALYSIS_LIMITS.recentMaxChars,
    maxSegments: ANALYSIS_LIMITS.recentMaxSegments,
  });
  return {
    state,
    recent: latestRecent.map((s) => s.text),
    pending: latestPending.map((s) => s.text),
  };
}
