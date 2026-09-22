import { ANALYSIS_LIMITS } from "./limits";
import { TranscriptSegment } from "../types";

export function boundedRetryBatch(failed: TranscriptSegment[], incoming: TranscriptSegment[]) {
  const seen = new Set<string>();
  return [...failed, ...incoming].filter((segment) => {
    if (seen.has(segment.id)) return false;
    seen.add(segment.id);
    return true;
  }).slice(-ANALYSIS_LIMITS.pendingMaxSegments);
}

export function retryDelay(attempt: number) {
  return attempt <= 2 ? Math.min(12_000, 2_000 * 2 ** (attempt - 1)) : null;
}
