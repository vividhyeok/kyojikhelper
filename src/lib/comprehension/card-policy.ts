import { ComprehensionEvent } from "@/lib/types";
export function fingerprint(
  event: Pick<
    ComprehensionEvent,
    "currentTopic" | "professorMove" | "fromConcept" | "toConcept" | "missingBridge" | "shortExplanation" | "relationType" | "understandingFrame"
  >,
) {
  const identity = event.fromConcept && event.toConcept
    ? [event.fromConcept, event.toConcept, event.relationType]
    : [event.currentTopic, event.professorMove, event.relationType, event.understandingFrame || event.shortExplanation || event.missingBridge];
  return identity
    .filter(Boolean)
    .join("|")
    .replace(/\s/g, "")
    .toLowerCase();
}
export function isDuplicate(
  event: ComprehensionEvent,
  previous: ComprehensionEvent[],
  windowMs = 120_000,
) {
  const key = fingerprint(event);
  return previous.some(
    (p) => event.timestamp - p.timestamp < windowMs && fingerprint(p) === key,
  );
}
export function shouldReplaceCard(
  current: ComprehensionEvent | null,
  incoming: ComprehensionEvent,
  now = Date.now(),
  minReadMs = 12_000,
) {
  return (
    !current ||
    incoming.importance === "high" ||
    now - current.timestamp >= minReadMs
  );
}
