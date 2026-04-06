import { createPlayerBonuses } from "./chestRewards.js";

export const CHEAT_CODES_ENABLED = true;
const CHEAT_CODE_KEY_TIMEOUT_MS = 750;

const SPECIAL_CHEAT_KEYS = Object.freeze({
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
});

function applyIdfaStatBoost(gameState) {
  for (const statId of Object.keys(createPlayerBonuses())) {
    gameState.playerBonuses[statId] += 0.5;
  }
}

const CHEAT_CODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    code: "IDFA",
    apply({ audio, gameState, syncPlayerBonuses, showRoundNotification }) {
      applyIdfaStatBoost(gameState);
      gameState.bank += 25000;
      syncPlayerBonuses();
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: IDFA grants +50% to all stats and 25000€.", { urgent: true });
    },
  }),
  Object.freeze({
    code: "IDKFA",
    apply({ audio, gameState, createInventoryForLoadout, syncPlayerBonuses, showRoundNotification }) {
      applyIdfaStatBoost(gameState);
      gameState.bank += 25000;
      gameState.equippedToolId = "silver-pick";
      gameState.bagUpgradeId = "bag-1";
      gameState.capacityUpgradeId = "capacity-2";
      gameState.timeUpgradeId = "time-1";
      gameState.bombUnlockId = "bomb-root";
      gameState.bombCapacityUpgradeId = "bomb-capacity-3";
      gameState.bombTypeUpgradeId = "bomb-type-3";
      gameState.bombCharges = 3;
      gameState.bombCooldown = 0;
      gameState.inventory = createInventoryForLoadout(gameState.inventory);
      syncPlayerBonuses();
      audio.playCheatCodeActivated();
      showRoundNotification(
        "Cheat activated: IDKFA grants IDFA stats, another 25000€, a tier 5 pickaxe, tier 1 bag space, tier 2 pocket size, tier 1 time, and tier 3 bombs.",
        { urgent: true },
      );
    },
  }),
  Object.freeze({
    code: "ROSEBUD",
    apply({ audio, gameState, showRoundNotification }) {
      gameState.bank += 10000;
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: ROSEBUD grants 10000€.", { urgent: true });
    },
  }),
  Object.freeze({
    code: "MOTHERLODE",
    apply({ audio, gameState, showRoundNotification }) {
      gameState.bank += 50000;
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: MOTHERLODE grants 50000€.", { urgent: true });
    },
  }),
  Object.freeze({
    sequence: Object.freeze(["UP", "UP", "DOWN", "DOWN", "LEFT", "RIGHT", "LEFT", "RIGHT", "B", "A"]),
    apply({ audio, triggerGameOver, showRoundNotification }) {
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: Good end.", { urgent: true });
      triggerGameOver({ endingType: "good" });
    },
  }),
  Object.freeze({
    sequence: Object.freeze(["UP", "UP", "DOWN", "DOWN", "LEFT", "RIGHT", "LEFT", "RIGHT", "A", "B"]),
    apply({ audio, triggerGameOver, showRoundNotification }) {
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: Bad end.", { urgent: true });
      triggerGameOver({ endingType: "bad" });
    },
  }),
]);

function getCheatSequence(definition) {
  if (Array.isArray(definition.sequence)) {
    return definition.sequence;
  }

  if (typeof definition.code === "string") {
    return definition.code.split("");
  }

  return [];
}

function normalizeCheatKey(event) {
  if (SPECIAL_CHEAT_KEYS[event.code]) {
    return SPECIAL_CHEAT_KEYS[event.code];
  }

  if (typeof event.key !== "string" || event.key.length !== 1) {
    return null;
  }

  const normalizedKey = event.key.toUpperCase();
  return /^[A-Z]$/.test(normalizedKey) ? normalizedKey : null;
}

export function createCheatCodeController({
  audio,
  gameState,
  input,
  createInventoryForLoadout,
  syncPlayerBonuses,
  showRoundNotification,
  triggerGameOver,
}) {
  let buffer = [];
  let lastKeyAt = 0;

  function reset() {
    buffer = [];
    lastKeyAt = 0;
  }

  function handleKeyPress(event) {
    if (!CHEAT_CODES_ENABLED) {
      return;
    }

    if (gameState.phase !== "playing") {
      reset();
      return;
    }

    const now = typeof event.timeStamp === "number" ? event.timeStamp : performance.now();
    if (buffer.length > 0 && now - lastKeyAt > CHEAT_CODE_KEY_TIMEOUT_MS) {
      reset();
    }

    const cheatKey = normalizeCheatKey(event);
    if (!cheatKey) {
      reset();
      return;
    }

    const nextBuffer = [...buffer, cheatKey];
    const matchingCode = CHEAT_CODE_DEFINITIONS.find((definition) => {
      const sequence = getCheatSequence(definition);
      return sequence.length === nextBuffer.length
        && sequence.every((token, index) => token === nextBuffer[index]);
    });
    if (matchingCode) {
      matchingCode.apply({
        audio,
        gameState,
        createInventoryForLoadout,
        syncPlayerBonuses,
        showRoundNotification,
        triggerGameOver,
      });
      reset();
      return;
    }

    if (CHEAT_CODE_DEFINITIONS.some((definition) => {
      const sequence = getCheatSequence(definition);
      return nextBuffer.every((token, index) => sequence[index] === token);
    })) {
      buffer = nextBuffer;
      lastKeyAt = now;
      return;
    }

    if (CHEAT_CODE_DEFINITIONS.some((definition) => getCheatSequence(definition)[0] === cheatKey)) {
      buffer = [cheatKey];
      lastKeyAt = now;
      return;
    }

    reset();
  }

  function attach() {
    input.addKeyPressListener(handleKeyPress);
  }

  return Object.freeze({
    attach,
    reset,
  });
}