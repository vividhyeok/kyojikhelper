import { Lecture } from "@/lib/types";
const date = (n: number) => new Date(n).toISOString().slice(0, 10);
export function lectureToMarkdown(l: Lecture) {
  const note = l.finalNote;
  return `# ${l.title} - ${date(l.startedAt)}\n\n## 전체 흐름\n\n${(note?.overview ?? l.stateSnapshots.at(-1)?.state.conceptChain ?? []).join("\n→ ") || "기록 없음"}\n\n## 오늘 핵심\n\n${(note?.keyPoints ?? []).map((x) => `- ${x}`).join("\n") || "- 기록 없음"}\n\n## 이해 연결\n\n${(note?.bridges ?? []).map((b) => `### ${b.from} → ${b.to}\n\n${b.explanation}`).join("\n\n") || "기록 없음"}\n\n## 주요 용어\n\n${(note?.terms ?? []).map((t) => `- **${t.term}**: ${t.meaning}`).join("\n") || "- 기록 없음"}\n\n## 교수 설명의 전체 구조\n\n${note?.structure ?? "기록 없음"}\n\n## 5분 복습본\n\n${note?.review ?? "기록 없음"}\n\n## 전체 전사\n\n${l.transcriptSegments.map((s) => s.text).join("\n\n")}\n`;
}
export function lectureToTxt(l: Lecture) {
  return lectureToMarkdown(l)
    .replace(/^#{1,3} /gm, "")
    .replace(/\*\*/g, "");
}
export function downloadLecture(l: Lecture, type: "md" | "txt" | "json") {
  const body =
    type === "json"
      ? JSON.stringify(l, null, 2)
      : type === "md"
        ? lectureToMarkdown(l)
        : lectureToTxt(l);
  const blob = new Blob([body], {
    type: type === "json" ? "application/json" : "text/plain;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${l.title}-${date(l.startedAt)}.${type}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
