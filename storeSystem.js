import { ITEM_DEFINITIONS } from "./inventory.js";
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
  GAME_MODE_DEFINITIONS,
  getToolBranchTools,
  getToolDefinition,
} from "./tools.js";

const STORE_CATEGORY_ORDER = Object.freeze([
  { id: "tools", label: "Tools", branchIds: ["pickaxe", "bomb-unlock", "bomb-capacity", "bomb-type"] },
  { id: "storage", label: "Storage", branchIds: ["bags", "capacity"] },
  { id: "misc", label: "Misc", branchIds: ["time", "platforms"] },
]);

export function createStoreController({
  gameState,
  getInventoryCapacity,
  getRoundDuration,
  getEquippedTool,
  createInventoryForLoadout,
  syncPlayerBonuses,
  onStartNextRound,
}) {
  const state = {
    overlayView: "summary",
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      startScrollTop: 0,
    },
  };

  const summaryBankEl = document.getElementById("summary-bank");
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

  function attachControls() {
    storeNextRoundButton?.addEventListener("click", () => {
      if (gameState.phase !== "summary") {
        return;
      }
      onStartNextRound();
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

      state.drag.active = true;
      state.drag.pointerId = event.pointerId;
      state.drag.startX = event.clientX;
      state.drag.startY = event.clientY;
      state.drag.startScrollLeft = storeGrid.scrollLeft;
      state.drag.startScrollTop = storeGrid.scrollTop;
      storeGrid.dataset.dragging = "true";
      storeGrid.setPointerCapture?.(event.pointerId);
      hideTooltip();
    });

    storeGrid?.addEventListener("pointermove", (event) => {
      if (state.drag.active && state.drag.pointerId === event.pointerId) {
        storeGrid.scrollLeft = state.drag.startScrollLeft - (event.clientX - state.drag.startX);
        storeGrid.scrollTop = state.drag.startScrollTop - (event.clientY - state.drag.startY);
        return;
      }

      if (storeTooltip?.dataset.visible !== "true") {
        return;
      }
      positionTooltip(event);
    });

    const endStoreDrag = (event) => {
      if (!state.drag.active || state.drag.pointerId !== event.pointerId) {
        return;
      }

      state.drag.active = false;
      state.drag.pointerId = null;
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

      showTooltip(button.dataset.toolId, button.dataset.state, event);
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

      hideTooltip();
    });
  }

  function updateSummaryActionState(enabled) {
    openStoreButton?.toggleAttribute("disabled", !enabled);
    storeNextRoundButton?.toggleAttribute("disabled", !enabled);
  }

  function setOverlayView(view) {
    state.overlayView = view;
    summaryView?.toggleAttribute("hidden", view !== "summary");
    storeView?.toggleAttribute("hidden", view !== "store");
    if (view !== "store") {
      hideTooltip();
    }
  }

  function reset() {
    state.overlayView = "summary";
    state.drag.active = false;
    state.drag.pointerId = null;
    if (storeGrid) {
      storeGrid.dataset.dragging = "false";
    }
    setOverlayView("summary");
  }

  function syncBankDisplay() {
    if (storeBank) {
      storeBank.textContent = `${gameState.bank}€`;
    }
  }

  function populateOverlay() {
    if (!storeGrid || !storeBank || !storeMode || !storeCurrentTool) {
      return;
    }

    const mode = GAME_MODE_DEFINITIONS[gameState.gameMode] ?? GAME_MODE_DEFINITIONS[DEFAULT_GAME_MODE];
    const currentTool = getEquippedTool();
    const inventoryCapacity = getInventoryCapacity();
    const roundDuration = getRoundDuration();
    storeBank.textContent = `${gameState.bank}€`;
    storeMode.textContent = mode.label;
    storeCurrentTool.textContent = `${currentTool.label} (${currentTool.miningPower} power) | ${inventoryCapacity.slotCount} slots x ${inventoryCapacity.stackSize} | ${roundDuration}s shifts`;
    storeGrid.replaceChildren();

    const treeRoot = document.createElement("div");
    treeRoot.className = "store-tree-root";

    for (const category of getVisibleStoreCategories()) {
      const section = document.createElement("section");
      section.className = "store-category-section";

      const title = document.createElement("div");
      title.className = "store-category-title";
      title.textContent = category.label;
      section.append(title);

      section.append(createCategoryContent(category));
      treeRoot.append(section);
    }

    storeGrid.append(treeRoot);
    requestAnimationFrame(() => centerStoreViewOnCurrentNode());
  }

  function createCategoryContent(category) {
    const categoryLayout = document.createElement("div");
    categoryLayout.className = "store-category-layout";

    const bombUnlockBranch = category.branches.find((branch) => branch.id === "bomb-unlock");
    const bombCapacityBranch = category.branches.find((branch) => branch.id === "bomb-capacity");
    const bombTypeBranch = category.branches.find((branch) => branch.id === "bomb-type");
    const regularBranches = category.branches.filter((branch) => !["bomb-unlock", "bomb-capacity", "bomb-type"].includes(branch.id));

    if (regularBranches.length > 0) {
      categoryLayout.append(createStoreBranchGrid(regularBranches));
    }

    if (bombUnlockBranch && bombCapacityBranch && bombTypeBranch) {
      categoryLayout.append(createBombForkGrid({
        unlockBranch: bombUnlockBranch,
        capacityBranch: bombCapacityBranch,
        typeBranch: bombTypeBranch,
      }));
    } else if (categoryLayout.childElementCount === 0) {
      categoryLayout.append(createStoreBranchGrid(category.branches));
    }

    return categoryLayout;
  }

  function createStoreBranchGrid(branches = [], { showBranchLabels = true } = {}) {
    const grid = document.createElement("div");
    grid.className = "store-tree-grid";
    grid.style.setProperty("--store-columns", String(Math.max(1, branches.length)));
    const rowStart = showBranchLabels ? 2 : 1;

    for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
      const branch = branches[branchIndex];
      const column = String(branchIndex + 1);
      if (showBranchLabels) {
        const label = document.createElement("div");
        label.className = "store-branch-label";
        label.textContent = branch.label;
        label.style.gridColumn = column;
        label.style.gridRow = "1";
        grid.append(label);
      }

      for (let nodeIndex = 0; nodeIndex < branch.nodes.length; nodeIndex += 1) {
        const node = branch.nodes[nodeIndex];
        const baseRow = rowStart + nodeIndex * 2;
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

        nodeWrap.append(createStoreNode(node.tool, {
          state: node.state,
          interactive: node.state === "available",
        }));

        grid.append(tierLabel);
        grid.append(nodeWrap);
      }
    }

    return grid;
  }

  function createBombForkGrid({ unlockBranch, capacityBranch, typeBranch }) {
    const wrapper = document.createElement("div");
    wrapper.className = "store-bomb-fork";
    const visibleCapacityBranch = {
      ...capacityBranch,
      nodes: capacityBranch.nodes.filter((node) => !node.tool.isRoot),
    };
    const visibleTypeBranch = {
      ...typeBranch,
      nodes: typeBranch.nodes.filter((node) => !node.tool.isRoot),
    };

    const unlockNode = unlockBranch.nodes[0];
    const unlockLabel = document.createElement("div");
    unlockLabel.className = "store-branch-label store-bomb-root-label";
    unlockLabel.textContent = unlockBranch.label;
    wrapper.append(unlockLabel);

    const unlockTier = document.createElement("div");
    unlockTier.className = "store-tier-label store-bomb-root-tier";
    unlockTier.textContent = `Tier ${unlockNode.tool.tier}`;
    wrapper.append(unlockTier);

    const unlockWrap = document.createElement("div");
    unlockWrap.className = "store-node-wrap store-bomb-root-wrap";
    unlockWrap.append(createStoreNode(unlockNode.tool, {
      state: unlockNode.state,
      interactive: unlockNode.state === "available",
    }));
    wrapper.append(unlockWrap);

    const childrenShell = document.createElement("div");
    childrenShell.className = "store-bomb-children-shell";
  childrenShell.append(createStoreBranchGrid([visibleCapacityBranch, visibleTypeBranch], { showBranchLabels: false }));
    wrapper.append(childrenShell);

    return wrapper;
  }

  function createStoreNode(tool, { state, interactive } = {}) {
    const button = document.createElement("button");
    button.className = "store-node";
    button.dataset.toolId = tool.id;
    button.dataset.state = state;
    button.setAttribute("aria-disabled", interactive ? "false" : "true");

    const visual = getToolVisual(tool);
    const iconStyle = visual.image
      ? `background:${visual.background}; box-shadow:${visual.glow}; background-image:url('${visual.image}'); background-size:${visual.imageSize ?? "72% 72%"}; background-position:${visual.imagePosition ?? "center"}; background-repeat:no-repeat;`
      : `background:${visual.background}; box-shadow:${visual.glow};`;
    button.innerHTML = `
      <span class="store-node-icon" style="${iconStyle}">${visual.text}</span>
      <span class="store-node-cost">${tool.price}€</span>
      <span class="store-node-tier">${tool.tier}</span>
    `;
    return button;
  }

  function getVisibleStoreCategories() {
    const categories = [];

    for (const config of STORE_CATEGORY_ORDER) {
      const branches = [];

      for (const branchId of config.branchIds) {
        const branchTools = branchId === "pickaxe"
          ? [getToolDefinition(DEFAULT_TOOL_ID), ...getToolBranchTools(gameState.gameMode, branchId)]
          : getToolBranchTools(gameState.gameMode, branchId);
        const visibleNodes = branchTools.map((tool) => ({ tool, state: getToolPurchaseState(tool.id, branchId) }));

        if (visibleNodes.length === 0) {
          continue;
        }

        branches.push({
          id: branchId,
          label: branchTools[0]?.branchLabel ?? branchId,
          nodes: visibleNodes,
        });
      }

      if (branches.length > 0) {
        categories.push({
          id: config.id,
          label: config.label,
          branches,
        });
      }
    }

    return categories;
  }

  function getToolPurchaseState(toolId, branchIdOverride = null) {
    const tool = getToolDefinition(toolId);
    const branchId = branchIdOverride ?? tool.branchId;
    const branchTools = branchId === "pickaxe"
      ? [getToolDefinition(DEFAULT_TOOL_ID), ...getToolBranchTools(gameState.gameMode, branchId)]
      : getToolBranchTools(gameState.gameMode, branchId);
    const currentUpgradeId = branchId === "pickaxe"
      ? gameState.equippedToolId
      : getCurrentBranchUpgradeId(branchId);
    const currentIndex = branchTools.findIndex((branchTool) => branchTool.id === currentUpgradeId);
    const targetIndex = branchTools.findIndex((branchTool) => branchTool.id === toolId);

    if (toolId === currentUpgradeId) {
      return "current";
    }

    if ((branchId === "bomb-capacity" || branchId === "bomb-type") && gameState.bombUnlockId !== BOMB_UNLOCK_ROOT_ID) {
      return "locked";
    }

    if (tool.isRoot) {
      return currentIndex >= targetIndex && currentIndex >= 0 ? "owned" : "locked";
    }

    if (targetIndex < currentIndex) {
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
      return tool.category === "pickaxe" ? "Equipped" : "Installed";
    }
    if (state === "owned") {
      return "Owned";
    }
    if (state === "locked") {
      return "Locked";
    }
    if (state === "poor") {
      return `Need ${tool.price}€`;
    }
    return "Buy Upgrade";
  }

  function getToolVisual(tool) {
    if (tool.category === "bag-root") {
      return {
        text: "TP",
        background: "linear-gradient(180deg, #7b6242, #4a3828)",
        glow: "0 0 18px rgba(190, 144, 92, 0.28)",
        material: "Pockets",
      };
    }

    if (tool.category === "capacity-root") {
      return {
        text: "8x",
        background: "linear-gradient(180deg, #5b7389, #243448)",
        glow: "0 0 18px rgba(136, 185, 216, 0.28)",
        material: "Small",
      };
    }

    if (tool.category === "time-root") {
      return {
        text: "TM",
        background: "linear-gradient(180deg, #6e6f78, #353741)",
        glow: "0 0 18px rgba(182, 188, 216, 0.22)",
        material: "Time",
      };
    }

    if (tool.category === "platform-root" || tool.category === "platform") {
      return {
        text: `${tool.platformCapacity ?? 1}x`.slice(0, 3),
        background: "linear-gradient(180deg, #6f6345, #2f2518)",
        glow: "0 0 18px rgba(241, 208, 77, 0.24)",
        material: "Rigging",
      };
    }

    if (tool.category === "time") {
      return {
        text: `${tool.durationSeconds}s`,
        background: "linear-gradient(180deg, #6e6f78, #353741)",
        glow: "0 0 18px rgba(182, 188, 216, 0.22)",
        material: "Clock",
      };
    }

    if (tool.branchId === "bomb-capacity") {
      return {
        text: `${tool.bombCapacity ?? 1}x`,
        background: "linear-gradient(180deg, #78423d, #2c1518)",
        glow: "0 0 18px rgba(255, 145, 108, 0.26)",
        material: "Explosive Rack",
      };
    }

    if (tool.category === "bomb") {
      return {
        text: "",
        background: "linear-gradient(180deg, #78423d, #2c1518)",
        glow: "0 0 18px rgba(255, 145, 108, 0.26)",
        material: "Explosive",
        image: "./assets/sprites/bomb-spritesheet.png",
        imageSize: "400% 300%",
        imagePosition: `0% ${Math.max(0, Math.min(100, (tool.bombSpriteRow ?? 0) * 50))}%`,
      };
    }

    if (tool.category === "hands") {
      return {
        text: "H",
        background: "linear-gradient(180deg, #7f624c, #5f4637)",
        glow: "0 0 18px rgba(184, 133, 97, 0.28)",
        material: "Root",
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

    if (tool.category === "bag") {
      return {
        text: "BG",
        background: "linear-gradient(180deg, #7c5736, #4c311f)",
        glow: "0 0 18px rgba(180, 121, 70, 0.24)",
        material: "Bag",
      };
    }

    if (tool.category === "capacity") {
      return {
        text: `${tool.stackSize}x`.slice(0, 3),
        background: "linear-gradient(180deg, #5b7389, #243448)",
        glow: "0 0 18px rgba(136, 185, 216, 0.28)",
        material: "Capacity",
      };
    }

    const item = tool.materialItemId ? ITEM_DEFINITIONS[tool.materialItemId] : null;
    return {
      text: item?.shortLabel ?? tool.label.slice(0, 1),
      background: `linear-gradient(180deg, ${item?.color ?? "#6f7a89"}, #1b2432)`,
      glow: `0 0 18px ${item?.glow ?? "rgba(136, 185, 216, 0.24)"}`,
      material: item?.label ?? tool.branchLabel,
    };
  }

  function showTooltip(toolId, state, event) {
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

    if (tool.category === "pickaxe" || tool.category === "hands") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Material: ${visual.material}</div>
        <div>Cost: ${tool.price}€</div>
        <div>Mining Power: ${tool.miningPower}</div>
        <div>${tool.oneSwingBlockLabel ? `One-swing: ${tool.oneSwingBlockLabel}` : "No one-swing bonus yet"}</div>
      `;
    } else if (tool.category === "bag" || tool.category === "bag-root") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Cost: ${tool.price}€</div>
        <div>Total Slots: ${tool.slotCount ?? DEFAULT_SLOT_COUNT}</div>
        <div>${tool.isRoot ? "Starting carry space" : "Bag Gain: +8 slots"}</div>
      `;
    } else if (tool.category === "capacity" || tool.category === "capacity-root") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Cost: ${tool.price}€</div>
        <div>Stack Size: ${tool.stackSize ?? DEFAULT_STACK_SIZE} per slot</div>
        <div>${tool.isRoot ? "Starting slot size" : "Effect: 2x every slot"}</div>
      `;
    } else if (tool.category === "time-root") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Status: Base branch ready</div>
        <div>Shift Length: ${tool.durationSeconds ?? 60}s</div>
      `;
    } else if (tool.category === "time") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Cost: ${tool.price}€</div>
        <div>Shift Length: ${tool.durationSeconds}s</div>
        <div>Effect: Longer mining shift</div>
      `;
    } else if (tool.category === "platform-root" || tool.category === "platform") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Cost: ${tool.price}€</div>
        <div>Ready Platforms: ${tool.platformCapacity ?? 1}</div>
        <div>Reload: One platform every 3s</div>
      `;
    } else if (tool.category === "bomb") {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Cost: ${tool.price}€</div>
        ${tool.bombDamage != null ? `<div>Payload: ${tool.bombDamage}</div>` : ""}
        ${tool.bombCapacity != null ? `<div>Armed Bombs: ${tool.bombCapacity}</div>` : ""}
        <div>Cooldown: 3s after emptying the rack</div>
      `;
    } else {
      storeTooltipStats.innerHTML = `
        <div>Branch: ${tool.branchLabel}</div>
        <div>Base Slots: ${tool.slotCount ?? DEFAULT_SLOT_COUNT}</div>
        <div>Base Stack Size: ${tool.stackSize ?? DEFAULT_STACK_SIZE}</div>
      `;
    }

    positionTooltip(event);
  }

  function positionTooltip(event) {
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

  function hideTooltip() {
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

    if (tool.branchId === "pickaxe") {
      gameState.equippedToolId = tool.id;
      syncPlayerBonuses();
    } else if (tool.branchId === "bags") {
      gameState.bagUpgradeId = tool.id;
      gameState.inventory = createInventoryForLoadout(gameState.inventory);
    } else if (tool.branchId === "capacity") {
      gameState.capacityUpgradeId = tool.id;
      gameState.inventory = createInventoryForLoadout(gameState.inventory);
    } else if (tool.branchId === "time") {
      gameState.timeUpgradeId = tool.id;
    } else if (tool.branchId === "platforms") {
      gameState.platformUpgradeId = tool.id;
      gameState.platformCharges = tool.platformCapacity ?? gameState.platformCharges;
      gameState.platformCooldown = 0;
    } else if (tool.branchId === "bomb-unlock") {
      gameState.bombUnlockId = tool.id;
      gameState.bombCapacityUpgradeId = null;
      gameState.bombTypeUpgradeId = null;
      gameState.bombCharges = getToolDefinition(BOMB_CAPACITY_ROOT_ID).bombCapacity ?? gameState.bombCharges;
      gameState.bombCooldown = 0;
    } else if (tool.branchId === "bomb-capacity") {
      gameState.bombCapacityUpgradeId = tool.id === BOMB_CAPACITY_ROOT_ID ? null : tool.id;
      gameState.bombCharges = tool.bombCapacity ?? gameState.bombCharges;
      gameState.bombCooldown = 0;
    } else if (tool.branchId === "bomb-type") {
      gameState.bombTypeUpgradeId = tool.id === BOMB_TYPE_ROOT_ID ? null : tool.id;
      gameState.bombCooldown = 0;
    }

    if (summaryBankEl) {
      summaryBankEl.textContent = `${gameState.bank}€`;
    }
    populateOverlay();
  }

  function getCurrentBranchUpgradeId(branchId) {
    if (branchId === "pickaxe") {
      return gameState.equippedToolId;
    }

    if (branchId === "bags") {
      return gameState.bagUpgradeId ?? DEFAULT_BAG_ROOT_ID;
    }

    if (branchId === "capacity") {
      return gameState.capacityUpgradeId ?? DEFAULT_CAPACITY_ROOT_ID;
    }

    if (branchId === "time") {
      return gameState.timeUpgradeId ?? DEFAULT_TIME_ROOT_ID;
    }

    if (branchId === "platforms") {
      return gameState.platformUpgradeId ?? DEFAULT_PLATFORM_ROOT_ID;
    }

    if (branchId === "bomb-unlock") {
      return gameState.bombUnlockId ?? null;
    }

    if (branchId === "bomb-capacity") {
      return gameState.bombUnlockId ? (gameState.bombCapacityUpgradeId ?? BOMB_CAPACITY_ROOT_ID) : null;
    }

    if (branchId === "bomb-type") {
      return gameState.bombUnlockId ? (gameState.bombTypeUpgradeId ?? BOMB_TYPE_ROOT_ID) : null;
    }

    return branchId === "hands" ? DEFAULT_TOOL_ID : null;
  }

  return {
    attachControls,
    hideTooltip,
    populateOverlay,
    reset,
    setOverlayView,
    syncBankDisplay,
    updateSummaryActionState,
  };
}