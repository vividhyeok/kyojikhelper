import { describe, expect, it } from "vitest";
import { AudioTurnDetector } from "./realtime-turns";

describe("AudioTurnDetector", () => {
  it("commits speech after a pause, but not silence", () => {
    const detector = new AudioTurnDetector();
    expect(detector.sample(0, 0)).toBe("waiting");
    for (let t = 100; t <= 800; t += 100) detector.sample(0.04, t);
    expect(detector.sample(0, 1_000)).toBe("speech");
    expect(detector.sample(0, 1_800)).toBe("commit");
    expect(detector.sample(0, 2_000)).toBe("waiting");
  });

  it("bounds a long uninterrupted utterance", () => {
    const detector = new AudioTurnDetector();
    let result = "waiting";
    for (let t = 100; t <= 15_100; t += 100)
      result = detector.sample(0.04, t);
    expect(result).toBe("commit");
  });
});
