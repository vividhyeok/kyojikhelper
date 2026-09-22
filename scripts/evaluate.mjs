// Opt-in paid evaluation. Run against a local dev server with .env.local configured.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const base = process.env.EVAL_APP_URL || "http://localhost:3000";
const pin = process.env.EVAL_APP_PIN || process.env.APP_ACCESS_PIN;
if (!pin) throw new Error("EVAL_APP_PIN 또는 APP_ACCESS_PIN이 필요합니다.");
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
if (!login.ok) throw new Error(`PIN login failed (${login.status})`);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Session cookie missing");
const cases = [
  { expected: "example", recent: ["호혜성은 서로 주고받는 관계를 가리킵니다."], pending: ["예를 들어 선물 교환을 생각해 봅시다."] },
  { expected: "contrast", recent: ["영웅교육은 공동체의 이상적 인간상을 중시합니다."], pending: ["반면 소크라테스의 문답법은 질문을 통해 답을 찾게 합니다. 이 둘을 비교해 봅시다."] },
  { expected: "unclear", recent: ["영웅교육은 공동체가 요구하는 인간상을 다룹니다."], pending: ["그런데 이제 소크라테스의 문답법을 보겠습니다."] },
];
for (const item of cases) {
  const response = await fetch(`${base}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ mode:"auto", density:"minimal", profile:"관계를 먼저 파악하고 불명확하면 인과를 만들지 않는다.", state:{currentTopic:"영웅교육",conceptChain:[],recentClaims:[],unresolved:[],professorPosition:null}, recent:item.recent, pending:item.pending }) });
  if (!response.ok) throw new Error(`Analysis failed (${response.status})`);
  const result = await response.json();
  console.log(`${item.expected}: ${result.relationType} · ${result.professorMove} · ${result.understandingFrame ?? "—"}`);
  if (result.relationType !== item.expected || result.missingBridge) process.exitCode = 1;
}
