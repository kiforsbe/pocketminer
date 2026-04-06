const BOMB_PLACE_RANGE_TILES = 6;
const TILE_SIZE = 32;
const BOMB_FALL_GRAVITY = 1400;

export const BOMB_FUSE_SECONDS = 2;

export function createBombSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer,
  getWorld,
  getBombCapacity,
  getBombCooldownDuration,
  onDetonate,
}) {
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
    const capacity = getBombCapacity();
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
      gameState.bombCooldown = gameState.bombCharges < capacity ? getBombCooldownDuration() : 0;
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
    if (gameState.phase !== "playing" || getBombCapacity() <= 0 || gameState.bombCharges <= 0 || !input.wasPressed("placeBomb")) {
      return;
    }

    const target = getPlacementTarget();
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
    });
    gameState.bombCharges = Math.max(0, gameState.bombCharges - 1);
    if (gameState.bombCharges < getBombCapacity() && gameState.bombCooldown <= 0) {
      gameState.bombCooldown = getBombCooldownDuration();
    }
    audio.playSound("bombFuse", { volume: 0.28 });
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
      onDetonate(bomb);
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
  };
}