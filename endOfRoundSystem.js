import { ITEM_DEFINITIONS } from "./inventory.js";

const SUMMARY_MIN_STEP_RATE = 4;
const SUMMARY_MAX_STEP_RATE = 52;

export function createEndOfRoundSystem({
  gameState,
  audio,
  storeController,
  getWorld,
  onStartSummaryMusic,
}) {
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
  let overlayFadeTimeoutId = null;

  function clearOverlayFadeTimeout() {
    if (overlayFadeTimeoutId === null) {
      return;
    }

    window.clearTimeout(overlayFadeTimeoutId);
    overlayFadeTimeoutId = null;
  }

  function showRoundOverlayWithMusicFade({ fadeDelayMs = 0, fadeDurationMs = 0 } = {}) {
    if (!roundOverlay) {
      return;
    }

    clearOverlayFadeTimeout();
    roundOverlay.style.setProperty("--round-overlay-fade-duration", `${Math.max(0, Math.round(fadeDurationMs))}ms`);
    roundOverlay.removeAttribute("hidden");
    roundOverlay.setAttribute("data-visible", "false");

    const reveal = () => {
      overlayFadeTimeoutId = null;
      roundOverlay.setAttribute("data-visible", "true");
    };

    if (fadeDelayMs <= 0) {
      reveal();
      return;
    }

    overlayFadeTimeoutId = window.setTimeout(reveal, Math.max(0, Math.round(fadeDelayMs)));
  }

  function updateSummaryActionState() {
    const enabled = Boolean(gameState.summary?.completed);
    nextRoundButton?.toggleAttribute("disabled", !enabled);
    storeController.updateSummaryActionState(enabled);
  }

  function updateSummaryRow(entry) {
    const row = summaryGrid?.querySelector(`[data-item-id="${entry.itemId}"]`);
    if (!row) {
      return;
    }

    row.querySelector('[data-role="count"]').textContent = String(entry.displayedCount);
    row.querySelector('[data-role="value"]').textContent = `${entry.displayedValue}€`;
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
    if (roundSubtitle) {
      roundSubtitle.textContent = "Choose when to begin the next shift.";
    }
    if (summaryBank) {
      summaryBank.textContent = `${gameState.bank}€`;
    }
    storeController.syncBankDisplay();
  }

  function paintSummaryIcon(canvasEl, itemId) {
    if (!(canvasEl instanceof HTMLCanvasElement)) {
      return;
    }

    const context = canvasEl.getContext("2d");
    const definition = getWorld().getTileDefinition(itemId);
    context.imageSmoothingEnabled = false;
    context.fillStyle = definition.fill;
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
    context.fillStyle = definition.accent;
    context.fillRect(5, 5, 6, 6);
    context.fillRect(14, 9, 7, 7);
    context.fillRect(10, 16, 8, 8);
  }

  function populateSummaryOverlay() {
    if (!gameState.summary || !summaryGrid) {
      return;
    }

    updateSummaryActionState();
    summaryGrid.replaceChildren();
    if (roundTitle) {
      roundTitle.textContent = `Shift ${gameState.round} Complete`;
    }
    if (roundSubtitle) {
      roundSubtitle.textContent = gameState.summary.entries.length
        ? "Counting your haul..."
        : "No ore banked this shift.";
    }
    if (summaryBlocks) {
      summaryBlocks.textContent = String(gameState.summary.blocksMined);
    }
    if (summaryItems) {
      summaryItems.textContent = String(gameState.summary.totalItems);
    }
    if (summaryRound) {
      summaryRound.textContent = String(gameState.round);
    }
    if (summaryEarnings) {
      summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
    }
    if (summaryBank) {
      summaryBank.textContent = `${gameState.summary.startingBank}€`;
    }

    for (const entry of gameState.summary.entries) {
      const row = document.createElement("div");
      row.className = "summary-row";
      row.dataset.itemId = entry.itemId;
      row.innerHTML = `
      <div class="summary-ore">
        <canvas width="26" height="26"></canvas>
        <span class="summary-ore-label">${ITEM_DEFINITIONS[entry.itemId].label}</span>
      </div>
      <div class="summary-breakdown">
        <span class="summary-breakdown-detail">
          <span data-role="count">0</span>
          <span>x</span>
          <span data-role="unit">${entry.value}€</span>
        </span>
        <span class="summary-breakdown-total">
          <span>=</span>
          <span data-role="value">0€</span>
        </span>
      </div>
    `;
      summaryGrid.append(row);
      paintSummaryIcon(row.querySelector("canvas"), entry.itemId);
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
    if (summaryEarnings) {
      summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
    }
    audio.playSound("coin", { playbackRate: 0.98 + Math.random() * 0.06, volume: 0.2 });

    if (entry.displayedCount >= entry.count) {
      gameState.summary.activeIndex += 1;
      if (gameState.summary.activeIndex >= gameState.summary.entries.length) {
        gameState.summary.completed = true;
        commitSummaryBankEarnings();
      }
    }
  }

  return {
    attachControls(onStartNextRound) {
      nextRoundButton?.addEventListener("click", () => {
        if (gameState.phase !== "summary") {
          return;
        }

        onStartNextRound();
      });
    },

    endRound() {
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
      const summaryFadeTiming = onStartSummaryMusic() ?? { fadeDelayMs: 0, fadeDurationMs: 0 };

      if (gameState.summary.completed) {
        commitSummaryBankEarnings();
      }
      populateSummaryOverlay();
      storeController.populateOverlay();
      storeController.setOverlayView("summary");
      showRoundOverlayWithMusicFade(summaryFadeTiming);
    },

    reset() {
      clearOverlayFadeTimeout();
      roundOverlay?.setAttribute("data-visible", "false");
      roundOverlay?.setAttribute("hidden", "true");
    },

    update(dt) {
      if (!gameState.summary || gameState.summary.completed) {
        return;
      }

      gameState.summary.tickBudget += dt * getSummaryStepRate(gameState.summary);
      while (gameState.summary.tickBudget >= 1 && !gameState.summary.completed) {
        gameState.summary.tickBudget -= 1;
        advanceSummaryCount();
      }
    },
  };
}