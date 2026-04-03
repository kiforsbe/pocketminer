import { AudioManager } from "./audio.js";
import { Inventory, ITEM_DEFINITIONS } from "./inventory.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { Renderer } from "./renderer.js";
import { World } from "./world.js";

const AUDIO_MANIFEST = [
  { id: "footsteps", src: "./assets/footstep.wav" },
  { id: "miningHit", src: "./assets/mining-hit.wav" },
  { id: "blockBreak", src: "./assets/block-break.wav" },
  { id: "orePop", src: "./assets/ore-pop.wav" },
  { id: "music-hearth", src: "./assets/Underground_Hearth.mp3" },
  { id: "music-waltz", src: "./assets/Pickaxe_Waltz.mp3" },
];

const LEVEL_MUSIC_IDS = ["music-hearth", "music-waltz"];
const PARTICLE_GRAVITY = 820;
const PICKUP_GRAVITY = 980;
const PICKUP_BOB_SPEED = 6;
const PICKUP_RADIUS = 10;
const PICKUP_MAGNET_RANGE = 86;
const PICKUP_COLLECT_RANGE = 20;
const STACK_SIZE = 8;

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
  inventory: new Inventory({ slotCount: 9, stackSize: STACK_SIZE }),
  miningResult: null,
  hoverTarget: null,
  statusText: "Wake the camp, then start digging.",
  audioReady: false,
  lastMiningSoundAt: 0,
  levelMusicId: LEVEL_MUSIC_IDS[Math.floor(Math.random() * LEVEL_MUSIC_IDS.length)],
  particles: [],
  pickups: [],
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
  updateParticles(dt);
  updatePickups(dt);

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
          gameState.statusText = `${ITEM_DEFINITIONS[miningResult.resource].label} popped free. Pick it up.`;
          spawnPickup(miningResult);
          spawnOreChunks(miningResult);
          audio.playSound("orePop", { playbackRate: 0.94 + Math.random() * 0.14, volume: 0.3 });
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
    particles: gameState.particles,
    pickups: gameState.pickups,
    statusText: gameState.statusText,
    audioReady: gameState.audioReady,
  });
}

function spawnOreChunks(miningResult) {
  const palette = ITEM_DEFINITIONS[miningResult.resource];
  if (!palette) {
    return;
  }

  const originX = miningResult.column * 32 + 16;
  const originY = miningResult.row * 32 + 16;
  const direction = player.getCenter().x <= originX ? 1 : -1;
  const count = 7 + Math.floor(Math.random() * 3);

  for (let index = 0; index < count; index += 1) {
    gameState.particles.push({
      x: originX + (Math.random() - 0.5) * 10,
      y: originY + (Math.random() - 0.5) * 8,
      vx: direction * (120 + Math.random() * 90) + (Math.random() - 0.5) * 45,
      vy: -(110 + Math.random() * 120),
      size: 6 + Math.random() * 5,
      color: palette.color,
      glow: palette.glow,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 9,
      life: 0.55 + Math.random() * 0.3,
      maxLife: 0.55 + Math.random() * 0.3,
    });
  }
}

function spawnPickup(miningResult) {
  const definition = ITEM_DEFINITIONS[miningResult.resource];
  if (!definition) {
    return;
  }

  const originX = miningResult.column * 32 + 16;
  const originY = miningResult.row * 32 + 18;
  const direction = player.getCenter().x <= originX ? 1 : -1;

  gameState.pickups.push({
    itemId: miningResult.resource,
    x: originX,
    y: originY,
    vx: direction * (90 + Math.random() * 80),
    vy: -(160 + Math.random() * 80),
    grounded: false,
    rotation: Math.random() * Math.PI * 2,
    angularVelocity: (Math.random() - 0.5) * 6,
    bobTime: Math.random() * Math.PI * 2,
    radius: PICKUP_RADIUS,
    color: definition.color,
    glow: definition.glow,
  });
}

function updateParticles(dt) {
  gameState.particles = gameState.particles
    .map((particle) => {
      const nextParticle = { ...particle };
      nextParticle.life -= dt;
      nextParticle.vy += PARTICLE_GRAVITY * dt;
      nextParticle.x += nextParticle.vx * dt;
      nextParticle.y += nextParticle.vy * dt;
      nextParticle.rotation += nextParticle.angularVelocity * dt;
      return nextParticle;
    })
    .filter((particle) => particle.life > 0);
}

function updatePickups(dt) {
  const playerCenter = player.getCenter();
  const remainingPickups = [];

  for (const pickup of gameState.pickups) {
    const nextPickup = { ...pickup, bobTime: pickup.bobTime + dt * PICKUP_BOB_SPEED };
    const dx = playerCenter.x - nextPickup.x;
    const dy = playerCenter.y - nextPickup.y;
    const distance = Math.hypot(dx, dy);
    const canCollect = gameState.inventory.hasSpaceFor(nextPickup.itemId, 1);

    if (canCollect && distance < PICKUP_MAGNET_RANGE) {
      const attraction = Math.max(90, 280 - distance * 1.7);
      nextPickup.vx += (dx / Math.max(distance, 1)) * attraction * dt;
      nextPickup.vy += (dy / Math.max(distance, 1)) * attraction * dt;
    }

    nextPickup.vy += PICKUP_GRAVITY * dt;
    nextPickup.x += nextPickup.vx * dt;
    nextPickup.y += nextPickup.vy * dt;
    nextPickup.rotation += nextPickup.angularVelocity * dt;
    nextPickup.grounded = false;

    resolvePickupCollisions(nextPickup);

    if (canCollect && distance < PICKUP_COLLECT_RANGE) {
      const result = gameState.inventory.addItem(nextPickup.itemId, 1);
      if (result.added > 0) {
        gameState.statusText = `${ITEM_DEFINITIONS[nextPickup.itemId].label} stored in inventory.`;
        audio.playSound("orePop", { playbackRate: 1.16 + Math.random() * 0.08, volume: 0.18 });
        continue;
      }
    }

    remainingPickups.push(nextPickup);
  }

  gameState.pickups = remainingPickups;
}

function resolvePickupCollisions(pickup) {
  const floorTile = world.getTileAtPixel(pickup.x, pickup.y + pickup.radius + 1);
  if (floorTile?.solid) {
    const row = Math.floor((pickup.y + pickup.radius + 1) / 32);
    pickup.y = row * 32 - pickup.radius - 0.01;
    if (Math.abs(pickup.vy) > 80) {
      pickup.vy *= -0.28;
    } else {
      pickup.vy = 0;
      pickup.grounded = true;
    }
    pickup.vx *= 0.88;
  }

  const leftTile = world.getTileAtPixel(pickup.x - pickup.radius, pickup.y);
  if (leftTile?.solid) {
    const column = Math.floor((pickup.x - pickup.radius) / 32);
    pickup.x = (column + 1) * 32 + pickup.radius;
    pickup.vx = Math.abs(pickup.vx) * 0.35;
  }

  const rightTile = world.getTileAtPixel(pickup.x + pickup.radius, pickup.y);
  if (rightTile?.solid) {
    const column = Math.floor((pickup.x + pickup.radius) / 32);
    pickup.x = column * 32 - pickup.radius;
    pickup.vx = -Math.abs(pickup.vx) * 0.35;
  }
}

bootstrap().catch((error) => {
  console.error(error);
  if (statusText) {
    statusText.textContent = `Failed to start: ${error.message}`;
  }
});