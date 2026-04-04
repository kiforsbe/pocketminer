import { AudioManager } from "./audio.js";
import { createChestRewardController, createPlayerBonuses } from "./chestRewards.js";
import { createCheatCodeController } from "./cheatCodes.js";
import { createEndOfRoundSystem } from "./endOfRoundSystem.js";
import { createFloatingTextSystem } from "./floatingText.js";
import { Inventory, ITEM_DEFINITIONS } from "./inventory.js";
import { Input } from "./input.js";
import { createMusicManifest, createMusicSystem } from "./musicSystem.js";
import { createParticleSystem } from "./particleSystem.js";
import { Player } from "./player.js";
import { createPlatformPlacementSystem } from "./platformPlacement.js";
import { createPickupSystem } from "./pickups.js";
import { Renderer } from "./renderer.js";
import { createStoreController } from "./storeSystem.js";
import { TILE_TYPES } from "./tile.js";
import {
  DEFAULT_BAG_ROOT_ID,
  DEFAULT_CAPACITY_ROOT_ID,
  DEFAULT_GAME_MODE,
  DEFAULT_SLOT_COUNT,
  DEFAULT_STACK_SIZE,
  DEFAULT_TIME_ROOT_ID,
  DEFAULT_TOOL_ID,
  getToolDefinition,
} from "./tools.js";
import { World, WORLD_STRATA } from "./world.js";

const AUDIO_MANIFEST = [
  { id: "footsteps", src: "./assets/sfx/footstep.wav" },
  { id: "jump", src: "./assets/sfx/jump.wav" },
  { id: "playerDeath", src: "./assets/sfx/player-death.wav" },
  { id: "miningHitDirt", src: "./assets/sfx/mining-hit-dirt.wav" },
  { id: "miningHitSoft", src: "./assets/sfx/mining-hit-soft.wav" },
  { id: "miningHit", src: "./assets/sfx/mining-hit.wav" },
  { id: "blockBreak", src: "./assets/sfx/block-break.wav" },
  { id: "cashRegister", src: "./assets/sfx/cash-register.wav" },
  { id: "cheatCode", src: "./assets/sfx/cheat-code.wav" },
  { id: "orePop", src: "./assets/sfx/ore-pop.wav" },
  { id: "coin", src: "./assets/sfx/coin.wav" },
  { id: "tick", src: "./assets/sfx/tick.wav" },
  { id: "treasureChest", src: "./assets/sfx/treasure-chest.wav" },
  ...createMusicManifest(WORLD_STRATA),
];
const PLATFORM_COOLDOWN_SECONDS = 3;
const NOTIFICATION_DURATION = 3.2;

const canvas = document.getElementById("game");
const cardOverlay = document.getElementById("card-overlay");
const cardTitle = document.getElementById("card-title");
const cardSubtitle = document.getElementById("card-subtitle");
const cardChoiceGrid = document.getElementById("card-choice-grid");
const cardFooter = document.getElementById("card-footer");

function isMusicActivePhase(phase = gameState.phase) {
  return phase === "playing" || phase === "reward" || phase === "summary";
}

function getPlatformCooldownDuration() {
  return PLATFORM_COOLDOWN_SECONDS / (1 + (gameState.playerBonuses.platformCooldown ?? 0));
}

function getMiningHitSoundId(miningResult) {
  const tileType = miningResult.broken ? miningResult.brokenType : miningResult.target?.tile?.type;
  if (!tileType) {
    return "miningHit";
  }

  if (tileType === TILE_TYPES.DIRT) {
    return "miningHitDirt";
  }

  if ([TILE_TYPES.STONE, TILE_TYPES.SHALE, TILE_TYPES.MAGMA].includes(tileType)) {
    return "miningHitSoft";
  }

  return "miningHit";
}

const input = new Input({ keyboardTarget: window, pointerTarget: canvas });
let world = new World({ seed: World.createRandomSeed() });
const renderer = new Renderer(canvas, world);
const audio = new AudioManager();

const gameState = {
  gameMode: DEFAULT_GAME_MODE,
  equippedToolId: DEFAULT_TOOL_ID,
  bagUpgradeId: DEFAULT_BAG_ROOT_ID,
  capacityUpgradeId: DEFAULT_CAPACITY_ROOT_ID,
  timeUpgradeId: DEFAULT_TIME_ROOT_ID,
  inventory: new Inventory({ slotCount: DEFAULT_SLOT_COUNT, stackSize: DEFAULT_STACK_SIZE }),
  miningResult: null,
  hoverTarget: null,
  audioReady: false,
  lastMiningSoundAt: 0,
  particles: [],
  pickups: [],
  floatingTexts: [],
  platformCooldown: 0,
  phase: "playing",
  round: 1,
  timeLeft: getToolDefinition(DEFAULT_TIME_ROOT_ID).durationSeconds ?? 60,
  bank: 0,
  roundStats: createRoundStats(),
  summary: null,
  chestReward: null,
  notification: null,
  playerBonuses: createPlayerBonuses(),
  alertFlags: {
    halfway: false,
    thirtySeconds: false,
  },
  countdownTickCooldown: 0,
  music: {
    currentStratumName: null,
    pendingStratumName: null,
    transitionToken: 0,
  },
  performance: {
    visible: false,
    tickSampleElapsed: 0,
    tickSampleCount: 0,
    displayedTickRate: 0,
  },
};

const floatingTextSystem = createFloatingTextSystem({
  getFloatingTexts: () => gameState.floatingTexts,
  setFloatingTexts: (floatingTexts) => {
    gameState.floatingTexts = floatingTexts;
  },
});

const particleSystem = createParticleSystem({
  getParticles: () => gameState.particles,
  setParticles: (particles) => {
    gameState.particles = particles;
  },
  getPlayer: () => player,
});

const musicSystem = createMusicSystem({
  audio,
  gameState,
  getWorld: () => world,
  getPlayer: () => player,
  worldStrata: WORLD_STRATA,
  isMusicActivePhase,
});

const platformPlacementSystem = createPlatformPlacementSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer: () => player,
  getWorld: () => world,
  getPlatformCooldownDuration,
});

const pickupSystem = createPickupSystem({
  getPickups: () => gameState.pickups,
  setPickups: (pickups) => {
    gameState.pickups = pickups;
  },
  getPlayer: () => player,
  getWorld: () => world,
  getInventory: () => gameState.inventory,
  floatingTextSystem,
  audio,
  onItemCollected: (itemId) => {
    gameState.roundStats.collected[itemId] += 1;
  },
  onTreasureCollected: (chest) => {
    chestRewardController.openChestReward(chest);
  },
});

const chestRewardController = createChestRewardController({
  gameState,
  input,
  cardOverlay,
  cardTitle,
  cardSubtitle,
  cardChoiceGrid,
  cardFooter,
  worldRandom: () => world.random(),
  syncPlayerBonuses,
  showRoundNotification,
  getPlatformCooldownDuration,
});

const cheatCodeController = createCheatCodeController({
  audio,
  gameState,
  input,
  syncPlayerBonuses,
  showRoundNotification,
});

const storeController = createStoreController({
  gameState,
  getInventoryCapacity,
  getRoundDuration,
  getEquippedTool,
  createInventoryForLoadout,
  syncPlayerBonuses,
  onStartNextRound: startNextRound,
});

const endOfRoundSystem = createEndOfRoundSystem({
  gameState,
  audio,
  storeController,
  getWorld: () => world,
  onStartSummaryMusic: () => {
    musicSystem.startSummary({ immediate: true });
  },
});

input.addKeyPressListener((event) => {
  if (event.code === "KeyR") {
    gameState.performance.visible = !gameState.performance.visible;
  }
});

let player = createPlayer();

let lastTime = performance.now();

async function bootstrap() {
  const [assets] = await Promise.all([
    Renderer.loadAssets(),
    audio.preload(AUDIO_MANIFEST),
  ]);
  renderer.setAssets(assets);
  attachAudioUnlock();
  endOfRoundSystem.attachControls(startNextRound);
  storeController.attachControls();
  chestRewardController.attachControls();
  cheatCodeController.attach();
  window.addEventListener("resize", () => renderer.resize());
  requestAnimationFrame(frame);
}

function attachAudioUnlock() {
  const unlock = async () => {
    await audio.unlock();
    gameState.audioReady = true;
    musicSystem.sync({ immediate: true });
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
  updateTickRateCounter(dt);

  if (gameState.phase === "reward") {
    chestRewardController.updateSelection();
    return;
  }

  if (gameState.phase === "summary") {
    endOfRoundSystem.update(dt);
    return;
  }

  gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
  gameState.platformCooldown = Math.max(0, gameState.platformCooldown - dt);
  updateRoundNotification(dt);
  checkRoundMilestones();
  playCountdownTickIfNeeded(dt);
  gameState.hoverTarget = player.update(dt, input, world);
  if (player.consumeJump()) {
    audio.playSound("jump", { playbackRate: 0.98 + Math.random() * 0.08 });
  }
  musicSystem.sync();
  gameState.miningResult = null;
  world.updateFallingDebris(dt);
  particleSystem.update(dt);
  pickupSystem.update(dt);
  floatingTextSystem.update(dt);
  platformPlacementSystem.update();

  if (player.touchesTileType(world, TILE_TYPES.MAGMA, 0)) {
    audio.playPlayerDeath();
    endOfRoundSystem.endRound();
    return;
  }

  if (input.isDown("mine")) {
    const miningResult = player.mine(dt, world);
    if (miningResult.active) {
      gameState.miningResult = miningResult;
      if (miningResult.hit) {
        floatingTextSystem.spawnCombatText(miningResult);
      }
      if (miningResult.hit && timeSeconds - gameState.lastMiningSoundAt > 0.16) {
        audio.playSound(getMiningHitSoundId(miningResult), { playbackRate: 0.96 + Math.random() * 0.1 });
        gameState.lastMiningSoundAt = timeSeconds;
      }

      if (miningResult.broken) {
        gameState.roundStats.blocksMined += 1;
        if (miningResult.chest) {
          pickupSystem.spawnTreasure(miningResult.chest, miningResult.column, miningResult.row);
          renderer.markTerrainDirty();
          audio.playSound("blockBreak", { playbackRate: 0.92, volume: 0.24 });
          showRoundNotification("Treasure dropped. Pick it up.");
        } else {
          if (miningResult.resource) {
            const quantity = miningResult.dropCount || 1;
            pickupSystem.spawnResources(miningResult, quantity);
            floatingTextSystem.spawnOreYieldText(miningResult);
            floatingTextSystem.spawnLuckBonusText(miningResult);
            particleSystem.spawnOreChunks(miningResult);
            audio.playSound("orePop", { playbackRate: 0.94 + Math.random() * 0.14, volume: 0.3 });
          }
          renderer.markTerrainDirty();
          audio.playSound("blockBreak", { playbackRate: 0.98 + Math.random() * 0.08 });
        }
      }
    }
  }

  if (player.consumeFootstep()) {
    audio.playSound("footsteps", { playbackRate: 0.95 + Math.random() * 0.12 });
  }

  if (gameState.timeLeft <= 0) {
    endOfRoundSystem.endRound();
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
    floatingTexts: gameState.floatingTexts,
    roundInfo: {
      round: gameState.round,
      timeLeft: Math.ceil(gameState.timeLeft),
      bank: gameState.bank,
      bonuses: gameState.playerBonuses,
      showPerformance: gameState.performance.visible,
      tickRate: gameState.performance.displayedTickRate,
      platformCooldown: gameState.platformCooldown / getPlatformCooldownDuration(),
      urgent: gameState.phase === "playing" && gameState.timeLeft <= 30,
      notification: gameState.notification,
    },
  });
}

function updateTickRateCounter(dt) {
  gameState.performance.tickSampleElapsed += dt;
  gameState.performance.tickSampleCount += 1;
  if (gameState.performance.tickSampleElapsed >= 0.25) {
    gameState.performance.displayedTickRate = Math.round(
      gameState.performance.tickSampleCount / gameState.performance.tickSampleElapsed,
    );
    gameState.performance.tickSampleElapsed = 0;
    gameState.performance.tickSampleCount = 0;
  }
}

function createRoundStats() {
  return {
    blocksMined: 0,
    collected: Object.fromEntries(Object.keys(ITEM_DEFINITIONS).map((itemId) => [itemId, 0])),
  };
}

function getInventoryCapacity() {
  const bagUpgrade = getToolDefinition(gameState.bagUpgradeId ?? DEFAULT_BAG_ROOT_ID);
  const capacityUpgrade = getToolDefinition(gameState.capacityUpgradeId ?? DEFAULT_CAPACITY_ROOT_ID);

  return {
    slotCount: bagUpgrade?.slotCount ?? DEFAULT_SLOT_COUNT,
    stackSize: capacityUpgrade?.stackSize ?? DEFAULT_STACK_SIZE,
  };
}

function getRoundDuration() {
  return getToolDefinition(gameState.timeUpgradeId ?? DEFAULT_TIME_ROOT_ID).durationSeconds ?? 60;
}

function createInventoryForLoadout(previousInventory = null) {
  const { slotCount, stackSize } = getInventoryCapacity();
  const inventory = new Inventory({ slotCount, stackSize });

  if (!previousInventory) {
    return inventory;
  }

  const totals = previousInventory.getTotals();
  for (const [itemId, count] of Object.entries(totals)) {
    if (count > 0) {
      inventory.addItem(itemId, count);
    }
  }

  return inventory;
}

function startNextRound() {
  gameState.round += 1;
  gameState.phase = "playing";
  gameState.timeLeft = getRoundDuration();
  gameState.inventory = createInventoryForLoadout();
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  gameState.particles = [];
  gameState.pickups = [];
  gameState.floatingTexts = [];
  gameState.roundStats = createRoundStats();
  gameState.summary = null;
  gameState.chestReward = null;
  gameState.notification = null;
  gameState.alertFlags = {
    halfway: false,
    thirtySeconds: false,
  };
  gameState.countdownTickCooldown = 0;
  gameState.lastMiningSoundAt = 0;
  world = new World({ seed: World.createRandomSeed() });
  player = createPlayer();
  renderer.setWorld(world);
  chestRewardController.hideOverlay();
  cheatCodeController.reset();
  storeController.reset();
  musicSystem.resetForNextRound({ immediate: true });
  endOfRoundSystem.reset();
}

function createPlayer() {
  const tool = getEquippedTool();
  const nextPlayer = new Player({
    ...world.getSpawnPosition(),
    miningPower: tool.miningPower,
    bonuses: gameState.playerBonuses,
  });
  nextPlayer.setRendererContext(renderer);
  return nextPlayer;
}

function syncPlayerBonuses() {
  player.setMiningPower(getEquippedTool().miningPower);
  player.setPermanentBonuses(gameState.playerBonuses);
}

function getEquippedTool() {
  return getToolDefinition(gameState.equippedToolId);
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
  const halfwayMark = getRoundDuration() / 2;

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

function playCountdownTickIfNeeded(dt) {
  if (!gameState.audioReady || gameState.phase !== "playing" || gameState.timeLeft > 30 || gameState.timeLeft <= 0) {
    gameState.countdownTickCooldown = 0;
    return;
  }

  gameState.countdownTickCooldown = Math.max(0, gameState.countdownTickCooldown - dt);
  if (gameState.countdownTickCooldown > 0) {
    return;
  }

  const secondsLeft = gameState.timeLeft;
  const interval = getCountdownTickInterval(secondsLeft);
  const urgentFactor = secondsLeft <= 10 ? 1.12 : 1;
  audio.playSound("tick", {
    volume: secondsLeft <= 10 ? 0.24 : 0.18,
    playbackRate: (1.02 + (30 - secondsLeft) * 0.006) * urgentFactor,
  });
  gameState.countdownTickCooldown = interval;
}

function getCountdownTickInterval(secondsLeft) {
  if (secondsLeft <= 5) {
    return 0.25;
  }

  if (secondsLeft <= 10) {
    return 0.38;
  }

  if (secondsLeft <= 20) {
    return 0.58;
  }

  return 0.85;
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