export class WakeLockManager {
  private lock: WakeLockSentinel | null = null;
  private active = false;
  constructor(private onChange: (held: boolean) => void) {
    this.visibility = this.visibility.bind(this);
  }
  async acquire() {
    this.active = true;
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") {
      this.onChange(false);
      return;
    }
    try {
      this.lock = await navigator.wakeLock.request("screen");
      this.onChange(true);
      this.lock.addEventListener("release", () => {
        this.lock = null;
        this.onChange(false);
      });
      document.addEventListener("visibilitychange", this.visibility);
    } catch {
      this.onChange(false);
    }
  }
  private visibility() {
    if (this.active && document.visibilityState === "visible" && !this.lock)
      void this.acquire();
  }
  async release() {
    this.active = false;
    document.removeEventListener("visibilitychange", this.visibility);
    await this.lock?.release();
    this.lock = null;
    this.onChange(false);
  }
}
