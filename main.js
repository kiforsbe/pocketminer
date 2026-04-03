import { AudioManager } from "./audio.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { Renderer } from "./renderer.js";
import { World } from "./world.js";

const AUDIO_MANIFEST = [
  { id: "footsteps", src: "./assets/footstep.wav" },
  { id: "miningHit", src: "./assets/mining-hit.wav" },
  { id: "blockBreak", src: "./assets/block-break.wav" },
  { id: "music-hearth", src: "./assets/Underground_Hearth.mp3" },
  { id: "music-waltz", src: "./assets/Pickaxe_Waltz.mp3" },
];

const LEVEL_MUSIC_IDS = ["music-hearth", "music-waltz"];

const canvas = document.getElementById("game");
const statusText = document.getElementById("status-text");

const world = new World();
const input = new Input({ keyboardTarget: window, pointerTarget: canvas });
const spawn = world.getSpawnPosition();
const player = new Player(spawn);
const renderer = new Renderer(canvas, world);
const audio = new AudioManager();
player.setRendererContext(renderer);

const gameState = {
  inventory: {
    coal: 0,
    iron: 0,
  },
  miningResult: null,
  hoverTarget: null,
  statusText: "Wake the camp, then start digging.",
  audioReady: false,
  lastMiningSoundAt: 0,
  levelMusicId: LEVEL_MUSIC_IDS[Math.floor(Math.random() * LEVEL_MUSIC_IDS.length)],
};

let lastTime = performance.now();

async function bootstrap() {
  statusText.textContent = "Loading placeholder art and audio...";
  const [assets] = await Promise.all([
    Renderer.loadAssets(),
    audio.preload(AUDIO_MANIFEST),
  ]);
  renderer.setAssets(assets);
  gameState.statusText = "Mine the wall in front of you and dig deeper.";
  attachAudioUnlock();
  window.addEventListener("resize", () => renderer.resize());
  requestAnimationFrame(frame);
}

function attachAudioUnlock() {
  const unlock = async () => {
    await audio.unlock();
    audio.startMusic(gameState.levelMusicId);
    gameState.audioReady = true;
    gameState.statusText = "Audio online. Follow the ore veins downward.";
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt, now / 1000);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

function update(dt, timeSeconds) {
  gameState.hoverTarget = player.update(dt, input, world);
  gameState.miningResult = null;

  if (input.isDown("mine")) {
    const miningResult = player.mine(dt, world);
    if (miningResult.active) {
      gameState.miningResult = miningResult;
      if (timeSeconds - gameState.lastMiningSoundAt > 0.16) {
        audio.playSound("miningHit", { playbackRate: 0.96 + Math.random() * 0.1 });
        gameState.lastMiningSoundAt = timeSeconds;
      }

      if (miningResult.broken) {
        if (miningResult.resource) {
          gameState.inventory[miningResult.resource] += 1;
          gameState.statusText = `Collected ${miningResult.resource}. Keep tunneling.`;
        } else {
          gameState.statusText = "Rock cleared. Keep going.";
        }
        renderer.markTerrainDirty();
        audio.playSound("blockBreak", { playbackRate: 0.98 + Math.random() * 0.08 });
      }
    }
  }

  if (player.consumeFootstep()) {
    audio.playSound("footsteps", { playbackRate: 0.95 + Math.random() * 0.12 });
  }
}

function render() {
  renderer.render({
    player,
    world,
    inventory: gameState.inventory,
    miningResult: gameState.miningResult,
    hoverTarget: gameState.hoverTarget,
    statusText: gameState.statusText,
    audioReady: gameState.audioReady,
  });
}

bootstrap().catch((error) => {
  console.error(error);
  if (statusText) {
    statusText.textContent = `Failed to start: ${error.message}`;
  }
});