export function transcriptionSession(input: {
  model: string;
  topic?: string;
  keywords: string[];
}) {
  const keywords = input.keywords
    .map((word) => word.replace(/[<>\r\n]/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
  return {
    session: {
      type: "transcription" as const,
      audio: {
        input: {
          transcription: {
            model: input.model,
            prompt: [
              "한국어 교직·인문사회 강의. 영어 전문용어가 섞일 수 있음.",
              input.topic,
            ]
              .filter(Boolean)
              .join(" ")
              .slice(0, 500),
            keywords,
            languages: ["ko", "en"],
            delay: "low" as const,
          },
          turn_detection: {
            type: "server_vad" as const,
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
        },
      },
    },
  };
}
