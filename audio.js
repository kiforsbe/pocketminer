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
  halfwaySiren: 0.24,
  introStart: 0.22,
  shiftCountdown: 0.2,
  treasureChest: 0.24,
  music: 0.12,
};

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.buffers = new Map();
    this.musicLayers = new Map();
    this.musicLayerCounter = 0;
    this.musicToken = 0;
    this.ready = false;
  }

  #disposeMusicLayer(layerId, source) {
    const activeLayer = this.musicLayers.get(layerId);
    if (activeLayer?.source !== source) {
      return;
    }

    if (activeLayer.stopTimeoutId !== null) {
      window.clearTimeout(activeLayer.stopTimeoutId);
    }

    this.musicLayers.delete(layerId);
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
    this.playSound("playerDeath", { volume });
  }

  playCheatCodeActivated() {
    this.playSound("cheatCode");
  }

  getBufferDuration(id) {
    const buffer = this.buffers.get(id);
    return buffer?.duration ?? 0;
  }

  stopMusic() {
    this.musicToken += 1;
    for (const [layerId, layer] of this.musicLayers.entries()) {
      if (layer.stopTimeoutId !== null) {
        window.clearTimeout(layer.stopTimeoutId);
      }
      layer.source.onended = null;
      layer.source.stop();
      this.musicLayers.delete(layerId);
    }
  }

  stopMusicLayer(layerId) {
    const layer = this.musicLayers.get(layerId);
    if (!layer) {
      return;
    }

    if (layer.stopTimeoutId !== null) {
      window.clearTimeout(layer.stopTimeoutId);
    }

    layer.source.onended = null;
    layer.source.stop();
    this.musicLayers.delete(layerId);
  }

  fadeOutMusicLayer(layerId, durationMs) {
    if (!this.ready || !this.context) {
      this.stopMusicLayer(layerId);
      return;
    }

    const layer = this.musicLayers.get(layerId);
    if (!layer) {
      return;
    }

    const normalizedDurationMs = Math.max(0, Math.round(durationMs));
    if (normalizedDurationMs === 0) {
      this.stopMusicLayer(layerId);
      return;
    }

    if (layer.stopTimeoutId !== null) {
      window.clearTimeout(layer.stopTimeoutId);
    }

    const now = this.context.currentTime;
    const currentGain = layer.gainNode.gain.value;
    layer.gainNode.gain.cancelScheduledValues(now);
    layer.gainNode.gain.setValueAtTime(currentGain, now);
    layer.gainNode.gain.linearRampToValueAtTime(0, now + (normalizedDurationMs / 1000));
    layer.stopTimeoutId = window.setTimeout(() => {
      const activeLayer = this.musicLayers.get(layerId);
      if (activeLayer?.source !== layer.source) {
        return;
      }

      layer.stopTimeoutId = null;
      layer.source.onended = null;
      layer.source.stop();
      this.#disposeMusicLayer(layerId, layer.source);
    }, normalizedDurationMs);
  }

  playMusicSegment(id, { loop = false, onended = null, layer = "main", fadeInMs = 0, crossfadeOutMs = 0, volume = 1 } = {}) {
    if (!this.ready || this.context.state !== "running") {
      return null;
    }

    const buffer = this.buffers.get(id);
    if (!buffer) {
      return null;
    }

    const token = ++this.musicToken;
    const existingLayer = this.musicLayers.get(layer);
    if (existingLayer && crossfadeOutMs > 0) {
      const fadingLayerId = `${layer}#fade-${++this.musicLayerCounter}`;
      this.musicLayers.delete(layer);
      this.musicLayers.set(fadingLayerId, existingLayer);
      this.fadeOutMusicLayer(fadingLayerId, crossfadeOutMs);
    } else {
      this.stopMusicLayer(layer);
    }

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const now = this.context.currentTime;
    source.buffer = buffer;
    source.loop = loop;
    gainNode.gain.setValueAtTime(fadeInMs > 0 ? 0 : volume, now);
    if (fadeInMs > 0) {
      gainNode.gain.linearRampToValueAtTime(volume, now + (fadeInMs / 1000));
    }
    source.connect(gainNode);
    gainNode.connect(this.musicGain);
    source.start();
    this.musicLayers.set(layer, { source, gainNode, token, stopTimeoutId: null });
    source.onended = () => {
      this.#disposeMusicLayer(layer, source);
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