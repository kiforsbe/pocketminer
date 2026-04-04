const CHEST_REWARD_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "moveSpeed",
    title: "Fleet Boots",
    statLabel: "Walk speed",
    description: "Traverse each tunnel faster.",
  }),
  Object.freeze({
    id: "jumpPower",
    title: "Spring Coil",
    statLabel: "Jump power",
    description: "Leap higher between ledges and shafts.",
    amountMultiplier: 1.5,
  }),
  Object.freeze({
    id: "swingRate",
    title: "Quick Grip",
    statLabel: "Swing rate",
    description: "Shorten the recovery time between swings.",
    amountMultiplier: 0.5,
  }),
  Object.freeze({
    id: "platformCooldown",
    title: "Rigging Spool",
    statLabel: "Platform recharge",
    description: "Cut the wait before placing the next platform.",
  }),
  Object.freeze({
    id: "toolDamage",
    title: "Honed Edge",
    statLabel: "Tool damage",
    description: "Drive more damage into each mining hit.",
  }),
]);

export function createPlayerBonuses() {
  return {
    moveSpeed: 0,
    jumpPower: 0,
    swingRate: 0,
    platformCooldown: 0,
    toolDamage: 0,
  };
}

function formatBonusPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getChestRewardAmount(definition, chest) {
  return chest.powerScale * (definition.amountMultiplier ?? 1);
}

export function createChestRewardController({
  gameState,
  input,
  cardOverlay,
  cardTitle,
  cardSubtitle,
  cardChoiceGrid,
  cardFooter,
  worldRandom,
  syncPlayerBonuses,
  showRoundNotification,
  getPlatformCooldownDuration,
}) {
  function createChestRewardChoices(chest) {
    return [...CHEST_REWARD_DEFINITIONS]
      .map((definition) => ({ definition, order: worldRandom() }))
      .sort((left, right) => left.order - right.order)
      .slice(0, 3)
      .map(({ definition }) => ({
        ...definition,
        amount: getChestRewardAmount(definition, chest),
      }));
  }

  function populateChestRewardOverlay() {
    if (!gameState.chestReward || !cardChoiceGrid) {
      return;
    }

    const { chest, choices, selectedIndex } = gameState.chestReward;
    cardTitle.textContent = `${chest.stratumName} Cache`;
    cardSubtitle.textContent = "Choose one permanent upgrade. Reward strength scales with stratum depth.";
    cardFooter.textContent = "Choose with 1, 2, 3, WASD, Enter, or mouse.";
    cardChoiceGrid.replaceChildren();

    choices.forEach((choice, index) => {
      const currentValue = gameState.playerBonuses[choice.id] ?? 0;
      const nextValue = currentValue + choice.amount;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card-choice";
      button.dataset.cardIndex = String(index);
      button.dataset.selected = index === selectedIndex ? "true" : "false";
      button.innerHTML = `
        <span class="card-choice-hotkey">${index + 1}</span>
        <strong class="card-choice-title">${choice.title}</strong>
        <span class="card-choice-stat">${choice.statLabel}</span>
        <p class="card-choice-copy">${choice.description} Gain ${formatBonusPercent(choice.amount)}.</p>
        <div class="card-choice-delta">
          <span>Now ${formatBonusPercent(currentValue)}</span>
          <strong>After ${formatBonusPercent(nextValue)}</strong>
        </div>
      `;
      cardChoiceGrid.append(button);
    });
  }

  function setChestRewardSelection(index) {
    if (!gameState.chestReward) {
      return;
    }

    const clampedIndex = Math.max(0, Math.min(index, gameState.chestReward.choices.length - 1));
    if (clampedIndex === gameState.chestReward.selectedIndex) {
      return;
    }

    gameState.chestReward.selectedIndex = clampedIndex;
    populateChestRewardOverlay();
  }

  function chooseChestReward(index) {
    if (!gameState.chestReward) {
      return;
    }

    const choice = gameState.chestReward.choices[index];
    if (!choice) {
      return;
    }

    const previousPlatformCooldownDuration = getPlatformCooldownDuration();
    gameState.playerBonuses[choice.id] += choice.amount;
    syncPlayerBonuses();
    if (choice.id === "platformCooldown" && gameState.platformCooldown > 0) {
      const nextPlatformCooldownDuration = getPlatformCooldownDuration();
      gameState.platformCooldown *= nextPlatformCooldownDuration / previousPlatformCooldownDuration;
    }
    showRoundNotification(`${choice.title}: +${formatBonusPercent(choice.amount)} ${choice.statLabel.toLowerCase()}.`);
    gameState.chestReward = null;
    gameState.phase = "playing";
    hideOverlay();
  }

  function attachControls() {
    cardChoiceGrid?.addEventListener("pointerover", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("button[data-card-index]") : null;
      if (!button || !gameState.chestReward) {
        return;
      }

      setChestRewardSelection(Number(button.dataset.cardIndex));
    });

    cardChoiceGrid?.addEventListener("click", (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest("button[data-card-index]") : null;
      if (!button || !gameState.chestReward) {
        return;
      }

      chooseChestReward(Number(button.dataset.cardIndex));
    });
  }

  function openChestReward(chest) {
    gameState.phase = "reward";
    gameState.miningResult = null;
    gameState.hoverTarget = null;
    gameState.chestReward = {
      chest,
      choices: createChestRewardChoices(chest),
      selectedIndex: 0,
    };
    populateChestRewardOverlay();
    cardOverlay?.removeAttribute("hidden");
    cardOverlay?.setAttribute("data-visible", "true");
  }

  function hideOverlay() {
    cardOverlay?.setAttribute("data-visible", "false");
    cardOverlay?.setAttribute("hidden", "true");
  }

  function updateSelection() {
    if (!gameState.chestReward) {
      return;
    }

    if (input.wasPressed("rewardChoice1")) {
      chooseChestReward(0);
      return;
    }

    if (input.wasPressed("rewardChoice2")) {
      chooseChestReward(1);
      return;
    }

    if (input.wasPressed("rewardChoice3")) {
      chooseChestReward(2);
      return;
    }

    if (input.wasPressed("rewardPrev")) {
      setChestRewardSelection((gameState.chestReward.selectedIndex + gameState.chestReward.choices.length - 1)
        % gameState.chestReward.choices.length);
    }

    if (input.wasPressed("rewardNext")) {
      setChestRewardSelection((gameState.chestReward.selectedIndex + 1) % gameState.chestReward.choices.length);
    }

    if (input.wasPressed("rewardConfirm")) {
      chooseChestReward(gameState.chestReward.selectedIndex);
    }
  }

  return Object.freeze({
    attachControls,
    openChestReward,
    hideOverlay,
    updateSelection,
  });
}