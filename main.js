import { AudioManager } from "./audio.js";
import { createBombSystem } from "./bombSystem.js";
import { createChestRewardController, createPlayerBonuses } from "./chestRewards.js";
import { createCheatCodeController } from "./cheatCodes.js";
import { createEndOfRoundSystem } from "./endOfRoundSystem.js";
import { createFloatingTextSystem } from "./floatingText.js";
import { createGameoverScreenController } from "./gameoverScreen.js";
import { Inventory, ITEM_DEFINITIONS } from "./inventory.js";
import { createIntroScreenController } from "./introScreen.js";
import { Input } from "./input.js";
import { createMusicManifest, createMusicSystem } from "./musicSystem.js";
import { createPauseScreenController } from "./pauseScreen.js";
import { createParticleSystem } from "./particleSystem.js";
import { Player } from "./player.js";
import { createPlatformPlacementSystem } from "./platformPlacement.js";
import { createPickupSystem } from "./pickups.js";
import { Renderer } from "./renderer.js";
import { createStoreController } from "./storeSystem.js";
import { TILE_TYPES } from "./tile.js";
import {
  BOMB_CAPACITY_ROOT_ID,
  BOMB_TYPE_ROOT_ID,
  BOMB_UNLOCK_ROOT_ID,
  DEFAULT_BAG_ROOT_ID,
  DEFAULT_CAPACITY_ROOT_ID,
  DEFAULT_GAME_MODE,
  DEFAULT_PLATFORM_ROOT_ID,
  DEFAULT_SLOT_COUNT,
  DEFAULT_STACK_SIZE,
  DEFAULT_TIME_ROOT_ID,
  DEFAULT_TOOL_ID,
  getToolDefinition,
} from "./tools.js";
import { World, WORLD_STRATA } from "./world.js";

const INTRO_TITLE_IMAGE_SRC = "./assets/title.png";
const PAUSE_TITLE_IMAGE_SRC = "./assets/pause.png";
const BAD_END_IMAGE_SRC = "./assets/gameover.png";
const GOOD_END_IMAGE_SRC = "./assets/victory.png";
const MIN_SCREEN_FADE_MS = 1000;
const MAX_INTRO_OVERLAY_FADE_MS = 3000;
const MAX_PAUSE_OVERLAY_FADE_MS = 1000;
const GOOD_END_SHIFT = 10;
const SHIFT_COUNTDOWN_STEPS = Object.freeze([
  { label: "3", durationMs: 1000, playbackRate: 0.96, volume: 0.2 },
  { label: "2", durationMs: 1000, playbackRate: 1.01, volume: 0.2 },
  { label: "1", durationMs: 1000, playbackRate: 1.06, volume: 0.22 },
  { label: "GO!", durationMs: 700, playbackRate: 1.18, volume: 0.26 },
]);

function getShiftCountdownTotalDurationMs() {
  return SHIFT_COUNTDOWN_STEPS.reduce((total, step) => total + step.durationMs, 0);
}

function clampScreenFadeDuration(durationMs, maxDurationMs) {
  return Math.min(maxDurationMs, Math.max(MIN_SCREEN_FADE_MS, Math.round(durationMs)));
}

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
  { id: "halfwaySiren", src: "./assets/sfx/halfway-siren.wav" },
  { id: "introStart", src: "./assets/sfx/intro-start.wav" },
  { id: "shiftCountdown", src: "./assets/sfx/shift-countdown.wav" },
  { id: "tick", src: "./assets/sfx/tick.wav" },
  { id: "treasureChest", src: "./assets/sfx/treasure-chest.wav" },
  { id: "bombFuse", src: "./assets/sfx/bomb-fuse.wav" },
  { id: "bombExplode", src: "./assets/sfx/bomb-explode.wav" },
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
const shiftCountdownOverlay = document.getElementById("shift-countdown-overlay");
const shiftCountdownValue = document.getElementById("shift-countdown-value");
const endShiftButton = document.getElementById("end-shift-button");

function isMusicActivePhase(phase = gameState.phase) {
  return phase === "countdown" || phase === "playing" || phase === "reward" || phase === "summary";
}

function getPlatformCooldownDuration() {
  return PLATFORM_COOLDOWN_SECONDS / (1 + (gameState.playerBonuses.platformCooldown ?? 0));
}

function getPlatformCapacity() {
  return getToolDefinition(gameState.platformUpgradeId ?? DEFAULT_PLATFORM_ROOT_ID)?.platformCapacity ?? 1;
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
  platformUpgradeId: DEFAULT_PLATFORM_ROOT_ID,
  bombUnlockId: null,
  bombCapacityUpgradeId: null,
  bombTypeUpgradeId: null,
  inventory: new Inventory({ slotCount: DEFAULT_SLOT_COUNT, stackSize: DEFAULT_STACK_SIZE }),
  miningResult: null,
  hoverTarget: null,
  audioReady: false,
  lastMiningSoundAt: 0,
  particles: [],
  bombs: [],
  pickups: [],
  floatingTexts: [],
  platformCooldown: 0,
  platformCharges: getToolDefinition(DEFAULT_PLATFORM_ROOT_ID).platformCapacity ?? 1,
  bombCooldown: 0,
  bombCharges: 0,
  phase: "intro",
  round: 1,
  timeLeft: getToolDefinition(DEFAULT_TIME_ROOT_ID).durationSeconds ?? 60,
  bank: 0,
  roundStats: createRoundStats(),
  summary: null,
  chestReward: null,
  notification: null,
  introExiting: false,
  pauseExiting: false,
  gameOver: null,
  playerBonuses: createPlayerBonuses(),
  alertFlags: {
    halfway: false,
    thirtySeconds: false,
  },
  countdownTickCooldown: 0,
  music: {
    currentStratumName: null,
    currentTrackName: null,
    pendingStratumName: null,
    transitionToken: 0,
  },
  performance: {
    visible: false,
    tickSampleElapsed: 0,
    tickSampleCount: 0,
    displayedTickRate: 0,
  },
  shiftCountdown: {
    active: false,
    stepIndex: -1,
    remainingMs: 0,
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

const introScreenController = createIntroScreenController({
  titleImageSrc: INTRO_TITLE_IMAGE_SRC,
  onStartAttempt: () => {
    if (gameState.phase !== "intro" || gameState.introExiting) {
      return;
    }

    startGameFromIntro();
  },
});

const pauseScreenController = createPauseScreenController({
  titleImageSrc: PAUSE_TITLE_IMAGE_SRC,
  onResumeAttempt: () => {
    if (gameState.phase !== "paused" || gameState.pauseExiting) {
      return;
    }

    resumeShiftFromPause();
  },
});

const gameoverScreenController = createGameoverScreenController({
  goodEndImageSrc: GOOD_END_IMAGE_SRC,
  badEndImageSrc: BAD_END_IMAGE_SRC,
  onContinueAttempt: () => {
    resetGameToIntro();
  },
});

const platformPlacementSystem = createPlatformPlacementSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer: () => player,
  getWorld: () => world,
  getPlatformCapacity,
  getPlatformCooldownDuration,
});

const bombSystem = createBombSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer: () => player,
  getWorld: () => world,
  floatingTextSystem,
  particleSystem,
  onBrokenTileResult: handleBrokenTileResult,
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
  getBombCooldownDuration: () => bombSystem.getCooldownDuration(),
});

const cheatCodeController = createCheatCodeController({
  audio,
  gameState,
  input,
  createInventoryForLoadout,
  syncPlayerBonuses,
  showRoundNotification,
  triggerGameOver,
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
  worldRenderer: renderer.worldRenderer,
  onStartSummaryMusic: () => {
    return musicSystem.startSummary({ immediate: true });
  },
});

endShiftButton?.addEventListener("click", () => {
  if (gameState.phase !== "playing") {
    return;
  }

  endOfRoundSystem.endRound();
});

input.addKeyPressListener((event) => {
  if (event.code === "KeyR") {
    gameState.performance.visible = !gameState.performance.visible;
    return;
  }

  if (["KeyP", "Pause", "Escape"].includes(event.code) && gameState.phase === "playing") {
    pauseCurrentShift();
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
  await introScreenController.init();
  await pauseScreenController.init();
  await gameoverScreenController.init();
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
    if (gameState.phase === "intro") {
      musicSystem.startIntro({ immediate: true });
    } else {
      musicSystem.sync({ immediate: true });
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function startGameFromIntro() {
  if (gameState.phase !== "intro" || gameState.introExiting) {
    return;
  }

  audio.playSound("introStart", { volume: 0.24 });
  const fadeDurationMs = gameState.audioReady ? musicSystem.transitionFromIntroToGameplay() : 0;
  const introScreenFadeDurationMs = clampScreenFadeDuration(
    fadeDurationMs - getShiftCountdownTotalDurationMs(),
    MAX_INTRO_OVERLAY_FADE_MS,
  );
  gameState.introExiting = true;
  introScreenController.startExit({
    durationMs: introScreenFadeDurationMs,
    onComplete: () => {
      gameState.introExiting = false;
      beginShiftCountdown();
    },
  });
}

function pauseCurrentShift() {
  if (gameState.phase !== "playing") {
    return;
  }

  gameState.pauseExiting = false;
  gameState.phase = "paused";
  pauseScreenController.show();
  if (gameState.audioReady) {
    musicSystem.startPause();
  }
}

function shouldTriggerGoodEnding() {
  return gameState.phase === "summary"
    && Boolean(gameState.summary?.completed)
    && gameState.round >= GOOD_END_SHIFT;
}

function triggerGameOver({ endingType }) {
  if (gameState.phase === "gameover") {
    return;
  }

  gameState.phase = "gameover";
  gameState.introExiting = false;
  gameState.pauseExiting = false;
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  gameState.notification = null;
  gameState.countdownTickCooldown = 0;
  gameState.gameOver = {
    endingType,
  };
  setShiftCountdownVisibility(false);
  chestRewardController.hideOverlay();
  pauseScreenController.hide();
  endOfRoundSystem.reset();
  storeController.reset();
  musicSystem.startGameover({ endingType });
  gameoverScreenController.showEnding({
    endingType,
    titleText: endingType === "good" ? "Good End" : "Game Over",
    copyText: endingType === "good"
      ? `You completed ${GOOD_END_SHIFT} shifts and brought Pocket Miner to a close.`
      : "The mine won this time.",
  });
}

function resetGameToIntro() {
  gameState.gameMode = DEFAULT_GAME_MODE;
  gameState.equippedToolId = DEFAULT_TOOL_ID;
  gameState.bagUpgradeId = DEFAULT_BAG_ROOT_ID;
  gameState.capacityUpgradeId = DEFAULT_CAPACITY_ROOT_ID;
  gameState.timeUpgradeId = DEFAULT_TIME_ROOT_ID;
  gameState.platformUpgradeId = DEFAULT_PLATFORM_ROOT_ID;
  gameState.bombUnlockId = null;
  gameState.bombCapacityUpgradeId = null;
  gameState.bombTypeUpgradeId = null;
  gameState.inventory = new Inventory({ slotCount: DEFAULT_SLOT_COUNT, stackSize: DEFAULT_STACK_SIZE });
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  gameState.lastMiningSoundAt = 0;
  gameState.particles = [];
  gameState.bombs = [];
  gameState.pickups = [];
  gameState.floatingTexts = [];
  gameState.platformCooldown = 0;
  gameState.platformCharges = getPlatformCapacity();
  gameState.bombCooldown = 0;
  gameState.bombCharges = 0;
  gameState.phase = "intro";
  gameState.round = 1;
  gameState.timeLeft = getToolDefinition(DEFAULT_TIME_ROOT_ID).durationSeconds ?? 60;
  gameState.bank = 0;
  gameState.roundStats = createRoundStats();
  gameState.summary = null;
  gameState.chestReward = null;
  gameState.notification = null;
  gameState.introExiting = false;
  gameState.pauseExiting = false;
  gameState.gameOver = null;
  gameState.playerBonuses = createPlayerBonuses();
  gameState.alertFlags = {
    halfway: false,
    thirtySeconds: false,
  };
  gameState.countdownTickCooldown = 0;
  gameState.shiftCountdown = {
    active: false,
    stepIndex: -1,
    remainingMs: 0,
  };

  world = new World({ seed: World.createRandomSeed() });
  player = createPlayer();
  renderer.setWorld(world);
  setShiftCountdownVisibility(false);
  chestRewardController.hideOverlay();
  cheatCodeController.reset();
  pauseScreenController.hide();
  gameoverScreenController.hide();
  storeController.reset();
  endOfRoundSystem.reset();
  musicSystem.resetForIntro({ immediate: true });
  introScreenController.show();
}

function resumeShiftFromPause() {
  if (gameState.phase !== "paused" || gameState.pauseExiting) {
    return;
  }

  if (gameState.audioReady) {
    audio.playSound("introStart", { volume: 0.24 });
  }

  gameState.pauseExiting = true;
  const fadeDurationMs = gameState.audioReady ? musicSystem.transitionFromPauseToGameplay() : 0;
  const pauseScreenFadeDurationMs = clampScreenFadeDuration(
    fadeDurationMs - getShiftCountdownTotalDurationMs(),
    MAX_PAUSE_OVERLAY_FADE_MS,
  );
  pauseScreenController.startExit({
    durationMs: pauseScreenFadeDurationMs,
    onComplete: () => {
      beginShiftCountdown();
    },
  });
}

function setShiftCountdownVisibility(visible) {
  if (!shiftCountdownOverlay) {
    return;
  }

  if (visible) {
    shiftCountdownOverlay.removeAttribute("hidden");
    shiftCountdownOverlay.setAttribute("data-visible", "true");
    return;
  }

  shiftCountdownOverlay.setAttribute("data-visible", "false");
  shiftCountdownOverlay.setAttribute("hidden", "true");
}

function advanceShiftCountdownStep() {
  gameState.shiftCountdown.stepIndex += 1;
  const step = SHIFT_COUNTDOWN_STEPS[gameState.shiftCountdown.stepIndex];
  if (!step) {
    gameState.shiftCountdown.active = false;
    gameState.shiftCountdown.stepIndex = -1;
    gameState.shiftCountdown.remainingMs = 0;
    setShiftCountdownVisibility(false);
    gameState.pauseExiting = false;
    gameState.phase = "playing";
    return;
  }

  gameState.shiftCountdown.remainingMs = step.durationMs;
  if (shiftCountdownValue) {
    shiftCountdownValue.textContent = step.label;
  }
  setShiftCountdownVisibility(true);
  if (gameState.audioReady) {
    audio.playSound("shiftCountdown", {
      volume: step.volume,
      playbackRate: step.playbackRate,
    });
  }
}

function beginShiftCountdown() {
  gameState.phase = "countdown";
  gameState.shiftCountdown.active = true;
  gameState.shiftCountdown.stepIndex = -1;
  gameState.shiftCountdown.remainingMs = 0;
  advanceShiftCountdownStep();
}

function syncHudActionButtons() {
  if (!endShiftButton) {
    return;
  }

  const canEndShift = gameState.phase === "playing";
  endShiftButton.toggleAttribute("hidden", !canEndShift);
  endShiftButton.toggleAttribute("disabled", !canEndShift);
}

function updateShiftCountdown(dt) {
  if (!gameState.shiftCountdown.active) {
    return;
  }

  gameState.shiftCountdown.remainingMs -= dt * 1000;
  while (gameState.shiftCountdown.active && gameState.shiftCountdown.remainingMs <= 0) {
    advanceShiftCountdownStep();
  }
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

  if (gameState.phase === "intro") {
    return;
  }

  if (gameState.phase === "countdown") {
    updateShiftCountdown(dt);
    return;
  }

  if (gameState.phase === "paused") {
    return;
  }

  if (gameState.phase === "reward") {
    chestRewardController.updateSelection();
    return;
  }

  if (gameState.phase === "summary") {
    endOfRoundSystem.update(dt);
    if (shouldTriggerGoodEnding()) {
      triggerGameOver({ endingType: "good" });
    }
    return;
  }

  if (gameState.phase === "gameover") {
    return;
  }

  gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
  gameState.platformCooldown = Math.max(0, gameState.platformCooldown - dt);
  refillPlatformChargesIfReady();
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
  bombSystem.update(dt);

  if (player.touchesTileType(world, TILE_TYPES.MAGMA, 0)) {
    audio.playPlayerDeath();
    triggerGameOver({ endingType: "bad" });
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
        handleBrokenTileResult(miningResult, { playOreSound: true, playBreakSound: true });
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
  syncHudActionButtons();
  renderer.render({
    player,
    world,
    inventory: gameState.inventory,
    miningResult: gameState.miningResult,
    hoverTarget: gameState.hoverTarget,
    particles: gameState.particles,
    bombs: gameState.bombs,
    pickups: gameState.pickups,
    floatingTexts: gameState.floatingTexts,
    roundInfo: {
      round: gameState.round,
      timeLeft: Math.ceil(gameState.timeLeft),
      bank: gameState.bank,
      bonuses: gameState.playerBonuses,
      showPerformance: gameState.performance.visible,
      tickRate: gameState.performance.displayedTickRate,
      platformCooldown: gameState.platformCharges < getPlatformCapacity()
        ? gameState.platformCooldown / getPlatformCooldownDuration()
        : 0,
      platformCharges: gameState.platformCharges,
      platformCapacity: getPlatformCapacity(),
      bombCooldown: gameState.bombCharges < bombSystem.getCapacity()
        ? gameState.bombCooldown / bombSystem.getCooldownDuration()
        : 0,
      bombCharges: gameState.bombCharges,
      bombCapacity: bombSystem.getCapacity(),
      bombSpriteRow: getToolDefinition(gameState.bombTypeUpgradeId ?? BOMB_TYPE_ROOT_ID)?.bombSpriteRow ?? 0,
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

function refillPlatformChargesIfReady() {
  const capacity = getPlatformCapacity();
  if (capacity <= 0) {
    gameState.platformCharges = 0;
    gameState.platformCooldown = 0;
    return;
  }

  if (gameState.platformCharges > capacity) {
    gameState.platformCharges = capacity;
  }

  if (gameState.platformCharges >= capacity) {
    gameState.platformCooldown = 0;
    return;
  }

  if (gameState.platformCooldown <= 0) {
    gameState.platformCharges += 1;
    gameState.platformCooldown = gameState.platformCharges < capacity ? getPlatformCooldownDuration() : 0;
  }
}

function startNextRound() {
  gameState.round += 1;
  gameState.phase = "countdown";
  gameState.timeLeft = getRoundDuration();
  gameState.inventory = createInventoryForLoadout();
  gameState.miningResult = null;
  gameState.hoverTarget = null;
  gameState.particles = [];
  gameState.bombs = [];
  gameState.pickups = [];
  gameState.floatingTexts = [];
  gameState.platformCooldown = 0;
  gameState.platformCharges = getPlatformCapacity();
  gameState.bombCooldown = 0;
  gameState.bombCharges = bombSystem.getCapacity();
  gameState.roundStats = createRoundStats();
  gameState.summary = null;
  gameState.chestReward = null;
  gameState.notification = null;
  gameState.pauseExiting = false;
  gameState.gameOver = null;
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
  pauseScreenController.hide();
  gameoverScreenController.hide();
  storeController.reset();
  musicSystem.resetForNextRound({ immediate: true });
  endOfRoundSystem.reset();
  beginShiftCountdown();
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

function handleBrokenTileResult(miningResult, { playOreSound = false, playBreakSound = false } = {}) {
  gameState.roundStats.blocksMined += 1;
  if (miningResult.chest) {
    pickupSystem.spawnTreasure(miningResult.chest, miningResult.column, miningResult.row);
    renderer.markTerrainDirty();
    if (playBreakSound) {
      audio.playSound("blockBreak", { playbackRate: 0.92, volume: 0.24 });
    }
    showRoundNotification("Treasure dropped. Pick it up.");
    return;
  }

  if (miningResult.resource) {
    const quantity = miningResult.dropCount || 1;
    pickupSystem.spawnResources(miningResult, quantity);
    floatingTextSystem.spawnOreYieldText(miningResult);
    floatingTextSystem.spawnLuckBonusText(miningResult);
    particleSystem.spawnOreChunks(miningResult);
    if (playOreSound) {
      audio.playSound("orePop", { playbackRate: 0.94 + Math.random() * 0.14, volume: 0.3 });
    }
  }

  renderer.markTerrainDirty();
  if (playBreakSound) {
    audio.playSound("blockBreak", { playbackRate: 0.98 + Math.random() * 0.08 });
  }
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
    audio.playSound("halfwaySiren", { volume: 0.24 });
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