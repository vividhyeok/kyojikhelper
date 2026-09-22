import { describe, expect, it } from "vitest";
import { selectHudMessage } from "./hud";
import { mockAnalysis, EDUCATION_HISTORY_FIXTURE } from "./fixtures";
import { EMPTY_STATE, ComprehensionEvent } from "@/lib/types";

const card = (index: number): ComprehensionEvent => ({ ...mockAnalysis(EDUCATION_HISTORY_FIXTURE[index]), id:String(index),timestamp:1,source:"auto" });
describe("one-glance HUD", () => {
  it("shows one relation instead of repeating explanation sections", () => {
    const result = selectHudMessage({ ...EMPTY_STATE, currentTopic:"교육 방식의 비교", professorMove:"비교" }, card(5));
    expect(result.main).toContain("↔");
    expect(result.detail).toBe("가르치는 방식");
  });
  it("does not show an old card below a changed topic", () => {
    const result = selectHudMessage({ ...EMPTY_STATE, currentTopic:"헬레니즘 교육" }, card(5));
    expect(result.main).toBe("헬레니즘 교육");
  });
});
