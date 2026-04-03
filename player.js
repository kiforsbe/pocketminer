import { TILE_SIZE } from "./tile.js";

const PLAYER_WIDTH = 22;
const PLAYER_HEIGHT = 28;
const MOVE_SPEED = 200;
const GRAVITY = 1400;
const JUMP_SPEED = 460;
const MAX_FALL_SPEED = 920;
const MINING_POWER = 38;
const FOOTSTEP_DISTANCE = 56;

const ANIMATION_SETS = {
  idle: { start: 0, frames: 4, fps: 5 },
  walk: { start: 4, frames: 6, fps: 10 },
  mining: { start: 10, frames: 4, fps: 12 },
};

export class Player {
  constructor({ x, y }) {
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
    this.currentMiningTarget = null;
    this.footstepDistance = 0;
  }

  update(dt, input, world) {
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

    this.vx = direction * MOVE_SPEED;

    if (input.wasPressed("jump") && this.grounded) {
      this.vy = -JUMP_SPEED;
      this.grounded = false;
    }

    this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);

    const previousX = this.x;
    this.x += this.vx * dt;
    this.#resolveHorizontal(world);
    const movedX = Math.abs(this.x - previousX);

    this.y += this.vy * dt;
    this.grounded = false;
    this.#resolveVertical(world);

    const mining = input.isDown("mine");
    if (mining) {
      this.animation = "mining";
      this.currentMiningTarget = this.getMiningTarget(world);
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
  }

  getMiningTarget(world) {
    const originX = this.facing > 0 ? this.x + this.width + 6 : this.x - 6;
    const probeRows = [
      this.y + this.height * 0.38,
      this.y + this.height * 0.68,
      this.y + this.height * 0.92,
    ];

    for (const probeY of probeRows) {
      const column = Math.floor(originX / TILE_SIZE);
      const row = Math.floor(probeY / TILE_SIZE);
      const tile = world.getTile(column, row);
      if (tile?.solid) {
        return { column, row, tile };
      }
    }

    return null;
  }

  mine(dt, world) {
    const target = this.currentMiningTarget ?? this.getMiningTarget(world);

    if (!target) {
      return { active: false, hit: false, broken: false, resource: null, target: null };
    }

    this.currentMiningTarget = target;
    const result = world.damageTile(target.column, target.row, MINING_POWER * dt);
    return { active: true, target, ...result };
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

  getAnimationFrame() {
    const { start, frames, fps } = ANIMATION_SETS[this.animation] ?? ANIMATION_SETS.idle;
    const frame = Math.floor(this.animationTime * fps) % frames;
    return start + frame;
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

  #resolveVertical(world) {
    if (this.vy === 0) {
      return;
    }

    const movingDown = this.vy > 0;
    const checkY = movingDown ? this.y + this.height : this.y;
    const startColumn = Math.floor((this.x + 2) / TILE_SIZE);
    const endColumn = Math.floor((this.x + this.width - 2) / TILE_SIZE);
    const row = Math.floor(checkY / TILE_SIZE);

    for (let column = startColumn; column <= endColumn; column += 1) {
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
      break;
    }
  }
}