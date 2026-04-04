import { AudioManager } from "./audio.js";
import { createChestRewardController, createPlayerBonuses } from "./chestRewards.js";
import { createCheatCodeController } from "./cheatCodes.js";
import { createFloatingTextSystem } from "./floatingText.js";
import { Inventory, ITEM_DEFINITIONS } from "./inventory.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
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

const STRATUM_TRACK_NAMES = [...new Set(WORLD_STRATA.map((stratum) => stratum.bgmTrack).filter(Boolean))];
const SUMMARY_MUSIC_KEY = "__summary__";
const SUMMARY_TRACK_NAME = "Grand_Payout";
const MUSIC_TRACK_NAMES = [...STRATUM_TRACK_NAMES, SUMMARY_TRACK_NAME];

function createMusicManifestEntries(trackName) {
  return [
    { id: `music-${trackName}-intro`, src: `./assets/loops/${trackName}-intro.mp3` },
    { id: `music-${trackName}-loop`, src: `./assets/loops/${trackName}-loop.mp3` },
    { id: `music-${trackName}-outro`, src: `./assets/loops/${trackName}-outro.mp3` },
  ];
}

function createMusicSet(trackName) {
  return Object.freeze({
    intro: `music-${trackName}-intro`,
    loop: `music-${trackName}-loop`,
    outro: `music-${trackName}-outro`,
  });
}

const AUDIO_MANIFEST = [
  { id: "footsteps", src: "./assets/footstep.wav" },
  { id: "jump", src: "./assets/jump.wav" },
  { id: "miningHitDirt", src: "./assets/mining-hit-dirt.wav" },
  { id: "miningHitSoft", src: "./assets/mining-hit-soft.wav" },
  { id: "miningHit", src: "./assets/mining-hit.wav" },
  { id: "blockBreak", src: "./assets/block-break.wav" },
  { id: "cashRegister", src: "./assets/cash-register.wav" },
  { id: "cheatCode", src: "./assets/cheat-code.wav" },
  { id: "orePop", src: "./assets/ore-pop.wav" },
  { id: "coin", src: "./assets/coin.wav" },
  { id: "tick", src: "./assets/tick.wav" },
  { id: "treasureChest", src: "./assets/treasure-chest.wav" },
  ...MUSIC_TRACK_NAMES.flatMap(createMusicManifestEntries),
];

const STRATUM_BY_NAME = Object.freeze(
  Object.fromEntries(WORLD_STRATA.map((stratum) => [stratum.name, stratum])),
);

const STRATUM_MUSIC_SETS = Object.freeze(
  Object.fromEntries(MUSIC_TRACK_NAMES.map((trackName) => [trackName, createMusicSet(trackName)])),
);
const PARTICLE_GRAVITY = 820;
const PICKUP_GRAVITY = 980;
const PICKUP_BOB_SPEED = 6;
const PICKUP_RADIUS = 10;
const PICKUP_MAGNET_RANGE = 86;
const PICKUP_COLLECT_RANGE = 20;
const PLATFORM_PLACE_RANGE_TILES = 6;
const PLATFORM_COOLDOWN_SECONDS = 3;
const SUMMARY_MIN_STEP_RATE = 4;
const SUMMARY_MAX_STEP_RATE = 52;
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

  if ([TILE_TYPES.STONE, TILE_TYPES.SHALE].includes(tileType)) {
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
  attachRoundControls();
  storeController.attachControls();
  chestRewardController.attachControls();
  cheatCodeController.attach();
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
    gameState.audioReady = true;
    syncStratumMusic({ immediate: true });
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
    updateSummary(dt);
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
  syncStratumMusic();
  gameState.miningResult = null;
  world.updateFallingDebris(dt);
  updateParticles(dt);
  updatePickups(dt);
  floatingTextSystem.update(dt);
  updatePlatformPlacement();

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
          spawnTreasurePickup(miningResult.chest, miningResult.column, miningResult.row);
          renderer.markTerrainDirty();
          audio.playSound("blockBreak", { playbackRate: 0.92, volume: 0.24 });
          showRoundNotification("Treasure dropped. Pick it up.");
        } else {
          if (miningResult.resource) {
            const quantity = miningResult.dropCount || 1;
            spawnPickups(miningResult, quantity);
            floatingTextSystem.spawnOreYieldText(miningResult);
            floatingTextSystem.spawnLuckBonusText(miningResult);
            spawnOreChunks(miningResult);
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

function updatePlatformPlacement() {
  if (gameState.phase !== "playing" || gameState.platformCooldown > 0 || !input.wasPressed("placePlatform")) {
    return;
  }

  const target = getPlatformPlacementTarget();
  if (!target) {
    return;
  }

  if (!world.placePlatform(target.column, target.row)) {
    return;
  }

  gameState.platformCooldown = getPlatformCooldownDuration();
  audio.playSound("blockBreak", { playbackRate: 1.24, volume: 0.16 });
}

function getPlatformPlacementTarget() {
  const pointerWorld = input.getPointerWorld(renderer);
  if (!pointerWorld) {
    return null;
  }

  const column = Math.floor(pointerWorld.x / 32);
  const row = Math.floor(pointerWorld.y / 32);
  if (!world.canPlacePlatform(column, row)) {
    return null;
  }

  const playerCenter = player.getCenter();
  const targetCenterX = column * 32 + 16;
  const targetCenterY = row * 32 + 16;
  if (Math.hypot(targetCenterX - playerCenter.x, targetCenterY - playerCenter.y) > PLATFORM_PLACE_RANGE_TILES * 32) {
    return null;
  }

  if (!hasLineOfSightToCell(playerCenter, { x: targetCenterX, y: targetCenterY }, column, row)) {
    return null;
  }

  if (playerOccupiesCell(column, row)) {
    return null;
  }

  return { column, row };
}

function hasLineOfSightToCell(origin, target, targetColumn, targetRow) {
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
  const steps = Math.max(1, Math.ceil(distance / 8));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const sampleX = origin.x + (target.x - origin.x) * progress;
    const sampleY = origin.y + (target.y - origin.y) * progress;
    const column = Math.floor(sampleX / 32);
    const row = Math.floor(sampleY / 32);
    if (column === targetColumn && row === targetRow) {
      return true;
    }
    if (world.isSolid(column, row)) {
      return false;
    }
  }

  return true;
}

function playerOccupiesCell(column, row) {
  const left = column * 32;
  const top = row * 32;
  const right = left + 32;
  const bottom = top + 32;
  return !(player.x + player.width <= left || player.x >= right || player.y + player.height <= top || player.y >= bottom);
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
    .sort((left, right) => left.value - right.value);

  const totalItems = oreEntries.reduce((sum, entry) => sum + entry.count, 0);
  gameState.summary = {
    entries: oreEntries,
    activeIndex: 0,
    tickBudget: 0,
    processedItems: 0,
    totalCountSteps: totalItems,
    displayedEarnings: 0,
    totalEarnings: oreEntries.reduce((sum, entry) => sum + entry.count * entry.value, 0),
    startingBank: gameState.bank,
    blocksMined: gameState.roundStats.blocksMined,
    totalItems,
    completed: oreEntries.length === 0,
    bankAwarded: false,
  };
  gameState.notification = null;
  gameState.countdownTickCooldown = 0;
  if (gameState.audioReady) {
    if (gameState.music.currentStratumName !== SUMMARY_MUSIC_KEY) {
      startMusicTrack(SUMMARY_MUSIC_KEY, { immediate: true });
    }
  }

  if (gameState.summary.completed) {
    commitSummaryBankEarnings();
  }
  populateSummaryOverlay();
  storeController.populateOverlay();
  storeController.setOverlayView("summary");
  roundOverlay?.removeAttribute("hidden");
  roundOverlay?.setAttribute("data-visible", "true");
}

function populateSummaryOverlay() {
  if (!gameState.summary || !summaryGrid) {
  }

  updateSummaryActionState();
  summaryGrid.replaceChildren();
  roundTitle.textContent = `Shift ${gameState.round} Complete`;
  roundSubtitle.textContent = gameState.summary.entries.length
    ? "Counting your haul..."
    : "No ore banked this shift.";
  summaryBlocks.textContent = String(gameState.summary.blocksMined);
  summaryItems.textContent = String(gameState.summary.totalItems);
  summaryRound.textContent = String(gameState.round);
  summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
  summaryBank.textContent = `${gameState.summary.startingBank}€`;

  for (const entry of gameState.summary.entries) {
    const row = document.createElement("div");
    row.className = "summary-row";
    row.dataset.itemId = entry.itemId;
    row.innerHTML = `
      <div class="summary-ore">
        <canvas width="26" height="26"></canvas>
        <span>${ITEM_DEFINITIONS[entry.itemId].label}</span>
      </div>
      <div class="summary-breakdown">
        <span data-role="count">0</span>
        <span>x</span>
        <span data-role="unit">${entry.value}€</span>
        <span>=</span>
        <span data-role="value">0€</span>
      </div>
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

  gameState.summary.tickBudget += dt * getSummaryStepRate(gameState.summary);
  while (gameState.summary.tickBudget >= 1 && !gameState.summary.completed) {
    gameState.summary.tickBudget -= 1;
    advanceSummaryCount();
  }
}

function getSummaryStepRate(summary) {
  const totalSteps = Math.max(1, summary.totalCountSteps);
  const progress = Math.min(1, summary.processedItems / totalSteps);
  const easedRate = Math.sin(progress * Math.PI);
  return SUMMARY_MIN_STEP_RATE + (SUMMARY_MAX_STEP_RATE - SUMMARY_MIN_STEP_RATE) * easedRate;
}

function advanceSummaryCount() {
  const entry = gameState.summary.entries[gameState.summary.activeIndex];
  if (!entry) {
    gameState.summary.completed = true;
    commitSummaryBankEarnings();
    return;
  }

  entry.displayedCount += 1;
  entry.displayedValue += entry.value;
  gameState.summary.processedItems += 1;
  gameState.summary.displayedEarnings += entry.value;
  updateSummaryRow(entry);
  summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
  audio.playSound("coin", { playbackRate: 0.98 + Math.random() * 0.06, volume: 0.2 });

  if (entry.displayedCount >= entry.count) {
    gameState.summary.activeIndex += 1;
    if (gameState.summary.activeIndex >= gameState.summary.entries.length) {
      gameState.summary.completed = true;
      commitSummaryBankEarnings();
    }
  }
}

function commitSummaryBankEarnings() {
  if (!gameState.summary || gameState.summary.bankAwarded) {
    return;
  }

  gameState.bank += gameState.summary.totalEarnings;
  gameState.summary.bankAwarded = true;
  updateSummaryActionState();
  if (gameState.summary.totalEarnings > 0) {
    audio.playSound("cashRegister", { volume: 0.26 });
  }
  roundSubtitle.textContent = "Choose when to begin the next shift.";
  summaryBank.textContent = `${gameState.bank}€`;
  storeController.syncBankDisplay();
}

function updateSummaryRow(entry) {
  const row = summaryGrid?.querySelector(`[data-item-id="${entry.itemId}"]`);
  if (!row) {
    return;
  }
  row.querySelector('[data-role="count"]').textContent = String(entry.displayedCount);
  row.querySelector('[data-role="value"]').textContent = `${entry.displayedValue}€`;
}

function updateSummaryActionState() {
  const enabled = Boolean(gameState.summary?.completed);
  nextRoundButton?.toggleAttribute("disabled", !enabled);
  storeController.updateSummaryActionState(enabled);
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
  gameState.music.currentStratumName = null;
  gameState.music.pendingStratumName = null;
  gameState.music.transitionToken += 1;
  gameState.lastMiningSoundAt = 0;
  world = new World({ seed: World.createRandomSeed() });
  player = createPlayer();
  renderer.setWorld(world);
  chestRewardController.hideOverlay();
  cheatCodeController.reset();
  storeController.reset();
  if (gameState.audioReady) {
    audio.stopMusic();
    syncStratumMusic({ immediate: true });
  }
  roundOverlay?.setAttribute("data-visible", "false");
  roundOverlay?.setAttribute("hidden", "true");
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

function syncStratumMusic({ immediate = false } = {}) {
  if (!gameState.audioReady || !isMusicActivePhase()) {
    return;
  }

  const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
  if (!gameState.music.currentStratumName) {
    startMusicTrack(stratumName, { immediate });
    return;
  }

  if (stratumName === gameState.music.currentStratumName || stratumName === gameState.music.pendingStratumName) {
    return;
  }

  transitionMusicTrack(stratumName);
}

function getMusicTrackName(musicKey) {
  if (musicKey === SUMMARY_MUSIC_KEY) {
    return SUMMARY_TRACK_NAME;
  }

  return STRATUM_BY_NAME[musicKey]?.bgmTrack ?? STRATUM_TRACK_NAMES[0];
}

function getMusicSetForKey(musicKey) {
  const trackName = getMusicTrackName(musicKey);
  return STRATUM_MUSIC_SETS[trackName] ?? STRATUM_MUSIC_SETS[SUMMARY_TRACK_NAME];
}

function startMusicTrack(musicKey, { immediate = false } = {}) {
  const token = ++gameState.music.transitionToken;
  gameState.music.currentStratumName = musicKey;
  gameState.music.pendingStratumName = null;
  const musicSet = getMusicSetForKey(musicKey);

  const startLoop = () => {
    if (token !== gameState.music.transitionToken || !isMusicActivePhase()) {
      return;
    }
    audio.playMusicSegment(musicSet.loop, { loop: true });
  };

  if (immediate) {
    audio.playMusicSegment(musicSet.intro, { onended: startLoop });
    return;
  }

  audio.playMusicSegment(musicSet.intro, { onended: startLoop });
}

function transitionMusicTrack(nextMusicKey) {
  const currentStratumName = gameState.music.currentStratumName;
  if (!currentStratumName) {
    startMusicTrack(nextMusicKey);
    return;
  }

  const token = ++gameState.music.transitionToken;
  gameState.music.pendingStratumName = nextMusicKey;
  const currentMusicSet = getMusicSetForKey(currentStratumName);

  audio.playMusicSegment(currentMusicSet.outro, {
    onended: () => {
      if (token !== gameState.music.transitionToken || !isMusicActivePhase()) {
        return;
      }
      startMusicTrack(nextMusicKey);
    },
  });
}

function stopStratumMusic({ playOutro = false } = {}) {
  gameState.music.pendingStratumName = null;
  const currentStratumName = gameState.music.currentStratumName;
  if (!playOutro || !gameState.audioReady || !currentStratumName) {
    gameState.music.currentStratumName = null;
    gameState.music.transitionToken += 1;
    audio.stopMusic();
    return;
  }

  const token = ++gameState.music.transitionToken;
  const musicSet = getMusicSetForKey(currentStratumName);
  audio.playMusicSegment(musicSet.outro, {
    onended: () => {
      if (token !== gameState.music.transitionToken) {
        return;
      }
      gameState.music.currentStratumName = null;
      gameState.music.pendingStratumName = null;
    },
  });
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

function spawnTreasurePickup(chest, column, row) {
  const originX = column * 32 + 16;
  const originY = row * 32 + 18;
  const direction = player.getCenter().x <= originX ? 1 : -1;

  gameState.pickups.push({
    kind: "treasure",
    chest,
    x: originX,
    y: originY,
    vx: direction * (84 + Math.random() * 40),
    vy: -(150 + Math.random() * 70),
    grounded: false,
    rotation: Math.random() * Math.PI * 2,
    angularVelocity: (Math.random() - 0.5) * 4,
    bobTime: Math.random() * Math.PI * 2,
    radius: PICKUP_RADIUS + 4,
    color: "#f4c65c",
    glow: "rgba(244, 198, 92, 0.45)",
    accent: "#fff2c4",
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
    const isTreasure = nextPickup.kind === "treasure";
    const canCollect = isTreasure || gameState.inventory.hasSpaceFor(nextPickup.itemId, 1);

    if (canCollect && distance < PICKUP_MAGNET_RANGE) {
      const attraction = isTreasure
        ? Math.max(140, 340 - distance * 1.4)
        : Math.max(90, 280 - distance * 1.7);
      nextPickup.vx += (dx / Math.max(distance, 1)) * attraction * dt;
      nextPickup.vy += (dy / Math.max(distance, 1)) * attraction * dt;
    }

    nextPickup.vy += PICKUP_GRAVITY * dt;
    nextPickup.x += nextPickup.vx * dt;
    nextPickup.y += nextPickup.vy * dt;
    nextPickup.rotation += nextPickup.angularVelocity * dt;
    nextPickup.grounded = false;

    resolvePickupCollisions(nextPickup);

    if (canCollect && distance < (isTreasure ? PICKUP_COLLECT_RANGE + 8 : PICKUP_COLLECT_RANGE)) {
      if (isTreasure) {
        audio.playSound("treasureChest", { volume: 0.24 });
        chestRewardController.openChestReward(nextPickup.chest);
        continue;
      }

      const result = gameState.inventory.addItem(nextPickup.itemId, 1);
      if (result.added > 0) {
        gameState.roundStats.collected[nextPickup.itemId] += 1;
        const playerCenter = player.getCenter();
        floatingTextSystem.spawnPickupText({
          itemId: nextPickup.itemId,
          originX: playerCenter.x,
          originY: player.y - 12,
        });
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