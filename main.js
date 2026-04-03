import { AudioManager } from "./audio.js";
import { Inventory, ITEM_DEFINITIONS } from "./inventory.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { Renderer } from "./renderer.js";
import { DEFAULT_GAME_MODE, DEFAULT_TOOL_ID, GAME_MODE_DEFINITIONS, getToolBranchTools, getToolDefinition, getToolsForGameMode } from "./tools.js";
import { World } from "./world.js";

const AUDIO_MANIFEST = [
  { id: "footsteps", src: "./assets/footstep.wav" },
  { id: "miningHit", src: "./assets/mining-hit.wav" },
  { id: "blockBreak", src: "./assets/block-break.wav" },
  { id: "orePop", src: "./assets/ore-pop.wav" },
  { id: "coin", src: "./assets/coin.wav" },
  { id: "tick", src: "./assets/tick.wav" },
  { id: "music-hearth-intro", src: "./assets/loops/Underground_Hearth-intro.mp3" },
  { id: "music-hearth-loop", src: "./assets/loops/Underground_Hearth-loop.mp3" },
  { id: "music-hearth-outro", src: "./assets/loops/Underground_Hearth-outro.mp3" },
  { id: "music-waltz-intro", src: "./assets/loops/Pickaxe_Waltz-intro.mp3" },
  { id: "music-waltz-loop", src: "./assets/loops/Pickaxe_Waltz-loop.mp3" },
  { id: "music-waltz-outro", src: "./assets/loops/Pickaxe_Waltz-outro.mp3" },
];

const STRATUM_MUSIC_SETS = Object.freeze({
  waltz: Object.freeze({
    intro: "music-waltz-intro",
    loop: "music-waltz-loop",
    outro: "music-waltz-outro",
  }),
  hearth: Object.freeze({
    intro: "music-hearth-intro",
    loop: "music-hearth-loop",
    outro: "music-hearth-outro",
  }),
});

const STRATUM_SONG_BY_NAME = Object.freeze({
  "Topsoil Vein": "waltz",
  "Shale Shelf": "hearth",
  "Basalt Forge": "waltz",
  "Abyssal Crown": "hearth",
});
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
const openStoreButton = document.getElementById("open-store-button");
const summaryView = document.getElementById("summary-view");
const storeView = document.getElementById("store-view");
const backToSummaryButton = document.getElementById("back-to-summary-button");
const storeNextRoundButton = document.getElementById("store-next-round-button");
const storeGrid = document.getElementById("store-grid");
const storeBank = document.getElementById("store-bank");
const storeMode = document.getElementById("store-mode");
const storeCurrentTool = document.getElementById("store-current-tool");
const storeTooltip = document.getElementById("store-tooltip");
const storeTooltipTitle = document.getElementById("store-tooltip-title");
const storeTooltipState = document.getElementById("store-tooltip-state");
const storeTooltipCopy = document.getElementById("store-tooltip-copy");
const storeTooltipStats = document.getElementById("store-tooltip-stats");

const input = new Input({ keyboardTarget: window, pointerTarget: canvas });
let world = new World();
const renderer = new Renderer(canvas, world);
const audio = new AudioManager();

const gameState = {
  gameMode: DEFAULT_GAME_MODE,
  equippedToolId: DEFAULT_TOOL_ID,
  inventory: new Inventory({ slotCount: 9, stackSize: STACK_SIZE }),
  miningResult: null,
  hoverTarget: null,
  audioReady: false,
  lastMiningSoundAt: 0,
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
  countdownTickCooldown: 0,
  music: {
    currentStratumName: null,
    pendingStratumName: null,
    transitionToken: 0,
  },
  overlayView: "summary",
  storeDrag: {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  },
};

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

  storeNextRoundButton?.addEventListener("click", () => {
    if (gameState.phase !== "summary") {
      return;
    }
    startNextRound();
  });

  openStoreButton?.addEventListener("click", () => {
    if (gameState.phase !== "summary") {
      return;
    }
    setOverlayView("store");
  });

  backToSummaryButton?.addEventListener("click", () => {
    if (gameState.phase !== "summary") {
      return;
    }
    setOverlayView("summary");
  });

  storeGrid?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("button[data-tool-id]") : null;
    if (!button || gameState.phase !== "summary") {
      return;
    }

    const { toolId } = button.dataset;
    if (!toolId) {
      return;
    }

    purchaseTool(toolId);
  });

  storeGrid?.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.closest("button[data-tool-id]")) {
      return;
    }

    gameState.storeDrag.active = true;
    gameState.storeDrag.pointerId = event.pointerId;
    gameState.storeDrag.startX = event.clientX;
    gameState.storeDrag.startY = event.clientY;
    gameState.storeDrag.startScrollLeft = storeGrid.scrollLeft;
    gameState.storeDrag.startScrollTop = storeGrid.scrollTop;
    storeGrid.dataset.dragging = "true";
    storeGrid.setPointerCapture?.(event.pointerId);
    hideStoreTooltip();
  });

  storeGrid?.addEventListener("pointermove", (event) => {
    if (gameState.storeDrag.active && gameState.storeDrag.pointerId === event.pointerId) {
      storeGrid.scrollLeft = gameState.storeDrag.startScrollLeft - (event.clientX - gameState.storeDrag.startX);
      storeGrid.scrollTop = gameState.storeDrag.startScrollTop - (event.clientY - gameState.storeDrag.startY);
      return;
    }

    if (storeTooltip?.dataset.visible !== "true") {
      return;
    }
    positionStoreTooltip(event);
  });

  const endStoreDrag = (event) => {
    if (!gameState.storeDrag.active || gameState.storeDrag.pointerId !== event.pointerId) {
      return;
    }

    gameState.storeDrag.active = false;
    gameState.storeDrag.pointerId = null;
    storeGrid.dataset.dragging = "false";
    storeGrid.releasePointerCapture?.(event.pointerId);
  };

  storeGrid?.addEventListener("pointerup", endStoreDrag);
  storeGrid?.addEventListener("pointercancel", endStoreDrag);

  storeGrid?.addEventListener("pointerover", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("button[data-tool-id]") : null;
    if (!button) {
      return;
    }

    showStoreTooltip(button.dataset.toolId, button.dataset.state, event);
  });

  storeGrid?.addEventListener("pointermove", (event) => {
    if (storeTooltip?.dataset.visible !== "true") {
      return;
    }
    positionStoreTooltip(event);
  });

  storeGrid?.addEventListener("pointerout", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("button[data-tool-id]") : null;
    if (!button) {
      return;
    }

    const nextTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget.closest("button[data-tool-id]") : null;
    if (nextTarget === button) {
      return;
    }

    hideStoreTooltip();
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
  if (gameState.phase === "summary") {
    updateSummary(dt);
    return;
  }

  gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
  updateRoundNotification(dt);
  checkRoundMilestones();
  playCountdownTickIfNeeded(dt);
  gameState.hoverTarget = player.update(dt, input, world);
  syncStratumMusic();
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
  gameState.countdownTickCooldown = 0;
  stopStratumMusic({ playOutro: true });
  gameState.overlayView = "summary";

  gameState.bank += gameState.summary.totalEarnings;
  populateSummaryOverlay();
  populateStoreOverlay();
  setOverlayView("summary");
  roundOverlay?.removeAttribute("hidden");
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
  row.querySelector('[data-role="count"]').textContent = String(entry.displayedCount);
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
  gameState.countdownTickCooldown = 0;
  gameState.music.currentStratumName = null;
  gameState.music.pendingStratumName = null;
  gameState.music.transitionToken += 1;
  gameState.overlayView = "summary";
  gameState.lastMiningSoundAt = 0;
  world = new World();
  player = createPlayer();
  renderer.setWorld(world);
  if (gameState.audioReady) {
    audio.stopMusic();
    syncStratumMusic({ immediate: true });
  }
  setOverlayView("summary");
  roundOverlay?.setAttribute("data-visible", "false");
  roundOverlay?.setAttribute("hidden", "true");
}

function createPlayer() {
  const tool = getEquippedTool();
  const nextPlayer = new Player({
    ...world.getSpawnPosition(),
    miningPower: tool.miningPower,
  });
  nextPlayer.setRendererContext(renderer);
  return nextPlayer;
}

function getEquippedTool() {
  return getToolDefinition(gameState.equippedToolId);
}

function setOverlayView(view) {
  gameState.overlayView = view;
  summaryView?.toggleAttribute("hidden", view !== "summary");
  storeView?.toggleAttribute("hidden", view !== "store");
  if (view !== "store") {
    hideStoreTooltip();
  }
}

function populateStoreOverlay() {
  if (!storeGrid || !storeBank || !storeMode || !storeCurrentTool) {
    return;
  }

  const mode = GAME_MODE_DEFINITIONS[gameState.gameMode] ?? GAME_MODE_DEFINITIONS[DEFAULT_GAME_MODE];
  const currentTool = getEquippedTool();
  storeBank.textContent = `${gameState.bank}€`;
  storeMode.textContent = mode.label;
  storeCurrentTool.textContent = `${currentTool.label} (${currentTool.miningPower} power)`;
  storeGrid.replaceChildren();

  const treeRoot = document.createElement("div");
  treeRoot.className = "store-tree-root";

  const rootTool = currentTool.branchId === "hands" ? currentTool : getToolDefinition(DEFAULT_TOOL_ID);
  const rootNode = createStoreNode(rootTool, {
    state: currentTool.branchId === "hands" ? "current" : "owned",
    interactive: false,
    materialLabel: "Root",
    gridColumn: `1 / span ${Math.max(1, getVisibleStoreBranches().length)}`,
    gridRow: "1",
  });
  rootNode.classList.add("store-root-node");
  treeRoot.append(rootNode);

  const branches = getVisibleStoreBranches();
  const grid = document.createElement("div");
  grid.className = "store-tree-grid";
  grid.style.setProperty("--store-columns", String(Math.max(1, branches.length)));
  grid.append(rootNode);

  const connector = document.createElement("div");
  connector.className = "store-tree-connector";
  connector.style.gridColumn = `1 / span ${Math.max(1, branches.length)}`;
  connector.style.gridRow = "2";
  grid.append(connector);

  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const branch = branches[branchIndex];
    const column = String(branchIndex + 1);
    const label = document.createElement("div");
    label.className = "store-branch-label";
    label.textContent = branch.label;
    label.style.gridColumn = column;
    label.style.gridRow = "3";
    grid.append(label);

    for (let nodeIndex = 0; nodeIndex < branch.nodes.length; nodeIndex += 1) {
      const node = branch.nodes[nodeIndex];
      const baseRow = 4 + nodeIndex * 2;
      const tierLabel = document.createElement("div");
      tierLabel.className = "store-tier-label";
      tierLabel.textContent = `Tier ${node.tool.tier}`;
      tierLabel.style.gridColumn = column;
      tierLabel.style.gridRow = String(baseRow);

      const nodeWrap = document.createElement("div");
      nodeWrap.className = "store-node-wrap";
      nodeWrap.style.gridColumn = column;
      nodeWrap.style.gridRow = String(baseRow + 1);

      if (nodeIndex > 0) {
        const connector = document.createElement("div");
        connector.className = "store-node-link-vertical";
        nodeWrap.append(connector);
      }

      const storeNode = createStoreNode(node.tool, {
        state: node.state,
        interactive: node.state === "available",
      });
      nodeWrap.append(storeNode);

      grid.append(tierLabel);
      grid.append(nodeWrap);
    }
  }

  treeRoot.append(grid);
  storeGrid.append(treeRoot);
  requestAnimationFrame(() => centerStoreViewOnCurrentNode());
}

function createStoreNode(tool, { state, interactive, materialLabel = null, gridColumn = null, gridRow = null } = {}) {
  const button = document.createElement("button");
  button.className = "store-node";
  button.dataset.toolId = tool.id;
  button.dataset.state = state;
  button.setAttribute("aria-disabled", interactive ? "false" : "true");
  if (gridColumn) {
    button.style.gridColumn = gridColumn;
  }
  if (gridRow) {
    button.style.gridRow = gridRow;
  }

  const visual = getToolVisual(tool, materialLabel);
  button.innerHTML = `
    <span class="store-node-icon" style="background:${visual.background}; box-shadow:${visual.glow};">${visual.text}</span>
    <span class="store-node-tier">${tool.tier}</span>
  `;
  return button;
}

function getVisibleStoreBranches() {
  const branches = [];
  const branchIds = new Set(
    getToolsForGameMode(gameState.gameMode)
      .map((tool) => tool.branchId)
      .filter((branchId) => branchId !== "hands")
  );

  for (const branchId of branchIds) {
    const branchTools = getToolBranchTools(gameState.gameMode, branchId);
    const visibleNodes = branchTools.map((tool) => ({ tool, state: getToolPurchaseState(tool.id) }));

    if (visibleNodes.length === 0) {
      continue;
    }

    branches.push({
      id: branchId,
      label: branchTools[0]?.branchLabel ?? branchId,
      nodes: visibleNodes,
    });
  }

  return branches;
}

function getToolPurchaseState(toolId) {
  const tools = getToolsForGameMode(gameState.gameMode);
  const currentIndex = tools.findIndex((tool) => tool.id === gameState.equippedToolId);
  const targetIndex = tools.findIndex((tool) => tool.id === toolId);
  const tool = getToolDefinition(toolId);
  const currentTool = getEquippedTool();

  if (toolId === gameState.equippedToolId) {
    return "current";
  }

  if (tool.branchId === currentTool.branchId && targetIndex < currentIndex) {
    return "owned";
  }

  if (targetIndex > currentIndex + 1) {
    return "locked";
  }

  if (gameState.bank < tool.price) {
    return "poor";
  }

  return "available";
}

function getToolActionLabel(state, tool) {
  if (state === "current") {
    return "Equipped";
  }
  if (state === "owned") {
    return "Learned";
  }
  if (state === "locked") {
    return "Locked";
  }
  if (state === "poor") {
    return `Need ${tool.price}€`;
  }
  return "Buy Upgrade";
}

function getToolVisual(tool, materialLabel = null) {
  if (tool.category === "hands") {
    return {
      text: "H",
      background: "linear-gradient(180deg, #7f624c, #5f4637)",
      glow: "0 0 18px rgba(184, 133, 97, 0.28)",
      material: materialLabel ?? "Root",
    };
  }

  if (tool.id === "wood-pick") {
    return {
      text: "W",
      background: "linear-gradient(180deg, #9a6d42, #6f482d)",
      glow: "0 0 18px rgba(186, 122, 70, 0.22)",
      material: "Wood",
    };
  }

  const item = tool.materialItemId ? ITEM_DEFINITIONS[tool.materialItemId] : null;
  return {
    text: item?.shortLabel ?? tool.label.slice(0, 1),
    background: `linear-gradient(180deg, ${item?.color ?? "#6f7a89"}, #1b2432)`,
    glow: `0 0 18px ${item?.glow ?? "rgba(136, 185, 216, 0.24)"}`,
    material: materialLabel ?? item?.label ?? tool.branchLabel,
  };
}

function showStoreTooltip(toolId, state, event) {
  if (!toolId || !storeTooltip || !storeTooltipTitle || !storeTooltipState || !storeTooltipCopy || !storeTooltipStats) {
    return;
  }

  const tool = getToolDefinition(toolId);
  const visual = getToolVisual(tool);
  storeTooltip.hidden = false;
  storeTooltip.dataset.visible = "true";
  storeTooltipTitle.textContent = tool.label;
  storeTooltipState.textContent = getToolActionLabel(state, tool);
  storeTooltipCopy.textContent = tool.description;
  storeTooltipStats.innerHTML = `
    <div>Branch: ${tool.branchLabel}</div>
    <div>Material: ${visual.material}</div>
    <div>Cost: ${tool.price}€</div>
    <div>Mining Power: ${tool.miningPower}</div>
    <div>${tool.oneSwingBlockLabel ? `One-swing: ${tool.oneSwingBlockLabel}` : "No one-swing bonus yet"}</div>
  `;
  positionStoreTooltip(event);
}

function positionStoreTooltip(event) {
  if (!storeTooltip) {
    return;
  }

  const padding = 14;
  const offset = 18;
  const rect = storeTooltip.getBoundingClientRect();
  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + rect.width > window.innerWidth - padding) {
    left = event.clientX - rect.width - offset;
  }

  if (top + rect.height > window.innerHeight - padding) {
    top = event.clientY - rect.height - offset;
  }

  storeTooltip.style.left = `${Math.max(padding, left)}px`;
  storeTooltip.style.top = `${Math.max(padding, top)}px`;
}

function hideStoreTooltip() {
  if (!storeTooltip) {
    return;
  }

  storeTooltip.dataset.visible = "false";
  storeTooltip.hidden = true;
}

function centerStoreViewOnCurrentNode() {
  if (!storeGrid) {
    return;
  }

  const currentNode = storeGrid.querySelector('.store-node[data-state="current"]');
  if (!(currentNode instanceof HTMLElement)) {
    storeGrid.scrollLeft = 0;
    storeGrid.scrollTop = 0;
    return;
  }

  const left = currentNode.offsetLeft - (storeGrid.clientWidth - currentNode.offsetWidth) * 0.5;
  const top = currentNode.offsetTop - (storeGrid.clientHeight - currentNode.offsetHeight) * 0.5;
  storeGrid.scrollLeft = Math.max(0, left);
  storeGrid.scrollTop = Math.max(0, top);
}

function purchaseTool(toolId) {
  const state = getToolPurchaseState(toolId);
  if (state !== "available") {
    return;
  }

  const tool = getToolDefinition(toolId);
  gameState.bank -= tool.price;
  gameState.equippedToolId = tool.id;
  player.setMiningPower(tool.miningPower);
  summaryBank.textContent = `${gameState.bank}€`;
  populateStoreOverlay();
}

function syncStratumMusic({ immediate = false } = {}) {
  if (!gameState.audioReady || gameState.phase !== "playing") {
    return;
  }

  const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
  if (!gameState.music.currentStratumName) {
    startStratumMusic(stratumName, { immediate });
    return;
  }

  if (stratumName === gameState.music.currentStratumName || stratumName === gameState.music.pendingStratumName) {
    return;
  }

  transitionStratumMusic(stratumName);
}

function getMusicSetForStratum(stratumName) {
  const songKey = STRATUM_SONG_BY_NAME[stratumName] ?? "waltz";
  return STRATUM_MUSIC_SETS[songKey] ?? STRATUM_MUSIC_SETS.waltz;
}

function startStratumMusic(stratumName, { immediate = false } = {}) {
  const token = ++gameState.music.transitionToken;
  gameState.music.currentStratumName = stratumName;
  gameState.music.pendingStratumName = null;
  const musicSet = getMusicSetForStratum(stratumName);

  const startLoop = () => {
    if (token !== gameState.music.transitionToken || gameState.phase !== "playing") {
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

function transitionStratumMusic(nextStratumName) {
  const currentStratumName = gameState.music.currentStratumName;
  if (!currentStratumName) {
    startStratumMusic(nextStratumName);
    return;
  }

  const token = ++gameState.music.transitionToken;
  gameState.music.pendingStratumName = nextStratumName;
  const currentMusicSet = getMusicSetForStratum(currentStratumName);

  audio.playMusicSegment(currentMusicSet.outro, {
    onended: () => {
      if (token !== gameState.music.transitionToken || gameState.phase !== "playing") {
        return;
      }
      startStratumMusic(nextStratumName);
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
  const musicSet = getMusicSetForStratum(currentStratumName);
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