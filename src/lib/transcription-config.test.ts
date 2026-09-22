import { describe, expect, it } from "vitest";
import { minimalTranscriptionSession, transcriptionSession } from "./transcription-config";

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
    expect(transcription.keywords).toEqual(["교육철학", "사회계약론", "불법 줄바꿈  단어"]);
    expect(transcription.delay).toBe("high");
  });
  it("bounds excessive hints and can fall back to a minimal session", () => {
    const config = transcriptionSession({
      model: "gpt-live-transcribe",
      keywords: Array.from({ length: 31 }, () => "가".repeat(100)),
    });
    expect(config.session.audio.input.transcription.keywords).toHaveLength(1);
    expect(config.session.audio.input.transcription.keywords[0]).toHaveLength(80);
    expect(minimalTranscriptionSession("gpt-live-transcribe").session.audio.input.transcription)
      .toEqual({ model: "gpt-live-transcribe" });
  });
  it("uses medium delay for balanced mode", () => {
    expect(transcriptionSession({ model: "gpt-live-transcribe", keywords: [], quality: "balanced" }).session.audio.input.transcription.delay).toBe("medium");
  });
});
