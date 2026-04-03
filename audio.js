const DEFAULT_GAIN = {
  footsteps: 0.18,
  miningHit: 0.22,
  blockBreak: 0.26,
  music: 0.12,
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.buffers = new Map();
    this.musicSource = null;
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

  stopMusic() {
    if (!this.musicSource) {
      return;
    }

    this.musicSource.stop();
    this.musicSource = null;
  }

  startMusic(id = "music") {
    if (!this.ready || this.context.state !== "running" || this.musicSource) {
      return;
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.musicGain);
    source.start();
    this.musicSource = source;
    source.onended = () => {
      if (this.musicSource === source) {
        this.musicSource = null;
      }
    };
  }
}