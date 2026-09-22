/** Segments the live WebRTC audio track without retaining or recording samples. */
export class AudioTurnDetector {
  private firstVoiceAt: number | null = null;
  private lastVoiceAt = 0;
  private lastSampleAt = 0;
  private voicedMs = 0;

  sample(level: number, now: number): "waiting" | "speech" | "commit" {
    if (level >= 0.014) {
      this.firstVoiceAt ??= now;
      this.lastVoiceAt = now;
      this.voicedMs += Math.min(150, Math.max(0, now - this.lastSampleAt));
    }
    this.lastSampleAt = now;

    if (this.firstVoiceAt === null || this.voicedMs < 450)
      return this.firstVoiceAt === null ? "waiting" : "speech";
    if (now - this.lastVoiceAt >= 900 || now - this.firstVoiceAt >= 15_000) {
      this.firstVoiceAt = null;
      this.voicedMs = 0;
      return "commit";
    }
    return "speech";
  }
}
