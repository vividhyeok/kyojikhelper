import { describe, expect, it } from "vitest";
import { AdaptiveAnalysisScheduler } from "./comprehension/scheduler";
import { reduceLectureState } from "./comprehension/state";
import { shouldReplaceCard } from "./comprehension/card-policy";
import { lectureToMarkdown } from "./export";
import {
  ComprehensionEvent,
  EMPTY_STATE,
  Lecture,
  TranscriptSegment,
} from "./types";

describe("mock lecture flow integration", () => {
  it("starts, batches transcript, updates HUD, finalizes history data and exports", () => {
    const scheduler = new AdaptiveAnalysisScheduler(1400, 30);
    const transcript: TranscriptSegment[] = [
      {
        id: "1",
        text: "근대사회에서는 개인이 자신의 의사에 따라 선택합니다.",
        timestamp: 1,
        final: true,
      },
      {
        id: "2",
        text: "그런데 결국 사람들은 서로 교환을 하게 됩니다.",
        timestamp: 2,
        final: true,
      },
    ];
    expect(scheduler.add(transcript[0]).trigger).toBe(false);
    expect(scheduler.add(transcript[1], transcript[0]).trigger).toBe(true);
    expect(scheduler.consume()).toHaveLength(2);

    const event: ComprehensionEvent = {
      id: "e1",
      timestamp: 3,
      source: "missed",
      shouldDisplay: true,
      eventType: "bridge",
      confidence: 0.9,
      currentTopic: "계약 자유",
      professorMove: "교환에서 계약으로 이동",
      fromConcept: "교환",
      toConcept: "계약",
      missingBridge: "반복되는 교환에는 약속을 안정적으로 보장할 장치가 필요함.",
      prerequisite: null,
      shortExplanation: null,
      nextFocus: "누가 계약을 보장하는지",
      importance: "high",
      statePatch: { conceptChain: ["개인", "교환", "계약"] },
    };
    const state = reduceLectureState(EMPTY_STATE, event);
    expect(shouldReplaceCard(null, event)).toBe(true);
    expect(state.conceptChain.at(-1)).toBe("계약");

    const lecture: Lecture = {
      id: "l1",
      title: "교육사회학",
      keywords: [],
      startedAt: 0,
      endedAt: 10,
      duration: 10,
      status: "finished",
      transcriptSegments: transcript,
      comprehensionEvents: [event],
      stateSnapshots: [{ timestamp: 3, state }],
      finalNote: {
        overview: state.conceptChain,
        keyPoints: ["계약은 교환을 안정화한다"],
        bridges: [
          {
            from: "교환",
            to: "계약",
            explanation: event.missingBridge!,
          },
        ],
        terms: [],
        structure: "개인에서 교환, 계약으로 이동",
        review: "개인의 선택이 교환이 되고 보장 필요가 계약으로 이어진다.",
      },
    };
    expect(lectureToMarkdown(lecture)).toContain("약속을 안정적으로 보장");
  });
});
