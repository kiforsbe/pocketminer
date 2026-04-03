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
  { id: "coin", src: "./assets/coin.wav" },
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
const ROUND_DURATION = 60;
const SUMMARY_STEP_RATE = 16;
const NOTIFICATION_DURATION = 3.2;

const canvas = document.getElementById("game");
const roundOverlay = document.getElementById("round-overlay");
const summaryGrid = document.getElementById("summary-grid");
const roundTitle = document.getElementById("round-title");
const roundSubtitle = document.getElementById("round-subtitle");
const summaryBlocks = document.getElementById("summary-blocks");
const summaryItems = document.getElementById("summary-items");
const summaryRound = document.getElementById("summary-round");
const summaryEarnings = document.getElementById("summary-earnings");
const summaryBank = document.getElementById("summary-bank");
const nextRoundButton = document.getElementById("next-round-button");

const input = new Input({ keyboardTarget: window, pointerTarget: canvas });
let world = new World();
let player = new Player(world.getSpawnPosition());
const renderer = new Renderer(canvas, world);
const audio = new AudioManager();
player.setRendererContext(renderer);

const gameState = {
  inventory: new Inventory({ slotCount: 9, stackSize: STACK_SIZE }),
  miningResult: null,
  hoverTarget: null,
  audioReady: false,
  lastMiningSoundAt: 0,
  levelMusicId: LEVEL_MUSIC_IDS[Math.floor(Math.random() * LEVEL_MUSIC_IDS.length)],
  particles: [],
  pickups: [],
  phase: "playing",
  round: 1,
  timeLeft: ROUND_DURATION,
  bank: 0,
  roundStats: createRoundStats(),
  summary: null,
  notification: null,
  alertFlags: {
    halfway: false,
    thirtySeconds: false,
  },
};

let lastTime = performance.now();

async function bootstrap() {
  const [assets] = await Promise.all([
    Renderer.loadAssets(),
    audio.preload(AUDIO_MANIFEST),
  ]);
  renderer.setAssets(assets);
  attachAudioUnlock();
  attachRoundControls();
  window.addEventListener("resize", () => renderer.resize());
  requestAnimationFrame(frame);
}

function attachRoundControls() {
  nextRoundButton?.addEventListener("click", () => {
    if (gameState.phase !== "summary") {
      return;
    }
    startNextRound();
  });
}

function attachAudioUnlock() {
  const unlock = async () => {
    await audio.unlock();
    audio.startMusic(gameState.levelMusicId);
    gameState.audioReady = true;
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
  if (gameState.phase === "summary") {
    updateSummary(dt);
    return;
  }

  gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
  updateRoundNotification(dt);
  checkRoundMilestones();
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
        gameState.roundStats.blocksMined += 1;
        if (miningResult.resource) {
          const quantity = miningResult.dropCount || 1;
          const oreName = ITEM_DEFINITIONS[miningResult.resource].label;
          spawnPickups(miningResult, quantity);
          spawnOreChunks(miningResult);
          audio.playSound("orePop", { playbackRate: 0.94 + Math.random() * 0.14, volume: 0.3 });
        }
        renderer.markTerrainDirty();
        audio.playSound("blockBreak", { playbackRate: 0.98 + Math.random() * 0.08 });
      }
    }
  }

  if (player.consumeFootstep()) {
    audio.playSound("footsteps", { playbackRate: 0.95 + Math.random() * 0.12 });
  }

  if (gameState.timeLeft <= 0) {
    endRound();
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
    roundInfo: {
      round: gameState.round,
      timeLeft: Math.ceil(gameState.timeLeft),
      urgent: gameState.phase === "playing" && gameState.timeLeft <= 30,
      notification: gameState.notification,
    },
  });
}

function createRoundStats() {
  return {
    blocksMined: 0,
    collected: Object.fromEntries(Object.keys(ITEM_DEFINITIONS).map((itemId) => [itemId, 0])),
  };
}

function endRound() {
  if (gameState.phase === "summary") {
    return;
  }

  gameState.phase = "summary";
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  const totals = gameState.inventory.getTotals();
  const oreEntries = Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([itemId, count]) => ({
      itemId,
      count,
      value: ITEM_DEFINITIONS[itemId].value,
      displayedCount: 0,
      displayedValue: 0,
    }))
    .sort((left, right) => right.value - left.value);

  const totalItems = oreEntries.reduce((sum, entry) => sum + entry.count, 0);
  gameState.summary = {
    entries: oreEntries,
    activeIndex: 0,
    tickBudget: 0,
    displayedEarnings: 0,
    totalEarnings: oreEntries.reduce((sum, entry) => sum + entry.count * entry.value, 0),
    blocksMined: gameState.roundStats.blocksMined,
    totalItems,
    completed: oreEntries.length === 0,
  };
  gameState.notification = null;

  gameState.bank += gameState.summary.totalEarnings;
  populateSummaryOverlay();
  roundOverlay?.setAttribute("data-visible", "true");
}

function populateSummaryOverlay() {
  if (!gameState.summary || !summaryGrid) {
    return;
  }

  summaryGrid.replaceChildren();
  roundTitle.textContent = `Round ${gameState.round} Complete`;
  roundSubtitle.textContent = gameState.summary.entries.length
    ? "Counting your haul..."
    : "No ore banked this round.";
  summaryBlocks.textContent = String(gameState.summary.blocksMined);
  summaryItems.textContent = String(gameState.summary.totalItems);
  summaryRound.textContent = String(gameState.round);
  summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
  summaryBank.textContent = `${gameState.bank}€`;

  for (const entry of gameState.summary.entries) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.dataset.itemId = entry.itemId;
    row.innerHTML = `
      <div class="summary-ore">
        <canvas width="26" height="26"></canvas>
        <span>${ITEM_DEFINITIONS[entry.itemId].label}</span>
      </div>
      <div class="summary-count" data-role="count">0</div>
      <div class="summary-value" data-role="value">0€</div>
    `;
    summaryGrid.append(row);
    paintSummaryIcon(row.querySelector("canvas"), entry.itemId);
  }
}

function paintSummaryIcon(canvasEl, itemId) {
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    return;
  }
  const context = canvasEl.getContext("2d");
  const definition = world.getTileDefinition(itemId);
  context.imageSmoothingEnabled = false;
  context.fillStyle = definition.fill;
  context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  context.fillStyle = definition.accent;
  context.fillRect(5, 5, 6, 6);
  context.fillRect(14, 9, 7, 7);
  context.fillRect(10, 16, 8, 8);
}

function updateSummary(dt) {
  if (!gameState.summary || gameState.summary.completed) {
    return;
  }

  gameState.summary.tickBudget += dt * SUMMARY_STEP_RATE;
  while (gameState.summary.tickBudget >= 1 && !gameState.summary.completed) {
    gameState.summary.tickBudget -= 1;
    advanceSummaryCount();
  }
}

function advanceSummaryCount() {
  const entry = gameState.summary.entries[gameState.summary.activeIndex];
  if (!entry) {
    gameState.summary.completed = true;
    roundSubtitle.textContent = "Choose when to begin the next shift.";
    return;
  }

  entry.displayedCount += 1;
  entry.displayedValue += entry.value;
  gameState.summary.displayedEarnings += entry.value;
  updateSummaryRow(entry);
  summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
  audio.playSound("coin", { playbackRate: 0.98 + Math.random() * 0.06, volume: 0.2 });

  if (entry.displayedCount >= entry.count) {
    gameState.summary.activeIndex += 1;
    if (gameState.summary.activeIndex >= gameState.summary.entries.length) {
      gameState.summary.completed = true;
      roundSubtitle.textContent = "Choose when to begin the next shift.";
    }
  }
}

function updateSummaryRow(entry) {
  const row = summaryGrid?.querySelector(`[data-item-id="${entry.itemId}"]`);
  if (!row) {
    return;
  }
  row.querySelector('[data-role="count"]').textContent = `x${entry.displayedCount}`;
  row.querySelector('[data-role="value"]').textContent = `${entry.displayedValue}€`;
}

function startNextRound() {
  gameState.round += 1;
  gameState.phase = "playing";
  gameState.timeLeft = ROUND_DURATION;
  gameState.inventory = new Inventory({ slotCount: 9, stackSize: STACK_SIZE });
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  gameState.particles = [];
  gameState.pickups = [];
  gameState.roundStats = createRoundStats();
  gameState.summary = null;
  gameState.notification = null;
  gameState.alertFlags = {
    halfway: false,
    thirtySeconds: false,
  };
  gameState.lastMiningSoundAt = 0;
  world = new World();
  player = new Player(world.getSpawnPosition());
  player.setRendererContext(renderer);
  renderer.setWorld(world);
  gameState.levelMusicId = LEVEL_MUSIC_IDS[Math.floor(Math.random() * LEVEL_MUSIC_IDS.length)];
  if (gameState.audioReady) {
    audio.stopMusic();
    audio.startMusic(gameState.levelMusicId);
  }
  roundOverlay?.setAttribute("data-visible", "false");
}

function showRoundNotification(message, { urgent = false } = {}) {
  gameState.notification = {
    message,
    urgent,
    ttl: NOTIFICATION_DURATION,
  };
}

function updateRoundNotification(dt) {
  if (!gameState.notification) {
    return;
  }

  gameState.notification.ttl = Math.max(0, gameState.notification.ttl - dt);
  if (gameState.notification.ttl === 0) {
    gameState.notification = null;
  }
}

function checkRoundMilestones() {
  const halfwayMark = ROUND_DURATION / 2;

  if (!gameState.alertFlags.halfway && gameState.timeLeft <= halfwayMark) {
    gameState.alertFlags.halfway = true;
    if (halfwayMark === 30) {
      gameState.alertFlags.thirtySeconds = true;
      showRoundNotification("Halfway there. Final 30 seconds!", { urgent: true });
      return;
    }
    showRoundNotification(`Halfway there. ${Math.ceil(gameState.timeLeft)}s left.`);
  }

  if (!gameState.alertFlags.thirtySeconds && gameState.timeLeft <= 30) {
    gameState.alertFlags.thirtySeconds = true;
    showRoundNotification("Final 30 seconds!", { urgent: true });
  }
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

function spawnPickups(miningResult, quantity) {
  const definition = ITEM_DEFINITIONS[miningResult.resource];
  if (!definition) {
    return;
  }

  const originX = miningResult.column * 32 + 16;
  const originY = miningResult.row * 32 + 18;
  const direction = player.getCenter().x <= originX ? 1 : -1;

  for (let index = 0; index < quantity; index += 1) {
    gameState.pickups.push({
      itemId: miningResult.resource,
      x: originX + (Math.random() - 0.5) * 8,
      y: originY + (Math.random() - 0.5) * 6,
      vx: direction * (70 + Math.random() * 90) + (Math.random() - 0.5) * 45,
      vy: -(140 + Math.random() * 95),
      grounded: false,
      rotation: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 6,
      bobTime: Math.random() * Math.PI * 2,
      radius: PICKUP_RADIUS,
      color: definition.color,
      glow: definition.glow,
    });
  }
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
        gameState.roundStats.collected[nextPickup.itemId] += 1;
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
  const blockNameEl = document.getElementById("block-name");
  const blockTypeEl = document.getElementById("block-type");
  if (blockNameEl) {
    blockNameEl.textContent = "Error";
  }
  if (blockTypeEl) {
    blockTypeEl.textContent = `Startup failed: ${error.message}`;
  }
});