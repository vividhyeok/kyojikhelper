/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AdaptiveAnalysisScheduler,
  analysisPayload,
  boundedContext,
} from "@/lib/comprehension/scheduler";
import {
  isDuplicate,
  shouldReplaceCard,
} from "@/lib/comprehension/card-policy";
import { reduceLectureState } from "@/lib/comprehension/state";
import { selectHudMessage } from "@/lib/comprehension/hud";
import { EDUCATION_HISTORY_FIXTURE, mockAnalysis } from "@/lib/comprehension/fixtures";
import { repository, DEFAULT_SETTINGS } from "@/lib/storage/repository";
import {
  ComprehensionAnalysis,
  ComprehensionEvent,
  ConceptLink,
  EMPTY_STATE,
  FinalNote,
  Lecture,
  Settings,
  TranscriptSegment,
} from "@/lib/types";
import { RealtimeTranscriber, ConnectionState } from "@/lib/realtime";
import { WakeLockManager } from "@/lib/wake-lock";
import { downloadLecture } from "@/lib/export";
type Tab = "live" | "history" | "settings";
const uid = () => crypto.randomUUID();
const formatLink = (link: ConceptLink) => `${link.from} ${link.relation === "contrast" ? "↔" : link.relation === "category" ? "⊃" : link.relation === "definition" ? "=" : link.relation === "return" ? "← 다시" : link.relation === "unclear" ? "…" : "→"} ${link.relation === "example" ? "예: " : ""}${link.to}`;
const fmt = (ms: number) =>
  `${Math.floor(ms / 3600000) ? `${Math.floor(ms / 3600000)}:` : ""}${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const api = async <T,>(url: string, body: unknown): Promise<T> => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error((await r.json().catch(() => ({}))).error || "요청 실패");
  return r.json();
};
export default function Home() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [tab, setTab] = useState<Tab>("live");
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((x) => setAuth(x.authenticated ? "yes" : "no"))
      .catch(() => setAuth("no"));
  }, []);
  if (auth === "loading")
    return (
      <main className="center">
        <span className="brand-mark">K</span>
      </main>
    );
  if (auth === "no") return <Login onLogin={() => setAuth("yes")} />;
  return (
    <App
      tab={tab}
      setTab={setTab}
      logout={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setAuth("no");
      }}
    />
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/auth/login", { pin });
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    }
  };
  return (
    <main className="login">
      <div>
        <span className="eyebrow">PRIVATE LECTURE HUD</span>
        <h1>
          Kyojik
          <br />
          Helper
        </h1>
        <p>
          교수의 사고 흐름을 내 이해 방식으로,
          <br />
          강의를 놓치지 않을 만큼만.
        </p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="pin">접근 PIN</label>
        <div className="pin-field">
          <input
            id="pin"
            inputMode="text"
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <button
            type="button"
            className="pin-visibility"
            onClick={() => setShowPin((visible) => !visible)}
            aria-label={showPin ? "PIN 숨기기" : "PIN 보기"}
            aria-pressed={showPin}
          >
            {showPin ? "숨기기" : "보기"}
          </button>
        </div>
        <button className="primary">들어가기</button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
function App({
  tab,
  setTab,
  logout,
}: {
  tab: Tab;
  setTab: (v: Tab) => void;
  logout: () => void;
}) {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [active, setActive] = useState<Lecture>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const refresh = useCallback(async () => {
    setLectures(await repository.listLectures());
    setSettings(await repository.getSettings());
    setActive(await repository.getActiveLecture());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <main className="shell">
      <div hidden={tab !== "live"}>
        <LiveView initial={active} settings={settings} onSaved={refresh} />
      </div>
      {tab === "history" && <History lectures={lectures} onChange={refresh} />}
      {tab === "settings" && (
        <SettingsView
          value={settings}
          onChange={async (s) => {
            setSettings(s);
            await repository.saveSettings(s);
          }}
          logout={logout}
          refresh={refresh}
        />
      )}
      <nav aria-label="주요 메뉴">
        <button
          className={tab === "live" ? "active" : ""}
          onClick={() => setTab("live")}
        >
          <i>●</i>Live
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <i>≡</i>History
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          <i>○</i>Settings
        </button>
      </nav>
    </main>
  );
}
function LiveView({
  initial,
  settings,
  onSaved,
}: {
  initial?: Lecture;
  settings: Settings;
  onSaved: () => void;
}) {
  const [lecture, setLecture] = useState<Lecture | undefined>(initial);
  const lectureRef = useRef(lecture);
  const cardRef = useRef<ComprehensionEvent | null>(null);
  const cardShownAtRef = useRef(0);
  const settingsRef = useRef(settings);
  const analysisQueue = useRef<Promise<void>>(Promise.resolve());
  const enqueueRef = useRef<((mode: "auto" | "missed" | "why", pending?: TranscriptSegment[]) => Promise<void>) | null>(null);
  const failedBatchRef = useRef<TranscriptSegment[]>([]);
  const retryCountRef = useRef(0);
  const demoRef = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const rehydratedRef = useRef<string | null>(null);
  const [partial, setPartial] = useState("");
  const [activity, setActivity] = useState<"waiting" | "speech" | "transcribing">("waiting");
  const [micLevel, setMicLevel] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [connectionError, setConnectionError] = useState("");
  const [wake, setWake] = useState(false);
  const [card, setCard] = useState<ComprehensionEvent | null>(null);
  const [queued, setQueued] = useState<ComprehensionEvent[]>([]);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const scheduler = useRef(new AdaptiveAnalysisScheduler());
  const transcriber = useRef<RealtimeTranscriber | null>(null);
  const wakeLock = useRef<WakeLockManager | null>(null);
  useEffect(() => {
    lectureRef.current = lecture;
  }, [lecture]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { cardRef.current = card; }, [card]);
  useEffect(() => {
    if (initial && !lecture) setLecture(initial);
    if (initial?.demo) demoRef.current = true;
  }, [initial, lecture]);
  useEffect(() => {
    if (!lecture?.startedAt) return;
    const startedAt = lecture.startedAt;
    const t = setInterval(
      () => setElapsed(Date.now() - startedAt),
      1000,
    );
    return () => clearInterval(t);
  }, [lecture?.startedAt]);
  const save = async (next: Lecture) => {
    lectureRef.current = next;
    setLecture(next);
    const task = writeQueue.current.then(() => repository.updateLecture(next));
    writeQueue.current = task.catch(() => {});
    await task;
  };
  const analyzeOne = useCallback(
    async (mode: "auto" | "missed" | "why", pending?: TranscriptSegment[]) => {
      const l = lectureRef.current;
      if (!l) return;
      setBusy(true);
      try {
        const batch = pending ?? scheduler.current.getPending();
        const payload = {
          ...analysisPayload(
            l.stateSnapshots.at(-1)?.state ?? EMPTY_STATE,
            boundedContext(l.transcriptSegments.slice(0, -batch.length), mode === "missed" ? 2400 : 1500),
            batch,
            mode === "missed" ? 2400 : 1500,
          ),
          mode,
          density: settingsRef.current.density,
          profile: settingsRef.current.profile,
        };
        const result = demoRef.current
          ? mockAnalysis(EDUCATION_HISTORY_FIXTURE.find(x => x.utterance === batch.at(-1)?.text) ?? EDUCATION_HISTORY_FIXTURE[0])
          : await api<ComprehensionAnalysis>("/api/analyze", payload);
        const latest = lectureRef.current;
        if (!latest || latest.id !== l.id || latest.status !== "live") return;
        const state = reduceLectureState(latest.stateSnapshots.at(-1)?.state ?? EMPTY_STATE, result);
        let next = {
          ...latest,
          conceptLinks: [...(latest.conceptLinks ?? latest.stateSnapshots.at(-1)?.state.conceptLinks ?? []), ...(result.statePatch.conceptLinks ?? [])].filter((link, index, all) => all.findIndex(x => x.from === link.from && x.to === link.to && x.relation === link.relation) === index),
          analysisCursor: mode === "auto" && batch.length ? batch.at(-1)?.id : latest.analysisCursor,
          stateSnapshots: [
            ...latest.stateSnapshots,
            { timestamp: Date.now(), state },
          ],
        };
        if (result.shouldDisplay) {
          const event: ComprehensionEvent = {
            ...result,
            id: uid(),
            timestamp: Date.now(),
            source: mode,
          };
          if (!isDuplicate(event, next.comprehensionEvents)) {
            next = {
              ...next,
              comprehensionEvents: [...next.comprehensionEvents, event],
            };
            if (shouldReplaceCard(cardRef.current ? {...cardRef.current, timestamp:cardShownAtRef.current} : null, event) || mode !== "auto") {
              cardRef.current = event;
              cardShownAtRef.current = Date.now();
              setQueued([]);
              setCard(event);
            } else setQueued([event]);
          }
        }
        await save(next);
        scheduler.current.recordOutcome(result.shouldDisplay);
        retryCountRef.current = 0;
      } catch {
        if (mode === "auto" && pending?.length) {
          const ids = new Set(failedBatchRef.current.map(x => x.id));
          failedBatchRef.current = [...pending.filter(x => !ids.has(x.id)), ...failedBatchRef.current];
          if (retryCountRef.current++ < 2) {
            window.setTimeout(() => {
              if (lectureRef.current?.status === "live" && failedBatchRef.current.length) void enqueueRef.current?.("auto", []);
            }, 3000 * retryCountRef.current);
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  const analyze = useCallback((mode: "auto" | "missed" | "why", pending?: TranscriptSegment[]) => {
    const task = analysisQueue.current.then(() => {
      const failed = failedBatchRef.current;
      failedBatchRef.current = [];
      const ids = new Set(failed.map(x => x.id));
      const batch = [...failed, ...(pending ?? []).filter(x => !ids.has(x.id))];
      return analyzeOne(mode, batch.length ? batch : pending);
    });
    analysisQueue.current = task.catch(() => {});
    return task;
  }, [analyzeOne]);
  useEffect(() => { enqueueRef.current = analyze; }, [analyze]);
  useEffect(() => {
    if (!initial || rehydratedRef.current === initial.id) return;
    rehydratedRef.current = initial.id;
    if (!lectureRef.current) lectureRef.current = initial;
    const cursor = initial.analysisCursor;
    const index = cursor ? initial.transcriptSegments.findIndex(x => x.id === cursor) : -1;
    const lastSnapshotAt = initial.stateSnapshots.at(-1)?.timestamp ?? initial.startedAt;
    const remaining = index >= 0
      ? initial.transcriptSegments.slice(index + 1)
      : initial.transcriptSegments.filter(x => x.timestamp > lastSnapshotAt);
    for (const segment of remaining) scheduler.current.add(segment);
    if (remaining.length) void analyze("auto", scheduler.current.consume());
  }, [initial, analyze]);
  useEffect(() => {
    if (!card || !queued.length) return;
    const id = setTimeout(
      () => {
        if (queued[0].currentTopic !== lectureRef.current?.stateSnapshots.at(-1)?.state.currentTopic) {
          setQueued([]);
          return;
        }
        cardRef.current = queued[0];
        cardShownAtRef.current = Date.now();
        setCard(queued[0]);
        setQueued([]);
      },
      Math.max(0, 5000 - (Date.now() - cardShownAtRef.current)),
    );
    return () => clearTimeout(id);
  }, [card, queued]);
  const onFinal = useCallback(
    async (id: string, text: string) => {
      if (!text) return;
      const l = lectureRef.current;
      if (!l) return;
      const seg: TranscriptSegment = {
        id,
        text,
        timestamp: Date.now(),
        final: true,
      };
      if (l.transcriptSegments.some((s) => s.id === id)) return;
      const next = { ...l, transcriptSegments: [...l.transcriptSegments, seg] };
      await save(next);
      const d = scheduler.current.add(seg, l.transcriptSegments.at(-1));
      if (d.trigger) {
        const batch = scheduler.current.consume();
        void analyze("auto", batch);
      }
    },
    [analyze],
  );
  const connect = useCallback(
    async (l: Lecture) => {
      transcriber.current = new RealtimeTranscriber(
        { keywords: l.keywords, topic: l.topic },
        {
          onPartial: setPartial,
          onFinal,
          onState: setConnection,
          onError: setConnectionError,
          onActivity: setActivity,
          onLevel: setMicLevel,
        },
      );
      wakeLock.current = new WakeLockManager(setWake);
      await Promise.all([
        transcriber.current.start(),
        wakeLock.current.acquire(),
      ]);
    },
    [onFinal],
  );
  useEffect(() => {
    if (
      initial &&
      !initial.demo &&
      lecture?.id === initial.id &&
      connection === "disconnected" &&
      !transcriber.current
    ) {
      void connect(initial);
    }
  }, [initial, lecture, connection, connect]);
  const start = async (data: {
    title: string;
    topic: string;
    keywords: string[];
    demo: boolean;
  }) => {
    const now = Date.now();
    const l: Lecture = {
      id: uid(),
      title: data.title,
      topic: data.topic || undefined,
      keywords: data.keywords,
      startedAt: now,
      duration: 0,
      status: "live",
      demo: data.demo,
      transcriptSegments: [],
      comprehensionEvents: [],
      conceptLinks: [],
      stateSnapshots: [
        {
          timestamp: now,
          state: {
            ...EMPTY_STATE,
            currentTopic: data.topic || "강의를 듣는 중",
          },
        },
      ],
    };
    await repository.createLecture(l);
    await save(l);
    demoRef.current = data.demo;
    if (data.demo) void runDemo(onFinal);
    else await connect(l);
    onSaved();
  };
  const finish = async () => {
    const l = lectureRef.current;
    if (!l || busy || !confirm("수업을 종료하고 복습 노트를 만들까요?")) return;
    setBusy(true);
    transcriber.current?.stop();
    await wakeLock.current?.release();
    const pending = scheduler.current.getPending();
    if (pending.length) {
      scheduler.current.consume();
      await analyze("auto", pending);
    }
    await analysisQueue.current;
    const current = lectureRef.current!;
    let finalNote: FinalNote | undefined;
    try {
      finalNote = current.demo ? {
        overview: current.stateSnapshots.at(-1)?.state.conceptChain ?? [],
        keyPoints: ["교수의 설명 동작과 개념 관계를 구분해 보세요."],
        bridges: [], terms: [], structure: "개발용 Mock 강의입니다.", review: "관계가 불분명할 때 인과를 만들지 않고 다음 설명을 기다립니다."
      } : await api<FinalNote>("/api/finalize", {
        title: current.title,
        state: current.stateSnapshots.at(-1)?.state ?? EMPTY_STATE,
        conceptLinks: current.conceptLinks?.slice(-100),
        transcript: current.transcriptSegments.map((s) => s.text),
        events: current.comprehensionEvents,
      });
    } catch {}
    const done = {
      ...current,
      status: "finished" as const,
      endedAt: Date.now(),
      duration: Date.now() - current.startedAt,
      finalNote,
    };
    await save(done);
    setLecture(undefined);
    lectureRef.current = undefined;
    setCard(null);
    setBusy(false);
    onSaved();
  };
  if (!lecture) return <StartForm onStart={start} />;
  const state = lecture.stateSnapshots.at(-1)?.state ?? EMPTY_STATE;
  const message = selectHudMessage(state, card);
  return (
    <section className="live-view">
      <header className="live-header">
        <div>
          <span className={`dot ${connection}`} />
          <span>
            {lecture.demo ? "Mock 재생" : connection === "connected"
              ? "듣는 중"
              : connection === "reconnecting"
                ? "다시 연결 중"
                : connection === "failed"
                  ? "연결 실패"
                  : "기록 대기"}
          </span>
          <span className="time">{fmt(elapsed)}</span>
        </div>
        <h1>{lecture.title}</h1>
        <button
          className="icon-button"
          onClick={() => setSheet(true)}
          aria-label="전사 보기"
        >
          ≡
        </button>
      </header>
      <div className="hud">
        <section className="glance" aria-live="polite" aria-atomic="true">
          <span className="glance-label">{message.label}</span>
          {message.main !== message.topic && <p className="glance-topic">{message.topic}</p>}
          <h2>{message.main}</h2>
          {message.detail && <p className="glance-detail">{message.detail}</p>}
        </section>
        {settings.transcriptDisplay === "small" &&
          (partial || lecture.transcriptSegments.length > 0) && (
            <p className="mini-transcript">
              {partial || lecture.transcriptSegments.at(-1)?.text}
            </p>
          )}
      </div>
      <div
        className="signal-strip"
        role="status"
        aria-label={`마이크 ${activity === "speech" ? "음성 감지 중" : "대기"}, 전사 ${lecture.transcriptSegments.length}개 저장됨`}
      >
        <span className="signal-mic">
          <span className="signal-bars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} className={i < micLevel ? "active" : ""} />
            ))}
          </span>
          마이크
        </span>
        <span className={`signal-transcript ${partial || lecture.transcriptSegments.length ? "active" : ""}`}>
          <i aria-hidden="true" />
          {lecture.transcriptSegments.length
            ? `전사 ${lecture.transcriptSegments.length}`
            : partial || activity === "transcribing"
              ? "전사 중"
              : "전사 대기"}
        </span>
        <span className="signal-extra">
          {busy ? "이해 정리 중" : wake ? "화면 켜짐" : "화면 유지 불가"}
        </span>
      </div>
      {connection !== "connected" && connectionError && (
        <div className="connection-hint" role="status">
          <span>{connectionError}</span>
          {connection === "failed" && (
            <button onClick={() => transcriber.current?.retry()}>
              다시 시도
            </button>
          )}
        </div>
      )}
      <div className="live-actions">
        <button className="end" onClick={finish} disabled={busy}>
          수업 종료
        </button>
      </div>
      {sheet && (
        <TranscriptSheet
          lecture={lecture}
          partial={partial}
          close={() => setSheet(false)}
        />
      )}
    </section>
  );
}
async function runDemo(onFinal: (id: string, text: string) => void) {
  const lines = EDUCATION_HISTORY_FIXTURE.map(x => x.utterance);
  for (let i = 0; i < lines.length; i++) {
    await new Promise((r) => setTimeout(r, 700));
    onFinal(`demo-${i}`, lines[i]);
  }
}
function StartForm({
  onStart,
}: {
  onStart: (x: {
    title: string;
    topic: string;
    keywords: string[];
    demo: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  return (
    <section className="start">
      <span className="eyebrow">NEW LECTURE</span>
      <h1>
        오늘 강의를
        <br />
        따라갈 준비.
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim())
            void onStart({
              title: title.trim(),
              topic: topic.trim(),
              keywords: keywords
                .split(/[\n,]/)
                .map((x) => x.trim())
                .filter(Boolean),
              demo: false,
            });
        }}
      >
        <label>
          수업명 <b>필수</b>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="교육사회학"
            required
          />
        </label>
        <label>
          오늘의 주제 <b>선택</b>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="계약 자유와 시민사회"
          />
        </label>
        <label>
          전문 용어 <b>선택 · 줄바꿈으로 구분</b>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={"호혜성\n사회계약론\n신자유주의"}
          />
        </label>
        <p className="privacy">
          음성은 저장하지 않습니다. 확정 전사만 이 기기에 남습니다.
        </p>
        <button className="primary">수업 시작</button>
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              title.trim() &&
              onStart({ title: title.trim(), topic, keywords: [], demo: true })
            }
          >
            Mock 강의 실행
          </button>
        )}
      </form>
    </section>
  );
}
function TranscriptSheet({
  lecture,
  partial,
  close,
}: {
  lecture: Lecture;
  partial: string;
  close: () => void;
}) {
  return (
    <div className="backdrop" onClick={close}>
      <section
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="전체 전사"
      >
        <div className="handle" />
        <header>
          <h2>Transcript</h2>
          <button onClick={close} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="transcript-list">
          {lecture.transcriptSegments.map((s) => (
            <p key={s.id}>
              <time>
                {new Date(s.timestamp).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {s.text}
            </p>
          ))}
          {partial && (
            <p className="partial">
              <time>지금</time>
              {partial}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
function History({
  lectures,
  onChange,
}: {
  lectures: Lecture[];
  onChange: () => void;
}) {
  const [selected, setSelected] = useState<Lecture>();
  if (selected)
    return (
      <LectureDetail
        lecture={selected}
        back={() => setSelected(undefined)}
        onDelete={async () => {
          await repository.deleteLecture(selected.id);
          setSelected(undefined);
          onChange();
        }}
      />
    );
  return (
    <section className="history">
      <span className="eyebrow">LOCAL ARCHIVE</span>
      <h1>History</h1>
      {!lectures.length ? (
        <div className="empty">
          아직 저장된 수업이 없습니다.
          <small>수업을 마치면 개념 흐름과 전사가 이 기기에 남습니다.</small>
        </div>
      ) : (
        lectures.map((l) => (
          <button
            className="history-item"
            key={l.id}
            onClick={() => setSelected(l)}
          >
            <span>
              {new Date(l.startedAt).toLocaleDateString("ko-KR", {
                month: "numeric",
                day: "numeric",
              })}
            </span>
            <div>
              <h2>{l.title}</h2>
              <p>
                {fmt(l.duration || Date.now() - l.startedAt)} ·{" "}
                {(
                  l.finalNote?.overview ??
                  l.stateSnapshots.at(-1)?.state.conceptChain ??
                  []
                )
                  .slice(0, 3)
                  .join(" · ") || "정리 중"}
              </p>
            </div>
            <b>›</b>
          </button>
        ))
      )}
    </section>
  );
}
function LectureDetail({
  lecture,
  back,
  onDelete,
}: {
  lecture: Lecture;
  back: () => void;
  onDelete: () => void;
}) {
  const [noteTab, setNoteTab] = useState<"note" | "events" | "transcript">(
    "note",
  );
  const n = lecture.finalNote;
  return (
    <section className="detail">
      <header>
        <button onClick={back} aria-label="뒤로">
          ‹
        </button>
        <div>
          <h1>{lecture.title}</h1>
          <p>
            {new Date(lecture.startedAt).toLocaleDateString("ko-KR")} ·{" "}
            {fmt(lecture.duration)}
          </p>
        </div>
      </header>
      <div className="segmented">
        <button
          className={noteTab === "note" ? "active" : ""}
          onClick={() => setNoteTab("note")}
        >
          복습
        </button>
        <button
          className={noteTab === "events" ? "active" : ""}
          onClick={() => setNoteTab("events")}
        >
          연결
        </button>
        <button
          className={noteTab === "transcript" ? "active" : ""}
          onClick={() => setNoteTab("transcript")}
        >
          전사
        </button>
      </div>
      <div className="detail-body">
        {noteTab === "note" ? (
          <>
            <h3>전체 흐름</h3>
            <div className="chain large">
              {(lecture.conceptLinks ?? lecture.stateSnapshots.at(-1)?.state.conceptLinks)?.length ? (lecture.conceptLinks ?? lecture.stateSnapshots.at(-1)?.state.conceptLinks)?.map((link, i) => <span key={i}>{formatLink(link)}</span>) : (
                n?.overview ??
                lecture.stateSnapshots.at(-1)?.state.conceptChain ??
                []
              ).map((x, i, a) => (
                <span key={i}>
                  {x}
                  {i < a.length - 1 && <b>↓</b>}
                </span>
              ))}
            </div>
            <h3>오늘 핵심</h3>
            <ul>
              {n?.keyPoints.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <h3>교수 설명의 전체 구조</h3>
            <p>{n?.structure || "최종 노트를 생성하지 못했습니다."}</p>
            <h3>5분 복습본</h3>
            <p>{n?.review}</p>
          </>
        ) : noteTab === "events" ? (
          <>
            {lecture.comprehensionEvents.map((e) => (
              <article key={e.id}>
                <small>
                  {e.fromConcept} {e.relationType === "contrast" ? "↔" : e.relationType === "unclear" ? "…" : "→"} {e.toConcept} {e.professorMove ? `· ${e.professorMove}` : ""}
                </small>
                <p>{e.understandingFrame || e.missingBridge || e.relationExplanation || e.shortExplanation || e.prerequisite}</p>
              </article>
            ))}
          </>
        ) : (
          <div className="transcript-list">
            {lecture.transcriptSegments.map((s) => (
              <p key={s.id}>
                <time>
                  {new Date(s.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {s.text}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="export">
        <button onClick={() => downloadLecture(lecture, "md")}>Markdown</button>
        <button onClick={() => downloadLecture(lecture, "txt")}>TXT</button>
        <button onClick={() => downloadLecture(lecture, "json")}>JSON</button>
      </div>
      <button
        className="danger"
        onClick={() =>
          confirm("이 수업 기록을 이 기기에서 삭제할까요?") && onDelete()
        }
      >
        수업 삭제
      </button>
    </section>
  );
}
function SettingsView({
  value,
  onChange,
  logout,
  refresh,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
  logout: () => void;
  refresh: () => void;
}) {
  return (
    <section className="settings">
      <span className="eyebrow">PERSONAL</span>
      <h1>Settings</h1>
      <section>
        <h2>설명 밀도</h2>
        <div className="choice">
          <button
            className={value.density === "minimal" ? "active" : ""}
            onClick={() => onChange({ ...value, density: "minimal" })}
          >
            최소<small>핵심 전환만</small>
          </button>
          <button
            className={value.density === "normal" ? "active" : ""}
            onClick={() => onChange({ ...value, density: "normal" })}
          >
            보통<small>조금 더 자주</small>
          </button>
        </div>
      </section>
      <section>
        <h2>이해 프로필</h2>
        <textarea
          value={value.profile}
          onChange={(e) => onChange({ ...value, profile: e.target.value })}
        />
      </section>
      <section>
        <h2>메인 화면 Transcript</h2>
        <div className="choice">
          <button
            className={value.transcriptDisplay === "hidden" ? "active" : ""}
            onClick={() => onChange({ ...value, transcriptDisplay: "hidden" })}
          >
            숨김
          </button>
          <button
            className={value.transcriptDisplay === "small" ? "active" : ""}
            onClick={() => onChange({ ...value, transcriptDisplay: "small" })}
          >
            작게 표시
          </button>
        </div>
      </section>
      <section className="privacy-block">
        <h2>데이터와 개인정보</h2>
        <p>
          음성은 저장하지 않습니다. 확정 전사와 AI 결과는 이 브라우저의
          IndexedDB에 저장됩니다. 처리에 필요한 내용만 OpenAI로 전송됩니다.
        </p>
      </section>
      <button className="secondary full" onClick={logout}>
        로그아웃
      </button>
      <button
        className="danger"
        onClick={async () => {
          if (
            confirm(
              "모든 수업 기록과 설정을 이 기기에서 삭제할까요? 복구할 수 없습니다.",
            )
          ) {
            await repository.clearAll();
            refresh();
          }
        }}
      >
        전체 기록 삭제
      </button>
    </section>
  );
}
