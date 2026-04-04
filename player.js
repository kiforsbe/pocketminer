import { PLATFORM_SURFACE_OFFSET, TILE_SIZE } from "./tile.js";

const PLAYER_WIDTH = 22;
const PLAYER_HEIGHT = 28;
const MOVE_SPEED = 200;
const GRAVITY = 1400;
const JUMP_SPEED = 460;
const MAX_FALL_SPEED = 920;
const DEFAULT_MINING_POWER = 60;
const FOOTSTEP_DISTANCE = 56;
const MINING_RANGE_TILES = 3;
const MINING_SWING_INTERVAL = 0.6;
const MINING_SWING_DAMAGE_WINDOW = 0.18;
const JUMP_LAND_DELAY = 0.1;
const DEFAULT_PLAYER_BONUSES = Object.freeze({
  moveSpeed: 0,
  jumpPower: 0,
  swingRate: 0,
  toolDamage: 0,
});

const ANIMATION_SETS = {
  idle: { start: 0, frames: 4, fps: 5 },
  walk: { start: 4, frames: 6, fps: 10 },
  mining: { start: 10, frames: 4 },
};

export class Player {
  constructor({ x, y, miningPower = DEFAULT_MINING_POWER, bonuses = DEFAULT_PLAYER_BONUSES }) {
    this.x = x;
    this.y = y;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.animation = "idle";
    this.animationTime = 0;
    this.mineCooldown = 0;
    this.jumpLockout = 0;
    this.jumpedThisFrame = false;
    this.currentMiningTarget = null;
    this.footstepDistance = 0;
    this.baseMiningPower = miningPower;
    this.bonuses = { ...DEFAULT_PLAYER_BONUSES };
    this.setPermanentBonuses(bonuses);
  }

  update(dt, input, world) {
    this.mineCooldown = Math.max(0, this.mineCooldown - dt);
    this.jumpLockout = Math.max(0, this.jumpLockout - dt);
    this.jumpedThisFrame = false;
    const jumpHeld = input.isDown("jump");
    const wasGrounded = this.grounded;

    let direction = 0;
    if (input.isDown("left")) {
      direction -= 1;
    }
    if (input.isDown("right")) {
      direction += 1;
    }

    if (direction !== 0) {
      this.facing = Math.sign(direction);
    }

    this.vx = direction * this.getMoveSpeed();

    if (input.wasPressed("jump") && this.#canJump()) {
      this.#jump();
    }

    this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);

    const previousX = this.x;
    this.x += this.vx * dt;
    this.#resolveHorizontal(world);
    this.#clampHorizontal(world);
    const movedX = Math.abs(this.x - previousX);

    const previousY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;
    this.#resolveVertical(world, previousY);

    if (!wasGrounded && this.grounded) {
      this.jumpLockout = JUMP_LAND_DELAY;
    }

    if (jumpHeld && this.#canJump()) {
      this.#jump();
    }

    const hoverTarget = this.getMiningTarget(world, input.getPointerWorld?.(this.rendererContext));
    const mining = input.isDown("mine");
    if (hoverTarget) {
      this.facing = hoverTarget.column * TILE_SIZE + TILE_SIZE * 0.5 >= this.getCenter().x ? 1 : -1;
    }

    if (mining && hoverTarget) {
      this.animation = "mining";
      this.currentMiningTarget = hoverTarget;
    } else if (Math.abs(this.vx) > 1 && this.grounded) {
      this.animation = "walk";
      this.currentMiningTarget = null;
    } else {
      this.animation = "idle";
      this.currentMiningTarget = null;
    }

    if (this.animation !== "walk") {
      this.footstepDistance = 0;
    } else {
      this.footstepDistance += movedX;
    }

    this.animationTime += dt;
    return hoverTarget;
  }

  getMiningTarget(world, pointerWorld) {
    if (!pointerWorld) {
      return null;
    }

    const column = Math.floor(pointerWorld.x / TILE_SIZE);
    const row = Math.floor(pointerWorld.y / TILE_SIZE);
    const tile = world.getTile(column, row);
    if (!tile?.solid) {
      return null;
    }

    const playerCenter = this.getCenter();
    const tileCenterX = column * TILE_SIZE + TILE_SIZE * 0.5;
    const tileCenterY = row * TILE_SIZE + TILE_SIZE * 0.5;
    const reach = MINING_RANGE_TILES * TILE_SIZE;
    const distance = Math.hypot(tileCenterX - playerCenter.x, tileCenterY - playerCenter.y);
    if (distance > reach) {
      return null;
    }

    return { column, row, tile, distance };
  }

  mine(dt, world) {
    const target = this.currentMiningTarget;

    if (!target) {
      return { active: false, hit: false, broken: false, resource: null, target: null };
    }

    this.currentMiningTarget = target;
    if (this.mineCooldown > 0) {
      return { active: true, hit: false, broken: false, resource: null, target };
    }

    this.mineCooldown = this.getMiningSwingInterval();
    const result = world.damageTile(target.column, target.row, this.getMiningDamage());
    return { active: true, target, ...result };
  }

  setMiningPower(miningPower) {
    this.baseMiningPower = miningPower;
  }

  setPermanentBonuses(bonuses = DEFAULT_PLAYER_BONUSES) {
    this.bonuses = {
      ...DEFAULT_PLAYER_BONUSES,
      ...bonuses,
    };
  }

  setRendererContext(renderer) {
    this.rendererContext = renderer;
  }

  consumeFootstep() {
    if (!this.grounded || this.animation !== "walk") {
      return false;
    }

    if (this.footstepDistance < FOOTSTEP_DISTANCE) {
      return false;
    }

    this.footstepDistance = 0;
    return true;
  }

  consumeJump() {
    if (!this.jumpedThisFrame) {
      return false;
    }

    this.jumpedThisFrame = false;
    return true;
  }

  getAnimationFrame() {
    const animationSet = ANIMATION_SETS[this.animation] ?? ANIMATION_SETS.idle;
    const fps = this.animation === "mining"
      ? animationSet.frames / this.getMiningSwingInterval()
      : animationSet.fps;
    const { start, frames } = animationSet;
    const frame = Math.floor(this.animationTime * fps) % frames;
    return start + frame;
  }

  getMoveSpeed() {
    return MOVE_SPEED * (1 + this.bonuses.moveSpeed);
  }

  getJumpSpeed() {
    return JUMP_SPEED * (1 + this.bonuses.jumpPower);
  }

  getMiningSwingInterval() {
    return MINING_SWING_INTERVAL / (1 + this.bonuses.swingRate);
  }

  getMiningDamage() {
    return this.baseMiningPower * (1 + this.bonuses.toolDamage) * MINING_SWING_DAMAGE_WINDOW;
  }

  getCenter() {
    return {
      x: this.x + this.width * 0.5,
      y: this.y + this.height * 0.5,
    };
  }

  #resolveHorizontal(world) {
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
      break;
    }
  }

  #resolveVertical(world, previousY) {
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
          break;
        }
      }

      if (world.isSolid(column, row)) {
        if (movingDown) {
          this.y = row * TILE_SIZE - this.height - 0.01;
          this.grounded = true;
        } else {
          this.y = (row + 1) * TILE_SIZE + 0.01;
        }

        this.vy = 0;
        break;
      }
    }
  }

  #clampHorizontal(world) {
    const maxX = Math.max(0, world.pixelWidth - this.width);
    this.x = Math.max(0, Math.min(this.x, maxX));
  }

  #jump() {
    this.vy = -this.getJumpSpeed();
    this.grounded = false;
    this.jumpedThisFrame = true;
  }

  #canJump() {
    return this.grounded && this.jumpLockout <= 0;
  }
}