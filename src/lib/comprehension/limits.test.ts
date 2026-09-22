import { describe, expect, it } from "vitest";
import { analysisPayload, boundedContext } from "./scheduler";
import { boundedRetryBatch, retryDelay } from "./retry";
import { ANALYSIS_LIMITS } from "./limits";
import { EMPTY_STATE, TranscriptSegment } from "../types";

const segments: TranscriptSegment[] = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, text: `교육철학의 짧은 발화 ${i}`, timestamp: i, final: true }));
describe("shared analysis limits", () => {
  it("bounds both counts and characters while preserving newest context", () => {
    const payload = analysisPayload(EMPTY_STATE, segments.slice(0, 20), segments.slice(20));
    expect(payload.recent.length).toBeLessThanOrEqual(ANALYSIS_LIMITS.recentMaxSegments);
    expect(payload.pending.length).toBeLessThanOrEqual(ANALYSIS_LIMITS.pendingMaxSegments);
    expect(payload.recent.join("").length).toBeLessThanOrEqual(ANALYSIS_LIMITS.recentMaxChars);
    expect(payload.pending.join("").length).toBeLessThanOrEqual(ANALYSIS_LIMITS.pendingMaxChars);
    expect(payload.pending.at(-1)).toContain("29");
    expect(boundedContext(segments, { maxChars: 50, maxSegments: 12 }).map(s => s.text).join("").length).toBeLessThanOrEqual(50);
  });
  it("keeps retries bounded and duplicate free", () => {
    let failed = segments.slice(0, 10);
    for (let i = 10; i < 30; i += 3) failed = boundedRetryBatch(failed, segments.slice(i, i + 3));
    expect(failed).toHaveLength(ANALYSIS_LIMITS.pendingMaxSegments);
    expect(new Set(failed.map(s => s.id)).size).toBe(failed.length);
    expect(failed.at(-1)?.id).toBe("s29");
    expect(retryDelay(1)).toBe(2000);
    expect(retryDelay(3)).toBeNull();
  });
});
