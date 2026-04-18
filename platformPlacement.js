import { TILE_SIZE } from "./tile.js";

const PLATFORM_PLACE_RANGE_TILES = 6;

export function createPlatformPlacementSystem({
  gameState,
  input,
  renderer,
  audio,
  getPlayer,
  getWorld,
  getPlatformCapacity,
  getPlatformCooldownDuration,
}) {
  function hasLineOfSightToCell(origin, target, targetColumn, targetRow) {
    const world = getWorld();
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const sampleX = origin.x + (target.x - origin.x) * progress;
      const sampleY = origin.y + (target.y - origin.y) * progress;
      const column = Math.floor(sampleX / 32);
      const row = Math.floor(sampleY / 32);
      if (column === targetColumn && row === targetRow) {
        return true;
      }
      if (world.isSolid(column, row)) {
        return false;
      }
    }

    return true;
  }

  function playerOccupiesCell(column, row) {
    const player = getPlayer();
    const left = column * TILE_SIZE;
    const top = row * TILE_SIZE;
    const right = left + TILE_SIZE;
    const bottom = top + TILE_SIZE;
    return !(player.x + player.width <= left || player.x >= right || player.y + player.height <= top || player.y >= bottom);
  }

  function getPlatformPlacementTarget() {
    const world = getWorld();
    const player = getPlayer();
    const aimWorld = input.getPlacementAimWorld?.({
      player,
      renderer,
      maxRangeTiles: PLATFORM_PLACE_RANGE_TILES,
    });
    if (!aimWorld) {
      return null;
    }

    const column = Math.floor(aimWorld.x / TILE_SIZE);
    const row = Math.floor(aimWorld.y / TILE_SIZE);

    if (!world.canPlacePlatform(column, row) && !playerOccupiesCell(column, row)) {
      return null;
    }

    const playerCenter = player.getCenter();
    const targetCenterX = column * TILE_SIZE + TILE_SIZE * 0.5;
    const targetCenterY = row * TILE_SIZE + TILE_SIZE * 0.5;
    if (Math.hypot(targetCenterX - playerCenter.x, targetCenterY - playerCenter.y) > PLATFORM_PLACE_RANGE_TILES * TILE_SIZE) {
      return null;
    }

    if (!hasLineOfSightToCell(playerCenter, { x: targetCenterX, y: targetCenterY }, column, row)) {
      return null;
    }

    return { column, row };
  }

  return {
    update() {
      const platformIsPrimary = gameState.primaryTool === "platform";
      const usingPrimaryTool = gameState.primaryTool === "platform" && input.wasPressed("usePrimaryTool");
      const usingPlatformKey = platformIsPrimary ? input.wasPressed("placePlatform") : input.wasPressed("placeBomb");
      const usingGamepadTool = (platformIsPrimary && input.wasReleased("leftTool"))
        || (!platformIsPrimary && input.wasReleased("rightTool"));
      const previewingGamepadTool = (platformIsPrimary && input.isDown("leftTool"))
        || (!platformIsPrimary && input.isDown("rightTool"));
      if (previewingGamepadTool) {
        gameState.hoverTarget = getPlatformPlacementTarget();
      }

      if (
        gameState.phase !== "playing"
        || getPlatformCapacity() <= 0
        || gameState.platformCharges <= 0
        || !(usingPlatformKey || usingPrimaryTool || usingGamepadTool)
      ) {
        return;
      }

      const world = getWorld();
      const target = getPlatformPlacementTarget();
      if (!target) {
        return;
      }

      if (!world.placePlatform(target.column, target.row)) {
        return;
      }

      gameState.platformCharges = Math.max(0, gameState.platformCharges - 1);
      if (gameState.platformCharges < getPlatformCapacity() && gameState.platformCooldown <= 0) {
        gameState.platformCooldown = getPlatformCooldownDuration();
      }
      audio.playSound("blockBreak", { playbackRate: 1.24, volume: 0.16 });
    },
  };
}