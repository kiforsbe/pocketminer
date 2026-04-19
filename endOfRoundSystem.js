import { ITEM_DEFINITIONS } from "./inventory.js";

const SUMMARY_MIN_STEP_RATE = 4;
const SUMMARY_MAX_STEP_RATE = 52;
const MIN_SUMMARY_FADE_MS = 1000;

export function createEndOfRoundSystem({
  gameState,
  audio,
  storeController,
  worldRenderer,
  onStartSummaryMusic,
  onResolveDebt,
  onAttemptAmortization,
}) {
  const roundOverlay = document.getElementById("round-overlay");
  const summaryGrid = document.getElementById("summary-grid");
  const roundTitle = document.getElementById("round-title");
  const roundSubtitle = document.getElementById("round-subtitle");
  const summaryEarnings = document.getElementById("summary-earnings");
  const summaryBank = document.getElementById("summary-bank");
  const summaryAutoPayment = document.getElementById("summary-auto-payment");
  const summaryShiftProfit = document.getElementById("summary-shift-profit");
  const summaryTotalGoal = document.getElementById("summary-total-goal");
  const summaryAmortizeButton = document.getElementById("summary-amortize-button");
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
    const normalizedFadeDurationMs = Math.max(MIN_SUMMARY_FADE_MS, Math.round(fadeDurationMs));
    roundOverlay.style.setProperty("--round-overlay-fade-duration", `${normalizedFadeDurationMs}ms`);
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

  function getSummaryRevealWaitSeconds({ fadeDelayMs = 0, fadeDurationMs = 0 } = {}) {
    return Math.max(0, fadeDelayMs + Math.max(MIN_SUMMARY_FADE_MS, Math.round(fadeDurationMs))) / 1000;
  }

  function updateSummaryActionState() {
    const summaryCompleted = Boolean(gameState.summary?.completed);
    nextRoundButton?.toggleAttribute("disabled", !summaryCompleted);
    storeController.updateSummaryActionState(summaryCompleted);

    if (!summaryAmortizeButton) {
      return;
    }

    const amount = gameState.summary?.debtStatus?.amortizationAmount ?? 0;
    const enabled = summaryCompleted
      && Boolean(gameState.summary?.debtStatus?.canAmortize)
      && amount > 0
      && gameState.bank >= amount;
    summaryAmortizeButton.toggleAttribute("disabled", !enabled);
  }

  function updateSummaryRow(entry) {
    const row = summaryGrid?.querySelector(`[data-item-id="${entry.itemId}"]`);
    if (!row) {
      return;
    }

    row.querySelector('[data-role="count"]').textContent = String(entry.displayedCount);
    row.querySelector('[data-role="value"]').textContent = `${entry.displayedValue}€`;
  }

  function updateDebtSummaryPanel() {
    const debtStatus = gameState.summary?.debtStatus;
    if (!debtStatus) {
      return;
    }

    const paymentAmount = debtStatus.paymentSucceeded ? (debtStatus.autoPayment ?? 0) : 0;
    const debtIncrease = debtStatus.debtIncrease ?? 0;
    const displayedEarnings = gameState.summary?.displayedEarnings ?? 0;
    const shiftProfit = displayedEarnings - paymentAmount;

    if (summaryAutoPayment) {
      summaryAutoPayment.textContent = paymentAmount > 0 ? `-${paymentAmount}€` : "0€";
      summaryAutoPayment.dataset.negative = paymentAmount > 0 ? "true" : "false";
    }
    if (summaryShiftProfit) {
      summaryShiftProfit.textContent = `${shiftProfit}€`;
      summaryShiftProfit.dataset.negative = shiftProfit < 0 ? "true" : "false";
    }
    if (summaryTotalGoal) {
      summaryTotalGoal.textContent = debtIncrease > 0
        ? `${debtStatus.remainingDebt ?? 0}€ (+${debtIncrease}€)`
        : `${debtStatus.remainingDebt ?? 0}€`;
      summaryTotalGoal.dataset.negative = debtIncrease > 0 ? "true" : "false";
    }

    if (summaryAmortizeButton) {
      summaryAmortizeButton.textContent = `Amortize ${debtStatus.amortizationAmount ?? 0}€`;
    }

    updateSummaryActionState();
  }

  function commitSummaryBankEarnings() {
    if (!gameState.summary || gameState.summary.bankAwarded) {
      return;
    }

    gameState.bank += gameState.summary.totalEarnings;
    gameState.summary.debtStatus = onResolveDebt?.({ bank: gameState.bank }) ?? gameState.summary.debtStatus;
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
    updateDebtSummaryPanel();
  }

  function paintSummaryIcon(canvasEl, itemId) {
    if (!(canvasEl instanceof HTMLCanvasElement)) {
      return;
    }

    worldRenderer?.paintIcon(canvasEl, itemId);
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
    if (summaryEarnings) {
      summaryEarnings.textContent = `${gameState.summary.displayedEarnings}€`;
    }
    if (summaryBank) {
      summaryBank.textContent = `${gameState.summary.startingBank}€`;
    }
    gameState.summary.debtStatus = gameState.summary.debtStatus ?? {
      shiftGoal: gameState.debt?.shiftGoal ?? 0,
      autoPayment: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      debtIncrease: 0,
      penalty: 0,
      paymentSucceeded: (gameState.debt?.shiftGoal ?? 0) <= 0,
      remainingDebt: gameState.debt?.current ?? 0,
      consecutiveFailures: gameState.debt?.consecutiveFailures ?? 0,
      canAmortize: false,
      amortizationAmount: 0,
      amortizedAmount: 0,
    };
    updateDebtSummaryPanel();

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
    updateDebtSummaryPanel();
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

      summaryAmortizeButton?.addEventListener("click", () => {
        if (gameState.phase !== "summary" || !gameState.summary?.completed) {
          return;
        }

        const result = onAttemptAmortization?.({ bank: gameState.bank });
        if (!result) {
          return;
        }

        if (!result.applied) {
          updateSummaryActionState();
          return;
        }

        gameState.summary.debtStatus = {
          ...gameState.summary.debtStatus,
          remainingDebt: result.remainingDebt,
          amortizedAmount: result.amount,
          amortizationAmount: result.nextAmortizationAmount,
          canAmortize: result.canAmortize,
        };
        if (summaryBank) {
          summaryBank.textContent = `${result.bankAfterAmortization}€`;
        }
        storeController.syncBankDisplay();
        updateDebtSummaryPanel();
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
        debtStatus: null,
      };
      gameState.notification = null;
      gameState.countdownTickCooldown = 0;
      const summaryFadeTiming = onStartSummaryMusic() ?? { fadeDelayMs: 0, fadeDurationMs: 0 };
      gameState.summary.revealWaitRemaining = getSummaryRevealWaitSeconds(summaryFadeTiming);

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

      if ((gameState.summary.revealWaitRemaining ?? 0) > 0) {
        gameState.summary.revealWaitRemaining = Math.max(0, gameState.summary.revealWaitRemaining - dt);
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