const FLOATING_TEXT_LIFETIME = 0.65;
const FLOATING_TEXT_SPAWN_RADIUS = 32 * 0.12;
const FLOATING_TEXT_GRAVITY = 18;
const SHOW_ORE_YIELD_FLOATING_TEXT = false;
const SHOW_ORE_PICKUP_FLOATING_TEXT = true;
const DEFAULT_OUTLINE_COLOR = "rgba(13, 21, 34, 0.96)";

export function createFloatingTextSystem({ getFloatingTexts, setFloatingTexts }) {
  function spawnFloatingText(floatingText) {
    getFloatingTexts().push(floatingText);
  }

  function spawnOreCountText({
    count,
    itemId,
    normalCount,
    originX,
    originY,
    color,
    vx,
    vy,
    life = FLOATING_TEXT_LIFETIME,
  }) {
    if (!itemId || count <= 0) {
      return;
    }

    const resolvedNormalCount = normalCount ?? count;
    const resolvedColor = color ?? (count < resolvedNormalCount
      ? "#f1bb81"
      : count > resolvedNormalCount
      ? "#9be38d"
      : "#f2ede3");

    spawnFloatingText({
      text: String(count),
      x: originX,
      y: originY,
      vx,
      vy,
      life,
      maxLife: life,
      color: resolvedColor,
      outlineColor: DEFAULT_OUTLINE_COLOR,
      iconItemId: itemId,
    });
  }

  return {
    update(dt) {
      setFloatingTexts(
        getFloatingTexts()
          .map((floatingText) => ({
            ...floatingText,
            life: floatingText.life - dt,
            x: floatingText.x + floatingText.vx * dt,
            y: floatingText.y + floatingText.vy * dt,
            vy: floatingText.vy - FLOATING_TEXT_GRAVITY * dt,
          }))
          .filter((floatingText) => floatingText.life > 0),
      );
    },

    spawnCombatText(miningResult) {
      if (!miningResult.hit || (miningResult.damageDealt ?? 0) <= 0) {
        return;
      }

      spawnFloatingText({
        text: String(Math.ceil(miningResult.damageDealt)),
        x: miningResult.target.column * 32 - FLOATING_TEXT_SPAWN_RADIUS,
        y: miningResult.target.row * 32 - FLOATING_TEXT_SPAWN_RADIUS,
        vx: -(10 + Math.random() * 18),
        vy: -(42 + Math.random() * 18),
        life: FLOATING_TEXT_LIFETIME,
        maxLife: FLOATING_TEXT_LIFETIME,
        color: miningResult.critical ? "#f2d15f" : "#f2ede3",
        outlineColor: DEFAULT_OUTLINE_COLOR,
      });
    },

    spawnOreCountText,

    spawnOreYieldText(miningResult) {
      if (!miningResult.resource || (miningResult.dropCount ?? 0) <= 0) {
        return;
      }

      const isLuckCriticalYield = (miningResult.bonusDropCount ?? 0) > 0;
      if (!SHOW_ORE_YIELD_FLOATING_TEXT && !isLuckCriticalYield) {
        return;
      }

      spawnOreCountText({
        count: miningResult.dropCount,
        itemId: miningResult.resource,
        normalCount: miningResult.normalDropCount ?? miningResult.dropCount ?? 1,
        originX: (miningResult.column + 1) * 32 + FLOATING_TEXT_SPAWN_RADIUS,
        originY: miningResult.row * 32 - FLOATING_TEXT_SPAWN_RADIUS,
        vx: 10 + Math.random() * 18,
        vy: -(40 + Math.random() * 16),
      });
    },

    spawnLuckBonusText(miningResult) {
      if ((miningResult.bonusDropCount ?? 0) <= 0) {
        return;
      }

      spawnFloatingText({
        text: `+${miningResult.bonusDropCount}`,
        x: (miningResult.column + 1) * 32 + FLOATING_TEXT_SPAWN_RADIUS,
        y: miningResult.row * 32 - FLOATING_TEXT_SPAWN_RADIUS,
        vx: 8 + Math.random() * 14,
        vy: -(54 + Math.random() * 14),
        life: FLOATING_TEXT_LIFETIME * 0.95,
        maxLife: FLOATING_TEXT_LIFETIME * 0.95,
        color: "#72d66a",
        outlineColor: DEFAULT_OUTLINE_COLOR,
      });
    },

    spawnPickupText({ itemId, originX, originY }) {
      if (!SHOW_ORE_PICKUP_FLOATING_TEXT) {
        return;
      }

      spawnOreCountText({
        count: 1,
        itemId,
        normalCount: 1,
        originX,
        originY,
        color: "#9be38d",
        vx: 8 + Math.random() * 12,
        vy: -(34 + Math.random() * 14),
        life: FLOATING_TEXT_LIFETIME * 0.85,
      });
    },
  };
}