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
import { repository, DEFAULT_SETTINGS } from "@/lib/storage/repository";
import {
  ComprehensionAnalysis,
  ComprehensionEvent,
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
          교수의 설명에서 빠진 연결만,
          <br />
          강의를 놓치지 않을 만큼만.
        </p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="pin">접근 PIN</label>
        <div className="pin-field">
          <input
            id="pin"
            inputMode="numeric"
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
  const [partial, setPartial] = useState("");
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
  useEffect(() => {
    if (initial && !lecture) setLecture(initial);
  }, [initial, lecture]);
  useEffect(() => {
    if (!lecture) return;
    const t = setInterval(
      () => setElapsed(Date.now() - lecture.startedAt),
      1000,
    );
    return () => clearInterval(t);
  }, [lecture]);
  const save = async (next: Lecture) => {
    lectureRef.current = next;
    setLecture(next);
    await repository.updateLecture(next);
  };
  const analyze = useCallback(
    async (mode: "auto" | "missed" | "why", pending?: TranscriptSegment[]) => {
      const l = lectureRef.current;
      if (!l) return;
      setBusy(true);
      try {
        const batch = pending ?? scheduler.current.getPending();
        const payload = {
          ...analysisPayload(
            l.stateSnapshots.at(-1)?.state ?? EMPTY_STATE,
            boundedContext(l.transcriptSegments.slice(0, -batch.length)),
            batch,
          ),
          mode,
          density: settings.density,
          profile: settings.profile,
        };
        const result = await api<ComprehensionAnalysis>(
          "/api/analyze",
          payload,
        );
        const state = reduceLectureState(
          l.stateSnapshots.at(-1)?.state ?? EMPTY_STATE,
          result,
        );
        let next = {
          ...l,
          stateSnapshots: [
            ...l.stateSnapshots,
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
            if (shouldReplaceCard(card, event) || mode !== "auto")
              setCard(event);
            else setQueued((q) => [...q, event]);
          }
        }
        await save(next);
      } catch {
      } finally {
        setBusy(false);
      }
    },
    [card, settings],
  );
  useEffect(() => {
    if (!card || !queued.length) return;
    const id = setTimeout(
      () => {
        setCard(queued[0]);
        setQueued((q) => q.slice(1));
      },
      Math.max(0, 12000 - (Date.now() - card.timestamp)),
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
      transcriptSegments: [],
      comprehensionEvents: [],
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
    if (data.demo) void runDemo(onFinal);
    else await connect(l);
    onSaved();
  };
  const force = async (mode: "missed" | "why") => {
    const l = lectureRef.current;
    if (!l) return;
    let pending = scheduler.current.getPending();
    if (!pending.length) pending = l.transcriptSegments.slice(-5);
    else scheduler.current.consume();
    await analyze(mode, pending);
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
    const current = lectureRef.current!;
    let finalNote: FinalNote | undefined;
    try {
      finalNote = await api<FinalNote>("/api/finalize", {
        title: current.title,
        state: current.stateSnapshots.at(-1)?.state ?? EMPTY_STATE,
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
  return (
    <section className="live-view">
      <header className="live-header">
        <div>
          <span className={`dot ${connection}`} />
          <span>
            {connection === "connected"
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
        <section className="now">
          <span className="eyebrow">지금</span>
          <h2>{state.currentTopic}</h2>
          {state.conceptChain.length > 0 && (
            <div className="chain">
              {state.conceptChain.slice(-4).map((x, i, a) => (
                <span key={`${x}-${i}`}>
                  {x}
                  {i < a.length - 1 && <b>↓</b>}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="bridge">
          <span className="eyebrow">
            {card?.source === "missed"
              ? "20초 복구"
              : card?.source === "why"
                ? "왜 여기로 왔음?"
                : card?.eventType === "prerequisite"
                  ? "알아야 할 전제"
                  : "빠진 연결"}
          </span>
          <p>
            {card?.missingBridge ||
              card?.prerequisite ||
              card?.shortExplanation ||
              "필요한 연결이 생기면 여기에만 짧게 표시합니다."}
          </p>
        </section>
        <section className="focus">
          <span className="eyebrow">다음에 들을 것</span>
          <p>{card?.nextFocus || "교수의 다음 개념 전환"}</p>
        </section>
        {settings.transcriptDisplay === "small" &&
          (partial || lecture.transcriptSegments.length > 0) && (
            <p className="mini-transcript">
              {partial || lecture.transcriptSegments.at(-1)?.text}
            </p>
          )}
      </div>
      <div className="status-row">
        <span>{wake ? "화면 켜짐" : "화면 유지 불가"}</span>
        <span>
          {busy
            ? "이해 흐름 정리 중"
            : queued.length
              ? `다음 안내 ${queued.length}개 대기`
              : "강의에 집중하세요"}
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
        <button onClick={() => force("missed")} disabled={busy}>
          놓침
        </button>
        <button onClick={() => force("why")} disabled={busy}>
          왜?
        </button>
        <button className="end" onClick={finish} disabled={busy}>
          종료
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
  const lines = [
    "근대사회에서는 개인이 자신의 의사에 따라서 선택할 수 있다는 생각이 중요해집니다.",
    "그런데 결국 사람들은 서로 교환을 하게 되죠.",
    "그렇기 때문에 계약 자유의 원칙이 중요한 의미를 갖습니다.",
    "여기서 중요한 것은 계약을 국가가 어떻게 보장하는가 하는 문제입니다.",
  ];
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
              {(
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
                  {e.fromConcept} → {e.toConcept}
                </small>
                <p>{e.missingBridge || e.shortExplanation || e.prerequisite}</p>
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
            최소<small>빠진 연결만</small>
          </button>
          <button
            className={value.density === "normal" ? "active" : ""}
            onClick={() => onChange({ ...value, density: "normal" })}
          >
            보통<small>선수지식도</small>
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
