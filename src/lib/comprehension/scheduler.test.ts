import { describe, expect, it } from "vitest";
import { AdaptiveAnalysisScheduler, boundedContext } from "./scheduler";
const seg = (id: string, text: string, timestamp = Date.now()) => ({
  id,
  text,
  timestamp,
  final: true as const,
});
describe("adaptive scheduler", () => {
  it("does not request on every utterance and batches pending text", () => {
    const s = new AdaptiveAnalysisScheduler();
    expect(s.add(seg("1", "개인은 스스로 선택할 수 있습니다.")).trigger).toBe(
      false,
    );
    expect(
      s.add(seg("2", "사람들은 서로 관계를 맺습니다.")).pending,
    ).toHaveLength(2);
    expect(s.getPending()).toHaveLength(2);
  });
  it("triggers on contextual discourse transition", () => {
    const s = new AdaptiveAnalysisScheduler(1400, 30);
    s.add(seg("1", "개인은 자신의 의사에 따라 자유롭게 선택할 수 있습니다."));
    expect(
      s.add(
        seg("2", "그런데 결국 이 선택은 다른 사람과의 교환으로 이어집니다."),
      ).trigger,
    ).toBe(true);
  });
  it("bounds recent context by characters", () => {
    const x = Array.from({ length: 20 }, (_, i) =>
      seg(String(i), "가".repeat(100)),
    );
    expect(boundedContext(x, 500).length).toBeLessThanOrEqual(5);
  });
});
