// ─── TranscriptionService.js ────────────────────────────────────────────────
// Plugin — används bara när FEATURES.transcription === true.
// Publik version: instansieras med enabled: false → gör ingenting.

class TranscriptionService {
  constructor(options = {}) {
    this.enabled  = options.enabled  ?? false;
    this.apiKey   = options.apiKey   ?? null;
    this.endpoint = options.endpoint ?? null;
  }

  /** Returnerar null om disabled. Kasta annars implementationsfel. */
  async transcribe(audioBlob) {
    if (!this.enabled) return null;

    // Privat version — implementera här:
    // const form = new FormData();
    // form.append('file', audioBlob, 'audio.webm');
    // form.append('model', 'whisper-1');
    // form.append('language', 'sv');
    // const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${this.apiKey}` },
    //   body: form,
    // });
    // return (await res.json()).text ?? null;

    throw new Error("TranscriptionService: ingen implementation konfigurerad.");
  }
}
