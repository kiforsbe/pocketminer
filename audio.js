const DEFAULT_GAIN = {
  footsteps: 0.18,
  jump: 0.2,
  playerDeath: 0.24,
  miningHitDirt: 0.2,
  miningHitSoft: 0.22,
  miningHit: 0.22,
  blockBreak: 0.26,
  cashRegister: 0.26,
  cheatCode: 0.28,
  coin: 0.22,
  treasureChest: 0.24,
  music: 0.12,
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.buffers = new Map();
    this.musicSource = null;
    this.musicToken = 0;
    this.ready = false;
  }

  async preload(manifest) {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    this.context = new AudioContextCtor({ latencyHint: "interactive" });
    this.masterGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.masterGain.gain.value = 0.9;
    this.musicGain.gain.value = DEFAULT_GAIN.music;
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);

    const entries = await Promise.all(manifest.map(async ({ id, src }) => {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
      return [id, buffer];
    }));

    for (const [id, buffer] of entries) {
      this.buffers.set(id, buffer);
    }

    this.ready = true;
    return this;
  }

  async unlock() {
    if (!this.context) {
      return;
    }

    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  playSound(id, { volume = DEFAULT_GAIN[id] ?? 0.25, playbackRate = 1 } = {}) {
    if (!this.ready || this.context.state !== "running") {
      return;
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return;
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playPlayerDeath({ volume = DEFAULT_GAIN.playerDeath } = {}) {
    if (!this.ready || this.context.state !== "running") {
      return;
    }

    const now = this.context.currentTime;
    const master = this.masterGain;
    const createVoice = ({ type, startFrequency, endFrequency, detune = 0, startDelay = 0, duration = 0.42, gain = 0.12 }) => {
      const oscillator = this.context.createOscillator();
      const gainNode = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(startFrequency, now + startDelay);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + startDelay + duration);
      oscillator.detune.value = detune;

      gainNode.gain.setValueAtTime(0.0001, now + startDelay);
      gainNode.gain.exponentialRampToValueAtTime(volume * gain, now + startDelay + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + startDelay + duration);

      oscillator.connect(gainNode);
      gainNode.connect(master);
      oscillator.start(now + startDelay);
      oscillator.stop(now + startDelay + duration + 0.02);
    };

    createVoice({ type: "sawtooth", startFrequency: 190, endFrequency: 54, duration: 0.48, gain: 0.18 });
    createVoice({ type: "triangle", startFrequency: 132, endFrequency: 42, detune: -7, duration: 0.52, gain: 0.16 });
    createVoice({ type: "square", startFrequency: 310, endFrequency: 120, startDelay: 0.02, duration: 0.2, gain: 0.06 });
  }

  playCheatCodeActivated() {
    this.playSound("cheatCode");
  }

  stopMusic() {
    this.musicToken += 1;
    if (!this.musicSource) {
      return;
    }

    this.musicSource.onended = null;
    this.musicSource.stop();
    this.musicSource = null;
  }

  playMusicSegment(id, { loop = false, onended = null } = {}) {
    if (!this.ready || this.context.state !== "running") {
      return null;
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return null;
    }

    const token = ++this.musicToken;
    if (this.musicSource) {
      this.musicSource.onended = null;
      this.musicSource.stop();
      this.musicSource = null;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(this.musicGain);
    source.start();
    this.musicSource = source;
    source.onended = () => {
      if (this.musicSource === source) {
        this.musicSource = null;
      }
      if (token === this.musicToken) {
        onended?.();
      }
    };
    return token;
  }

  startMusic(id = "music") {
    return this.playMusicSegment(id, { loop: true });
  }
}