import { ComprehensionEvent, LectureState } from "@/lib/types";

export interface HudMessage {
  label: string;
  topic: string;
  main: string;
  detail: string | null;
}

function concise(text: string) {
  return text.trim().replace(/(?:이라는|라는) (?:대비|설명|의미)입니다\.?$/, "").replace(/\.$/, "");
}

export function selectHudMessage(state: LectureState, card: ComprehensionEvent | null): HudMessage {
  const topic = state.currentTopic;
  const label = state.professorMove || "강의 중";
  if (!card || card.currentTopic !== topic) {
    const link = state.conceptLinks?.at(-1);
    const relation = link?.relation === "contrast" ? "↔" : link?.relation === "example" ? "→ 예:" : link?.relation === "unclear" ? "…" : "→";
    return { label, topic, main: link?.to === topic ? `${link.from} ${relation} ${link.to}` : topic, detail: null };
  }
  const frame = card.understandingFrame?.trim() || "";
  const [head, ...tail] = frame.split(/[:：]/);
  if (card.missingBridge) {
    const relation = card.fromConcept && card.toConcept ? `${card.fromConcept} → ${card.toConcept}` : head;
    return { label: "연결 보충", topic, main: relation || topic, detail: concise(card.missingBridge) };
  }
  if (card.prerequisite)
    return { label: "알아둘 전제", topic, main: concise(head || topic), detail: concise(card.prerequisite) };
  const main = concise(head || card.shortExplanation || card.relationExplanation || topic);
  const remainder = concise(tail.join(": "));
  const detail = remainder && !main.includes(remainder)
    ? remainder
    : card.relationType === "unclear" ? "관계는 아직 설명되지 않음"
      : card.relationExplanation && card.relationExplanation.length <= 65 && !main.includes(card.relationExplanation)
        ? concise(card.relationExplanation)
        : null;
  return { label, topic, main, detail };
}
