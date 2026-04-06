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
    const left = column * 32;
    const top = row * 32;
    const right = left + 32;
    const bottom = top + 32;
    return !(player.x + player.width <= left || player.x >= right || player.y + player.height <= top || player.y >= bottom);
  }

  function getPlatformPlacementTarget() {
    const world = getWorld();
    const player = getPlayer();
    const pointerWorld = input.getPointerWorld(renderer);
    if (!pointerWorld) {
      return null;
    }

    const column = Math.floor(pointerWorld.x / 32);
    const row = Math.floor(pointerWorld.y / 32);
    if (!world.canPlacePlatform(column, row)) {
      return null;
    }

    const playerCenter = player.getCenter();
    const targetCenterX = column * 32 + 16;
    const targetCenterY = row * 32 + 16;
    if (Math.hypot(targetCenterX - playerCenter.x, targetCenterY - playerCenter.y) > PLATFORM_PLACE_RANGE_TILES * 32) {
      return null;
    }

    if (!hasLineOfSightToCell(playerCenter, { x: targetCenterX, y: targetCenterY }, column, row)) {
      return null;
    }

    if (playerOccupiesCell(column, row)) {
      return null;
    }

    return { column, row };
  }

  return {
    update() {
      if (gameState.phase !== "playing" || getPlatformCapacity() <= 0 || gameState.platformCharges <= 0 || !input.wasPressed("placePlatform")) {
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