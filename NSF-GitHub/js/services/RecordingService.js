// ─── RecordingService.js ────────────────────────────────────────────────────

class RecordingService {
  constructor() {
    this._recorder    = null;
    this._stream      = null;
    this._chunks      = [];
    this._startTime   = null;
    this._timerHandle = null;
    this.onStateChange = null;
    this.onChunk       = null;
  }

  get isRecording() {
    return this._recorder?.state === "recording";
  }

  async start() {
    if (this.isRecording) return;
    this._chunks = [];
    try {
      this._stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._recorder = new MediaRecorder(this._stream, { mimeType: this._preferredMime() });
      this._recorder.ondataavailable = (e) => {
        if (e.data.size > 0) { this._chunks.push(e.data); this.onChunk?.(e.data); }
      };
      this._recorder.start(1000);
      this._startTime = Date.now();
      this._startTimer();
      this.onStateChange?.("recording");
    } catch (err) {
      this.onStateChange?.("error", err);
      throw err;
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this._recorder || this._recorder.state === "inactive") { resolve(null); return; }
      this._recorder.onstop = () => {
        const mime = this._recorder.mimeType || "audio/webm";
        const blob = new Blob(this._chunks, { type: mime });
        this._cleanup();
        this.onStateChange?.("stopped");
        resolve(blob);
      };
      this._stopTimer();
      this._recorder.stop();
    });
  }

  cancel() {
    this._stopTimer();
    if (this._recorder && this._recorder.state !== "inactive") {
      this._recorder.ondataavailable = null;
      this._recorder.stop();
    }
    this._cleanup();
    this.onStateChange?.("cancelled");
  }

  elapsed() {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  _startTimer() {
    this._timerHandle = setInterval(() => {
      this.onStateChange?.("tick", this.elapsed());
    }, 1000);
  }
  _stopTimer() { clearInterval(this._timerHandle); this._timerHandle = null; }
  _cleanup() {
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null; this._recorder = null;
    this._startTime = null; this._chunks = [];
  }
  _preferredMime() {
    const candidates = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
  }
}
