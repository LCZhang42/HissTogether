import type { FailureGag } from '@qiqihar/shared';

export class AudioManager {
  private context?: AudioContext;
  private hissBuffer: AudioBuffer | undefined;
  private hissBufferPromise: Promise<AudioBuffer | undefined> | undefined;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) void this.context?.resume();
  }

  unlock(): void {
    if (!this.muted) void this.ensureContext().resume();
  }

  playHiss(slot: number): void {
    const context = this.activeContext();
    if (!context) return;
    if (this.hissBuffer) {
      this.playRecordedHiss(context, slot);
      return;
    }
    this.loadRecordedHiss(context);
    this.playSyntheticHiss(context, slot);
  }

  private playRecordedHiss(context: AudioContext, slot: number): void {
    if (!this.hissBuffer) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const rates = [1.06, 0.98, 1.1, 0.92];
    const pans = [-0.35, -0.12, 0.12, 0.35];
    source.buffer = this.hissBuffer;
    source.playbackRate.value = rates[slot] ?? 1;
    panner.pan.value = pans[slot] ?? 0;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
    source.connect(gain).connect(panner).connect(context.destination);
    source.start(now, 0.88 + slot * 0.055);
    source.stop(now + 0.8);
  }

  private playSyntheticHiss(context: AudioContext, slot: number): void {
    const now = context.currentTime;
    const source = this.noiseSource(context, 0.52);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2_300 + slot * 170;
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
  }

  playMeow(slot: number): void {
    const context = this.activeContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(620 + slot * 35, now);
    oscillator.frequency.exponentialRampToValueAtTime(820 + slot * 25, now + 0.11);
    oscillator.frequency.exponentialRampToValueAtTime(510 + slot * 20, now + 0.34);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
  }

  playBoop(): void { this.playTone(460, 760, 0.12, 0.035, 'sine'); }

  playFail(gag?: FailureGag): void {
    if (gag === 'near-miss') {
      this.playTone(520, 360, 0.22, 0.065, 'triangle');
      window.setTimeout(() => this.playTone(455, 245, 0.34, 0.055, 'triangle'), 170);
      return;
    }
    if (gag === 'three-of-four') {
      this.playTone(560, 310, 0.36, 0.065, 'triangle');
      window.setTimeout(() => this.playTone(210, 145, 0.28, 0.04, 'square'), 90);
      return;
    }
    if (gag === 'chorus') {
      [390, 455, 330].forEach((frequency, index) => {
        window.setTimeout(() => this.playTone(frequency, frequency * 0.72, 0.28, 0.045, 'sawtooth'), index * 105);
      });
      return;
    }
    if (gag === 'too-early') {
      this.playTone(690, 260, 0.42, 0.06, 'triangle');
      return;
    }
    if (gag === 'too-late') {
      this.playTone(280, 155, 0.48, 0.065, 'triangle');
      return;
    }
    this.playTone(410, 175, 0.46, 0.065, 'triangle');
  }

  playAchoo(): void {
    const context = this.activeContext();
    if (!context) return;
    const now = context.currentTime;
    const source = this.noiseSource(context, 0.24);
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1_100;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    this.playTone(520, 250, 0.2, 0.02, 'square');
  }

  playWin(): void {
    [523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) => {
      window.setTimeout(() => this.playTone(frequency, frequency * 1.03, 0.42, 0.022, 'triangle'), index * 45);
    });
  }

  private playTone(startHz: number, endHz: number, duration: number, volume: number, type: OscillatorType): void {
    const context = this.activeContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private noiseSource(context: AudioContext, duration: number): AudioBufferSourceNode {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  private activeContext(): AudioContext | undefined {
    if (this.muted) return undefined;
    return this.ensureContext();
  }

  private ensureContext(): AudioContext {
    this.context ??= new AudioContext();
    this.loadRecordedHiss(this.context);
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private loadRecordedHiss(context: AudioContext): void {
    this.hissBufferPromise ??= fetch('/assets/audio/cat-hiss-zabuhailo.wav')
      .then((response) => {
        if (!response.ok) throw new Error(`Hiss audio request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .catch(() => undefined);
    void this.hissBufferPromise.then((buffer) => { this.hissBuffer = buffer; });
  }
}
