"use client";
import { useState } from "react";
import { EDUCATION_HISTORY_FIXTURE, mockAnalysis } from "@/lib/comprehension/fixtures";
import { reduceLectureState } from "@/lib/comprehension/state";
import { ComprehensionAnalysis, EMPTY_STATE, LectureState } from "@/lib/types";

type Entry = { utterance: string; analysis: ComprehensionAnalysis; state: LectureState };
const initial = EDUCATION_HISTORY_FIXTURE.map(x => x.utterance).join("\n");
export default function Lab() {
  const [text, setText] = useState(initial);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
  async function advance(real: boolean) {
    const index = entries.length;
    if (index >= lines.length || running) return;
    setRunning(true); setError("");
    const utterance = lines[index];
    const state = entries.at(-1)?.state ?? EMPTY_STATE;
    try {
      let analysis: ComprehensionAnalysis;
      if (real) {
        const response = await fetch("/api/analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({mode:"auto",density:"minimal",profile:"먼저 관계와 교수 설명 동작을 파악한다. 불명확하면 인과를 만들지 않는다.",state,recent:lines.slice(Math.max(0,index-4),index),pending:[utterance]}) });
        if (!response.ok) throw new Error(`분석 실패 (${response.status}). PIN 로그인과 API 설정을 확인하세요.`);
        analysis = await response.json();
      } else {
        const fixture = EDUCATION_HISTORY_FIXTURE[index];
        analysis = fixture?.utterance === utterance ? mockAnalysis(fixture) : {...mockAnalysis({utterance,relation:"unclear",move:"관계 확인 중",topic:utterance.slice(0,30),display:false,frame:null}), currentTopic:utterance.slice(0,30)};
      }
      setEntries(previous => [...previous,{utterance,analysis,state:reduceLectureState(state,analysis)}]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "평가 실패"); }
    finally { setRunning(false); }
  }
  return <main style={{maxWidth:760,margin:"0 auto",padding:24,color:"#f4f4f5"}}>
    <h1>Cognitive Translation Lab</h1><p>개발 환경 전용 · Mock은 비용이 들지 않습니다. 실제 API 평가는 PIN 로그인 후 명시적으로 실행하세요.</p>
    <textarea aria-label="강의 발화 입력" value={text} onChange={e=>{setText(e.target.value);setEntries([])}} style={{width:"100%",minHeight:230,fontSize:16,padding:12,background:"#1c1d20",color:"white"}} />
    <div style={{display:"flex",gap:12,margin:"16px 0"}}><button onClick={()=>void advance(false)} disabled={running||entries.length>=lines.length}>Mock 한 발화</button><button onClick={()=>void advance(true)} disabled={running||entries.length>=lines.length}>실제 API 한 발화</button><button onClick={()=>setEntries([])}>처음부터</button></div>
    {error && <p role="alert">{error}</p>}
    <p>{entries.length} / {lines.length}</p>
    {entries.map((entry,i)=><article key={i} style={{borderTop:"1px solid #444",padding:"14px 0"}}><small>{i+1}. {entry.utterance}</small><p>주제: {entry.state.currentTopic} · 동작: {entry.state.professorMove} · 관계: {entry.analysis.relationType} · 근거: {entry.analysis.epistemicStatus}</p><p>이해 프레임: {entry.analysis.understandingFrame || "—"}</p><p>개입: {entry.analysis.shouldDisplay ? entry.analysis.relationExplanation || entry.analysis.missingBridge || "프레임 표시" : "표시하지 않음"}</p></article>)}
  </main>;
}
