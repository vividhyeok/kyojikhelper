import { AudioTurnDetector } from "./realtime-turns";

export type ConnectionState =
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";
interface RealtimeCallbacks {
  onPartial: (text: string) => void;
  onFinal: (id: string, text: string) => void;
  onState: (state: ConnectionState) => void;
  onActivity?: (activity: "waiting" | "speech" | "transcribing") => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
}
export class RealtimeTranscriber {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private stream?: MediaStream;
  private stopped = false;
  private attempt = 0;
  private retryTimer?: number;
  private seen = new Set<string>();
  private audioContext?: AudioContext;
  private levelTimer?: number;
  private partialText = "";
  constructor(
    private options: { keywords: string[]; topic?: string },
    private callbacks: RealtimeCallbacks,
  ) {}
  async start(reconnecting = false) {
    this.stopped = false;
    this.callbacks.onState(reconnecting ? "reconnecting" : "disconnected");
    try {
      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.options),
      });
      if (!tokenResponse.ok) {
        if (tokenResponse.status === 401)
          throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        const detail = await tokenResponse.json().catch(() => null);
        const upstream = detail?.diagnostic;
        const cause = upstream?.param || upstream?.code;
        throw new Error(
          tokenResponse.status === 400 || tokenResponse.status === 413
            ? detail?.error || "수업 설정을 확인해 주세요."
            : cause
              ? `전사 연결 준비 실패 (${upstream.status ?? tokenResponse.status}: ${cause}).`
              : `전사 토큰 발급 실패 (${tokenResponse.status}). 잠시 후 다시 시도해 주세요.`,
        );
      }
      const { value } = await tokenResponse.json();
      if (!value) throw new Error("전사 연결 정보를 받지 못했습니다.");
      this.stream ??= await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const pc = (this.pc = new RTCPeerConnection());
      this.stream
        .getTracks()
        .forEach((track) => pc.addTrack(track, this.stream!));
      const dc = (this.dc = pc.createDataChannel("oai-events"));
      dc.onmessage = (event) => this.handle(JSON.parse(event.data));
      dc.onopen = () => {
        this.attempt = 0;
        this.callbacks.onError?.("");
        this.callbacks.onState("connected");
        void this.startTurnDetection();
      };
      pc.onconnectionstatechange = () => {
        if (
          ["disconnected", "failed"].includes(pc.connectionState) &&
          !this.stopped
        )
          this.reconnect();
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const cause = detail?.error?.code || detail?.error?.param;
        throw new Error(
          `OpenAI 음성 연결 실패 (${response.status}${cause ? `: ${cause}` : ""}).`,
        );
      }
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "실시간 연결 오류";
      this.callbacks.onError?.(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "마이크 권한을 허용해 주세요."
          : message,
      );
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.callbacks.onState("failed");
      } else if (!this.stopped) {
        this.reconnect();
      }
    }
  }
  private handle(event: {
    type: string;
    item_id?: string;
    delta?: string;
    transcript?: string;
  }) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      this.partialText = (this.partialText + (event.delta ?? "")).slice(-500);
      this.callbacks.onPartial(this.partialText);
      this.callbacks.onActivity?.("transcribing");
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.partialText = "";
      this.callbacks.onPartial("");
      this.callbacks.onActivity?.("waiting");
      if (
        event.item_id &&
        event.transcript?.trim() &&
        !this.seen.has(event.item_id)
      ) {
        this.seen.add(event.item_id);
        this.callbacks.onFinal(event.item_id, event.transcript.trim());
      }
    }
  }
  private async startTurnDetection() {
    if (!this.stream || !this.dc || this.stopped) return;
    this.stopTurnDetection();
    try {
      const context = (this.audioContext = new AudioContext());
      const source = context.createMediaStreamSource(this.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      await context.resume();
      const samples = new Uint8Array(analyser.fftSize);
      const detector = new AudioTurnDetector();
      let lastActivity = "waiting";
      let lastLevelUpdate = 0;
      let lastCommitAt = performance.now();
      this.levelTimer = window.setInterval(() => {
        if (this.dc?.readyState !== "open") return;
        analyser.getByteTimeDomainData(samples);
        let power = 0;
        for (const sample of samples) power += ((sample - 128) / 128) ** 2;
        const level = Math.sqrt(power / samples.length);
        const now = performance.now();
        if (now - lastLevelUpdate >= 250) {
          this.callbacks.onLevel?.(Math.min(5, Math.floor(level * 80)));
          lastLevelUpdate = now;
        }
        const activity = detector.sample(level, now);
        if (activity === "commit" || now - lastCommitAt >= 30_000) {
          this.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          lastCommitAt = now;
          this.callbacks.onActivity?.("transcribing");
          lastActivity = "transcribing";
        } else if (activity !== lastActivity) {
          this.callbacks.onActivity?.(activity);
          lastActivity = activity;
        }
      }, 100);
    } catch {
      // WebRTC still transports audio when Web Audio metering is unavailable.
      this.levelTimer = window.setInterval(() => {
        if (this.dc?.readyState === "open") {
          this.dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          this.callbacks.onActivity?.("transcribing");
        }
      }, 15_000);
    }
  }
  private stopTurnDetection() {
    if (this.levelTimer) window.clearInterval(this.levelTimer);
    this.levelTimer = undefined;
    void this.audioContext?.close();
    this.audioContext = undefined;
    this.callbacks.onLevel?.(0);
  }
  private reconnect() {
    this.stopTurnDetection();
    this.pc?.close();
    this.callbacks.onState("reconnecting");
    const delay = Math.min(15_000, 1000 * 2 ** this.attempt++);
    if (this.attempt > 3) {
      this.callbacks.onState("failed");
      return;
    }
    this.retryTimer = window.setTimeout(() => {
      if (!this.stopped && navigator.onLine) void this.start(true);
    }, delay);
  }
  retry() {
    this.attempt = 0;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    void this.start(true);
  }
  stop() {
    this.stopped = true;
    this.stopTurnDetection();
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.callbacks.onState("disconnected");
  }
}
