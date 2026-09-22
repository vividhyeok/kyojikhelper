export function transcriptionSession(input: {
  model: string;
  title?: string;
  topic?: string;
  keywords: string[];
  quality?: "accuracy" | "balanced";
}) {
  const keywords = [...new Set([input.title, input.topic, ...input.keywords]
    .filter((word): word is string => Boolean(word))
    .map((word) => word.replace(/[<>\r\n]/g, " ").trim().slice(0, 80))
    .filter(Boolean))].slice(0, 30);
  return {
    session: {
      type: "transcription" as const,
      audio: {
        input: {
          transcription: {
            model: input.model,
            prompt: [
              "한국어 교직·인문사회 강의. 영어 전문용어가 섞일 수 있음.",
              input.title,
              input.topic,
            ]
              .filter(Boolean)
              .join(" ")
              .slice(0, 500),
            keywords,
            languages: ["ko", "en"],
            delay: input.quality === "balanced" ? "medium" as const : "high" as const,
          },
        },
      },
    },
  };
}

export function minimalTranscriptionSession(model: string) {
  return {
    session: {
      type: "transcription" as const,
      audio: { input: { transcription: { model } } },
    },
  };
}
