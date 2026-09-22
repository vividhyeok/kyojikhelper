import { describe, expect, it } from "vitest";
import { transcriptionSession } from "./transcription-config";

describe("Realtime transcription session", () => {
  it("uses the current languages array and sanitized keyword hints", () => {
    const config = transcriptionSession({
      model: "gpt-live-transcribe",
      topic: "교육철학",
      keywords: ["사회계약론", "불법<줄바꿈>\n단어"],
    });
    const transcription = config.session.audio.input.transcription;
    expect(config.session.audio.input).not.toHaveProperty("turn_detection");
    expect(transcription.languages).toEqual(["ko", "en"]);
    expect(transcription).not.toHaveProperty("language");
    expect(transcription.keywords).toEqual(["사회계약론", "불법 줄바꿈  단어"]);
  });
});
