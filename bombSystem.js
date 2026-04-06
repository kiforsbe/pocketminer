import { TILE_SIZE } from "./tile.js";
import { BOMB_CAPACITY_ROOT_ID, BOMB_TYPE_ROOT_ID, getToolDefinition } from "./tools.js";

const BOMB_PLACE_RANGE_TILES = 6;
const BOMB_FALL_GRAVITY = 1400;
const BOMB_COOLDOWN_SECONDS = 3;
const BOMB_BLAST_RADIUS = 1;
const DEFAULT_BOMB_DAMAGE = 10;
const DEFAULT_BOMB_BLAST_RADIUS = 1;
const BOMB_PLAYER_IMPULSE_RADIUS = TILE_SIZE * 2.25;
const BOMB_PLAYER_MAX_IMPULSE = 540;

export const BOMB_FUSE_SECONDS = 2;

export function createBombSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer,
  getWorld,
  floatingTextSystem,
  particleSystem,
  onBrokenTileResult,
}) {
  function isBombsUnlocked() {
    return Boolean(gameState.bombUnlockId);
  }

  function getCurrentBombTypeDefinition() {
    if (!isBombsUnlocked()) {
      return null;
    }

    return getToolDefinition(gameState.bombTypeUpgradeId ?? BOMB_TYPE_ROOT_ID);
  }

  function getCurrentBombCapacityDefinition() {
    if (!isBombsUnlocked()) {
      return null;
    }

    return getToolDefinition(gameState.bombCapacityUpgradeId ?? BOMB_CAPACITY_ROOT_ID);
  }

  function getCurrentCooldownDuration() {
    return BOMB_COOLDOWN_SECONDS / (1 + (gameState.playerBonuses.bombRestock ?? 0));
  }

  function getCurrentCapacity() {
    return getCurrentBombCapacityDefinition()?.bombCapacity ?? 0;
  }

  function getBlastDistanceLimit(blastRadius) {
    return blastRadius <= 1 ? Math.SQRT2 : blastRadius;
  }

  function getBlastOffsets(blastRadius) {
    const distanceLimit = getBlastDistanceLimit(blastRadius);
    const maxOffset = Math.ceil(distanceLimit);
    const offsets = [];

    for (let rowOffset = -maxOffset; rowOffset <= maxOffset; rowOffset += 1) {
      for (let columnOffset = -maxOffset; columnOffset <= maxOffset; columnOffset += 1) {
        if (columnOffset === 0 && rowOffset === 0) {
          continue;
        }

        if (Math.hypot(columnOffset, rowOffset) > distanceLimit) {
          continue;
        }

        offsets.push({ columnOffset, rowOffset });
      }
    }

    return offsets;
  }

  function hasLineOfSightToCell(origin, target, targetColumn, targetRow) {
    const world = getWorld();
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const sampleX = origin.x + (target.x - origin.x) * progress;
      const sampleY = origin.y + (target.y - origin.y) * progress;
      const column = Math.floor(sampleX / TILE_SIZE);
      const row = Math.floor(sampleY / TILE_SIZE);
      if (column === targetColumn && row === targetRow) {
        return true;
      }
      if (world.isSolid(column, row)) {
        return false;
      }
    }

    return true;
  }

  function hasExplosionLineOfSight(origin, target) {
    const world = getWorld();
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const sampleX = origin.x + (target.x - origin.x) * progress;
      const sampleY = origin.y + (target.y - origin.y) * progress;
      const column = Math.floor(sampleX / TILE_SIZE);
      const row = Math.floor(sampleY / TILE_SIZE);
      if (world.isSolid(column, row)) {
        return false;
      }
    }

    return true;
  }

  function hasBombAt(column, row) {
    return gameState.bombs.some((bomb) => bomb.column === column && bomb.row === row);
  }

  function getPlacementTarget() {
    const world = getWorld();
    const player = getPlayer();
    const pointerWorld = input.getPointerWorld(renderer);
    if (!pointerWorld) {
      return null;
    }

    const column = Math.floor(pointerWorld.x / TILE_SIZE);
    const row = Math.floor(pointerWorld.y / TILE_SIZE);
    if (!world.canPlacePlatform(column, row) || hasBombAt(column, row)) {
      return null;
    }

    const playerCenter = player.getCenter();
    const targetCenterX = column * TILE_SIZE + TILE_SIZE * 0.5;
    const targetCenterY = row * TILE_SIZE + TILE_SIZE * 0.5;
    if (Math.hypot(targetCenterX - playerCenter.x, targetCenterY - playerCenter.y) > BOMB_PLACE_RANGE_TILES * TILE_SIZE) {
      return null;
    }

    if (!hasLineOfSightToCell(playerCenter, { x: targetCenterX, y: targetCenterY }, column, row)) {
      return null;
    }

    return {
      column,
      row,
      x: column * TILE_SIZE,
      y: row * TILE_SIZE,
    };
  }

  function refillChargesIfReady() {
    const capacity = getCurrentCapacity();
    if (capacity <= 0) {
      gameState.bombCharges = 0;
      gameState.bombCooldown = 0;
      return;
    }

    if (gameState.bombCharges > capacity) {
      gameState.bombCharges = capacity;
    }

    if (gameState.bombCharges >= capacity) {
      gameState.bombCooldown = 0;
      return;
    }

    if (gameState.bombCooldown <= 0) {
      gameState.bombCharges += 1;
      gameState.bombCooldown = gameState.bombCharges < capacity ? getCurrentCooldownDuration() : 0;
    }
  }

  function getBombRestingY(column, startRow) {
    const world = getWorld();
    for (let row = Math.max(0, startRow + 1); row < world.rows; row += 1) {
      if (world.isSolid(column, row) || world.isPlatform(column, row)) {
        return (row - 1) * TILE_SIZE;
      }
    }

    return Math.max(0, (world.rows - 1) * TILE_SIZE);
  }

  function placeBomb() {
    const bombIsPrimary = gameState.primaryTool === "bomb";
    const usingPrimaryTool = bombIsPrimary && input.wasPressed("usePrimaryTool");
    const usingBombKey = bombIsPrimary ? input.wasPressed("placePlatform") : input.wasPressed("placeBomb");
    if (
      gameState.phase !== "playing"
      || getCurrentCapacity() <= 0
      || gameState.bombCharges <= 0
      || !(usingBombKey || usingPrimaryTool)
    ) {
      return;
    }

    const target = getPlacementTarget();
    const currentBomb = getCurrentBombTypeDefinition();
    if (!target) {
      return;
    }

    gameState.bombs.push({
      column: target.column,
      row: target.row,
      x: target.x,
      y: target.y,
      vy: 0,
      fuseRemaining: BOMB_FUSE_SECONDS,
      animationElapsed: 0,
      damage: currentBomb?.bombDamage ?? DEFAULT_BOMB_DAMAGE,
      blastRadius: currentBomb?.bombBlastRadius ?? DEFAULT_BOMB_BLAST_RADIUS,
      spriteRow: currentBomb?.bombSpriteRow ?? 0,
    });
    gameState.bombCharges = Math.max(0, gameState.bombCharges - 1);
    if (gameState.bombCharges < getCurrentCapacity() && gameState.bombCooldown <= 0) {
      gameState.bombCooldown = getCurrentCooldownDuration();
    }
    audio.playSound("bombFuse", { volume: 0.28 });
  }

  function applyImpulseToPlayer(bomb) {
    const player = getPlayer();
    const bombCenter = {
      x: bomb.column * TILE_SIZE + TILE_SIZE * 0.5,
      y: bomb.row * TILE_SIZE + TILE_SIZE * 0.5,
    };
    const playerCenter = player.getCenter();
    const dx = playerCenter.x - bombCenter.x;
    const dy = playerCenter.y - bombCenter.y;
    const distance = Math.hypot(dx, dy);

    if (distance > BOMB_PLAYER_IMPULSE_RADIUS) {
      return;
    }

    if (!hasExplosionLineOfSight(bombCenter, playerCenter)) {
      return;
    }

    const falloff = Math.max(0, 1 - distance / BOMB_PLAYER_IMPULSE_RADIUS);
    if (falloff <= 0) {
      return;
    }

    const safeDistance = Math.max(6, distance);
    const directionX = distance < 6 ? 0 : dx / safeDistance;
    const directionY = distance < 6 ? -1 : dy / safeDistance;
    const force = BOMB_PLAYER_MAX_IMPULSE * falloff;
    player.applyImpulse({
      x: directionX * force,
      y: directionY * force,
    });
  }

  function detonateBomb(bomb) {
    const world = getWorld();
    let brokeAnyTile = false;
    let clearedAnyDebris = false;
    const blastTargets = [];
    const blastRadius = Math.max(0, bomb.blastRadius ?? BOMB_BLAST_RADIUS);

    audio.playSound("bombExplode", { volume: 0.34 });
    particleSystem.spawnExplosionBurst({
      x: bomb.column * TILE_SIZE + TILE_SIZE * 0.5,
      y: bomb.row * TILE_SIZE + TILE_SIZE * 0.5,
    });

    for (const { columnOffset, rowOffset } of getBlastOffsets(blastRadius)) {
      blastTargets.push({
        column: bomb.column + columnOffset,
        row: bomb.row + rowOffset,
      });
    }

    blastTargets
      .sort((left, right) => {
        if (left.row !== right.row) {
          return right.row - left.row;
        }

        return left.column - right.column;
      })
      .forEach(({ column, row }) => {
        if (world.clearDebris(column, row)) {
          clearedAnyDebris = true;
        }

        const bombDamage = (bomb.damage ?? DEFAULT_BOMB_DAMAGE) * (1 + (gameState.playerBonuses.bombDamage ?? 0));
        const miningResult = world.damageTile(column, row, bombDamage, { luck: gameState.playerBonuses.luck });
        if (miningResult.hit) {
          floatingTextSystem.spawnCombatText({
            ...miningResult,
            target: {
              column,
              row,
            },
          });
        }

        if (!miningResult.broken) {
          return;
        }

        brokeAnyTile = true;
        onBrokenTileResult(miningResult);
      });

    if (brokeAnyTile || clearedAnyDebris) {
      renderer.markTerrainDirty();
    }

    applyImpulseToPlayer(bomb);
  }

  function updateActiveBombs(dt) {
    const detonations = [];
    gameState.bombs = gameState.bombs.filter((bomb) => {
      const currentRow = Math.floor(bomb.y / TILE_SIZE);
      const restingY = getBombRestingY(bomb.column, currentRow);
      const nextVy = bomb.y < restingY ? bomb.vy + BOMB_FALL_GRAVITY * dt : 0;
      const nextY = Math.min(restingY, bomb.y + nextVy * dt);
      const settled = nextY >= restingY;
      const nextBomb = {
        ...bomb,
        row: Math.floor(nextY / TILE_SIZE),
        y: nextY,
        vy: settled ? 0 : nextVy,
        fuseRemaining: bomb.fuseRemaining - dt,
        animationElapsed: bomb.animationElapsed + dt,
      };

      if (nextBomb.fuseRemaining <= 0) {
        detonations.push(nextBomb);
        return false;
      }

      bomb.row = nextBomb.row;
      bomb.y = nextBomb.y;
      bomb.vy = nextBomb.vy;
      bomb.fuseRemaining = nextBomb.fuseRemaining;
      bomb.animationElapsed = nextBomb.animationElapsed;
      return true;
    });

    for (const bomb of detonations) {
      detonateBomb(bomb);
    }
  }

  return {
    update(dt) {
      if (gameState.phase !== "playing") {
        return;
      }

      gameState.bombCooldown = Math.max(0, gameState.bombCooldown - dt);
      refillChargesIfReady();
      placeBomb();
      updateActiveBombs(dt);
    },

    refillCharges() {
      refillChargesIfReady();
    },

    getCapacity() {
      return getCurrentCapacity();
    },

    getCooldownDuration() {
      return getCurrentCooldownDuration();
    },
  };
}