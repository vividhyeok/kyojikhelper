import { describe, expect, it } from "vitest";
import { isDuplicate, shouldReplaceCard } from "./card-policy";
import { ComprehensionEvent } from "@/lib/types";
const event = (
  id: string,
  time: number,
  importance: "low" | "normal" | "high" = "normal",
): ComprehensionEvent => ({
  id,
  timestamp: time,
  source: "auto",
  shouldDisplay: true,
  eventType: "bridge",
  confidence: 0.9,
  currentTopic: "계약",
  professorMove: null,
  fromConcept: "교환",
  toConcept: "계약",
  missingBridge: "보장이 필요",
  prerequisite: null,
  shortExplanation: null,
  nextFocus: "국가",
  importance,
  statePatch: {},
});
describe("card policy", () => {
  it("suppresses repeated meaning", () =>
    expect(isDuplicate(event("b", 2000), [event("a", 1000)])).toBe(true));
  it("keeps a normal card readable but replaces for high priority", () => {
    expect(shouldReplaceCard(event("a", 1000), event("b", 2000), 5000)).toBe(
      false,
    );
    expect(
      shouldReplaceCard(event("a", 1000), event("b", 2000, "high"), 5000),
    ).toBe(true);
  });
});
