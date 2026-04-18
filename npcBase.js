import { PLATFORM_SURFACE_OFFSET, TILE_SIZE } from "./tile.js";

const DEFAULT_GRAVITY = 1400;
const DEFAULT_MAX_FALL_SPEED = 920;

function sampleRange([min, max], randomValue) {
  if (max <= min) {
    return min;
  }

  return min + (max - min) * randomValue;
}

export class NpcBase {
  constructor({
    x,
    y,
    width,
    height,
    moveSpeed,
    jumpHeightBlocks,
    gravity = DEFAULT_GRAVITY,
    maxFallSpeed = DEFAULT_MAX_FALL_SPEED,
    idleDurationRange = [0.45, 0.95],
    wanderDurationRange = [0.9, 1.7],
  }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.moveSpeed = moveSpeed;
    this.jumpHeightBlocks = jumpHeightBlocks;
    this.gravity = gravity;
    this.maxFallSpeed = maxFallSpeed;
    this.jumpSpeed = Math.sqrt(2 * this.gravity * (this.jumpHeightBlocks * TILE_SIZE));
    this.idleDurationRange = idleDurationRange;
    this.wanderDurationRange = wanderDurationRange;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.moveDirection = 0;
    this.behavior = "idle";
    this.behaviorTimeRemaining = 0;
    this.animationState = "idle";
    this.animationTime = 0;
    this.column = Math.floor(this.x / TILE_SIZE);
    this.row = Math.floor(this.y / TILE_SIZE);
    this.horizontalCollision = false;
  }

  update(dt, world, { behaviorEnabled = true, forcedAnimationState = null } = {}) {
    if (behaviorEnabled) {
      this.updateBehavior(dt, world);
    } else {
      this.moveDirection = 0;
    }

    this.vx = this.moveDirection * this.moveSpeed;
    this.vy = Math.min(this.maxFallSpeed, this.vy + this.gravity * dt);

    const previousX = this.x;
    this.x += this.vx * dt;
    this.horizontalCollision = false;
    this.resolveHorizontal(world);

    const previousY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;
    this.resolveVertical(world, previousY);
    this.clampHorizontal(world);

    this.column = Math.floor((this.x + this.width * 0.5) / TILE_SIZE);
    this.row = Math.floor((this.y + this.height * 0.5) / TILE_SIZE);
    this.afterPhysics(dt, world, { previousX, previousY });

    this.setAnimationState(forcedAnimationState ?? this.getDefaultAnimationState());
    this.animationTime += dt;
  }

  updateBehavior(dt, world) {
    const randomValue = typeof world?.random === "function" ? world.random() : Math.random();

    if (this.behaviorTimeRemaining <= 0) {
      this.chooseNextBehavior(randomValue);
    }

    this.behaviorTimeRemaining = Math.max(0, this.behaviorTimeRemaining - dt);

    if (this.behavior === "wander") {
      if (this.grounded && this.shouldJumpToNearbyBlock(world)) {
        this.jump();
      }
      this.moveDirection = this.facing;
    } else {
      this.moveDirection = 0;
    }
  }

  chooseNextBehavior(randomValue) {
    if (this.behavior === "wander") {
      this.behavior = "idle";
      this.behaviorTimeRemaining = sampleRange(this.idleDurationRange, randomValue);
      this.moveDirection = 0;
      return;
    }

    this.behavior = "wander";
    this.behaviorTimeRemaining = sampleRange(this.wanderDurationRange, randomValue);
    this.facing = randomValue < 0.5 ? -1 : 1;
    this.moveDirection = this.facing;
  }

  shouldJumpToNearbyBlock(world) {
    if (!this.grounded || this.moveDirection === 0) {
      return false;
    }

    const direction = this.moveDirection;
    const frontColumn = direction > 0
      ? Math.floor((this.x + this.width + 1) / TILE_SIZE)
      : Math.floor((this.x - 1) / TILE_SIZE);
    const supportRow = Math.floor((this.y + this.height + 1) / TILE_SIZE);
    const minSupportRow = Math.max(0, supportRow - this.jumpHeightBlocks);

    for (let candidateSupportRow = supportRow - 1; candidateSupportRow >= minSupportRow; candidateSupportRow -= 1) {
      if (!this.hasSupportTile(world, frontColumn, candidateSupportRow)) {
        continue;
      }

      const landingY = candidateSupportRow * TILE_SIZE - this.height - 0.01;
      const landingX = direction > 0
        ? frontColumn * TILE_SIZE + 1
        : (frontColumn + 1) * TILE_SIZE - this.width - 1;
      if (this.canOccupy(world, landingX, landingY)) {
        return true;
      }
    }

    return false;
  }

  hasSupportTile(world, column, row) {
    return world.isSolid(column, row) || world.isPlatform(column, row);
  }

  canOccupy(world, x, y) {
    const inset = 1;
    const left = x + inset;
    const right = x + this.width - inset;
    const top = y + inset;
    const bottom = y + this.height - inset;
    const startColumn = Math.floor(left / TILE_SIZE);
    const endColumn = Math.floor(right / TILE_SIZE);
    const startRow = Math.floor(top / TILE_SIZE);
    const endRow = Math.floor(bottom / TILE_SIZE);

    if (left < 0 || right > world.pixelWidth || top < 0 || bottom > world.pixelHeight) {
      return false;
    }

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        if (world.isSolid(column, row)) {
          return false;
        }
      }
    }

    return true;
  }

  jump() {
    if (!this.grounded) {
      return;
    }

    this.vy = -this.jumpSpeed;
    this.grounded = false;
  }

  resolveHorizontal(world) {
    if (this.vx === 0) {
      return;
    }

    const movingRight = this.vx > 0;
    const checkX = movingRight ? this.x + this.width : this.x;
    const startRow = Math.floor((this.y + 2) / TILE_SIZE);
    const endRow = Math.floor((this.y + this.height - 2) / TILE_SIZE);
    const column = Math.floor(checkX / TILE_SIZE);

    for (let row = startRow; row <= endRow; row += 1) {
      if (!world.isSolid(column, row)) {
        continue;
      }

      if (movingRight) {
        this.x = column * TILE_SIZE - this.width - 0.01;
      } else {
        this.x = (column + 1) * TILE_SIZE + 0.01;
      }

      this.vx = 0;
      this.horizontalCollision = true;
      break;
    }
  }

  resolveVertical(world, previousY) {
    if (this.vy === 0) {
      return;
    }

    const movingDown = this.vy > 0;
    const checkY = movingDown ? this.y + this.height : this.y;
    const startColumn = Math.floor((this.x + 2) / TILE_SIZE);
    const endColumn = Math.floor((this.x + this.width - 2) / TILE_SIZE);
    const row = Math.floor(checkY / TILE_SIZE);
    const previousBottom = previousY + this.height;

    for (let column = startColumn; column <= endColumn; column += 1) {
      if (movingDown && world.isPlatform(column, row)) {
        const platformY = row * TILE_SIZE + PLATFORM_SURFACE_OFFSET;
        const currentBottom = this.y + this.height;
        if (previousBottom <= platformY && currentBottom >= platformY) {
          this.y = platformY - this.height - 0.01;
          this.grounded = true;
          this.vy = 0;
          return;
        }
      }

      if (!world.isSolid(column, row)) {
        continue;
      }

      if (movingDown) {
        this.y = row * TILE_SIZE - this.height - 0.01;
        this.grounded = true;
      } else {
        this.y = (row + 1) * TILE_SIZE + 0.01;
      }

      this.vy = 0;
      return;
    }
  }

  clampHorizontal(world) {
    const maxX = Math.max(0, world.pixelWidth - this.width);
    this.x = Math.max(0, Math.min(this.x, maxX));
  }

  afterPhysics(_dt, world) {
    if (this.horizontalCollision && this.grounded) {
      const randomValue = typeof world?.random === "function" ? world.random() : Math.random();
      this.behavior = "idle";
      this.behaviorTimeRemaining = sampleRange(this.idleDurationRange, randomValue);
      this.moveDirection = 0;
      this.facing *= -1;
    }
  }

  getDefaultAnimationState() {
    if (!this.grounded) {
      return "jump";
    }

    return Math.abs(this.vx) > 1 ? "walk" : "idle";
  }

  setAnimationState(nextAnimationState) {
    if (this.animationState === nextAnimationState) {
      return;
    }

    this.animationState = nextAnimationState;
    this.animationTime = 0;
  }

  getCenter() {
    return {
      x: this.x + this.width * 0.5,
      y: this.y + this.height * 0.5,
    };
  }
}