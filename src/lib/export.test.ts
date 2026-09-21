import { describe, expect, it } from "vitest";
import { lectureToMarkdown } from "./export";
import { Lecture } from "./types";
describe("markdown export", () =>
  it("includes flow, bridges and transcript", () => {
    const l: Lecture = {
      id: "1",
      title: "교육사회학",
      keywords: [],
      startedAt: 0,
      duration: 100,
      status: "finished",
      transcriptSegments: [
        { id: "s", text: "교환과 계약", timestamp: 1, final: true },
      ],
      comprehensionEvents: [],
      stateSnapshots: [],
      finalNote: {
        overview: ["개인", "교환", "계약"],
        keyPoints: ["핵심"],
        bridges: [{ from: "교환", to: "계약", explanation: "보장 필요" }],
        terms: [],
        structure: "A에서 B",
        review: "복습",
      },
    };
    const md = lectureToMarkdown(l);
    expect(md).toContain("개인\n→ 교환");
    expect(md).toContain("교환 → 계약");
    expect(md).toContain("교환과 계약");
  }));
