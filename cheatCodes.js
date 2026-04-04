import { createPlayerBonuses } from "./chestRewards.js";

export const CHEAT_CODES_ENABLED = true;
const CHEAT_CODE_KEY_TIMEOUT_MS = 200;

const CHEAT_CODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    code: "IDFA",
    apply({ audio, gameState, syncPlayerBonuses, showRoundNotification }) {
      for (const statId of Object.keys(createPlayerBonuses())) {
        gameState.playerBonuses[statId] += 0.5;
      }
      syncPlayerBonuses();
      audio.playCheatCodeActivated();
      showRoundNotification("Cheat activated: IDFA grants +50% to all stats.", { urgent: true });
    },
  }),
]);

function normalizeCheatKey(key) {
  if (typeof key !== "string" || key.length !== 1) {
    return null;
  }

  const normalizedKey = key.toUpperCase();
  return /^[A-Z]$/.test(normalizedKey) ? normalizedKey : null;
}

export function createCheatCodeController({ audio, gameState, input, syncPlayerBonuses, showRoundNotification }) {
  let buffer = "";
  let lastKeyAt = 0;

  function reset() {
    buffer = "";
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
    if (buffer && now - lastKeyAt > CHEAT_CODE_KEY_TIMEOUT_MS) {
      reset();
    }

    const cheatKey = normalizeCheatKey(event.key);
    if (!cheatKey) {
      reset();
      return;
    }

    const nextBuffer = `${buffer}${cheatKey}`;
    const matchingCode = CHEAT_CODE_DEFINITIONS.find((definition) => definition.code === nextBuffer);
    if (matchingCode) {
      matchingCode.apply({ audio, gameState, syncPlayerBonuses, showRoundNotification });
      reset();
      return;
    }

    if (CHEAT_CODE_DEFINITIONS.some((definition) => definition.code.startsWith(nextBuffer))) {
      buffer = nextBuffer;
      lastKeyAt = now;
      return;
    }

    if (CHEAT_CODE_DEFINITIONS.some((definition) => definition.code.startsWith(cheatKey))) {
      buffer = cheatKey;
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