export type ConnectionState =
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";
interface RealtimeCallbacks {
  onPartial: (text: string) => void;
  onFinal: (id: string, text: string) => void;
  onState: (state: ConnectionState) => void;
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
    if (event.type === "conversation.item.input_audio_transcription.delta")
      this.callbacks.onPartial(event.delta ?? "");
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.item_id &&
      event.transcript &&
      !this.seen.has(event.item_id)
    ) {
      this.seen.add(event.item_id);
      this.callbacks.onPartial("");
      this.callbacks.onFinal(event.item_id, event.transcript.trim());
    }
  }
  private reconnect() {
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
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.callbacks.onState("disconnected");
  }
}
