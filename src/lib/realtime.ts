export type ConnectionState =
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";
interface RealtimeCallbacks {
  onPartial: (text: string) => void;
  onFinal: (id: string, text: string) => void;
  onState: (state: ConnectionState) => void;
}
export class RealtimeTranscriber {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private stream?: MediaStream;
  private stopped = false;
  private attempt = 0;
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
      if (!tokenResponse.ok) throw new Error("credential");
      const { value } = await tokenResponse.json();
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
      if (!response.ok) throw new Error("webrtc");
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch {
      if (!this.stopped) this.reconnect();
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
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
    if (this.attempt > 8) {
      this.callbacks.onState("failed");
      return;
    }
    window.setTimeout(() => {
      if (!this.stopped && navigator.onLine) void this.start(true);
    }, delay);
  }
  stop() {
    this.stopped = true;
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.callbacks.onState("disconnected");
  }
}
