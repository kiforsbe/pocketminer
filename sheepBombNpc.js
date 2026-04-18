import { NpcBase } from "./npcBase.js";

const SHEEP_HITBOX_WIDTH = 24;
const SHEEP_HITBOX_HEIGHT = 24;
const SHEEP_SPRITE_WIDTH = 32;
const SHEEP_SPRITE_HEIGHT = 32;
const SHEEP_MOVE_SPEED = 84;
const SHEEP_JUMP_HEIGHT_BLOCKS = 4;
const SHEEP_INITIAL_COUNTDOWN_SECONDS = 2;
const SHEEP_WARNING_SECONDS = 0.8;
const SHEEP_EXPLOSION_SECONDS = 0.42;

export class SheepBombNpc extends NpcBase {
  constructor({ x, y, damage, blastRadius }) {
    super({
      x,
      y,
      width: SHEEP_HITBOX_WIDTH,
      height: SHEEP_HITBOX_HEIGHT,
      moveSpeed: SHEEP_MOVE_SPEED,
      jumpHeightBlocks: SHEEP_JUMP_HEIGHT_BLOCKS,
      idleDurationRange: [0.35, 0.9],
      wanderDurationRange: [0.8, 1.6],
    });

    this.kind = "dolly";
    this.damage = damage;
    this.blastRadius = blastRadius;
    this.spriteWidth = SHEEP_SPRITE_WIDTH;
    this.spriteHeight = SHEEP_SPRITE_HEIGHT;
    this.phase = "active";
    this.initialCountdownRemaining = SHEEP_INITIAL_COUNTDOWN_SECONDS;
    this.warningTimeRemaining = SHEEP_WARNING_SECONDS;
    this.explosionTimeRemaining = SHEEP_EXPLOSION_SECONDS;
    this.pendingDetonation = false;
    this.finished = false;
  }

  update(dt, world) {
    if (this.finished) {
      return;
    }

    if (this.phase === "active") {
      super.update(dt, world, { behaviorEnabled: true });
      this.initialCountdownRemaining = Math.max(0, this.initialCountdownRemaining - dt);
      if (this.initialCountdownRemaining <= 0) {
        this.phase = "warning";
      }
      return;
    }

    if (this.phase === "warning") {
      super.update(dt, world, { behaviorEnabled: false, forcedAnimationState: "warning" });
      this.warningTimeRemaining = Math.max(0, this.warningTimeRemaining - dt);
      if (this.warningTimeRemaining <= 0) {
        this.phase = "explode";
        this.pendingDetonation = true;
      }
      return;
    }

    if (this.phase === "explode") {
      super.update(dt, world, { behaviorEnabled: false, forcedAnimationState: "explode" });
      this.explosionTimeRemaining = Math.max(0, this.explosionTimeRemaining - dt);
      if (this.explosionTimeRemaining <= 0) {
        this.finished = true;
      }
    }
  }

  consumeDetonation() {
    if (!this.pendingDetonation) {
      return false;
    }

    this.pendingDetonation = false;
    return true;
  }

  isFinished() {
    return this.finished;
  }

  getCountdownText() {
    if (this.phase !== "active") {
      return null;
    }

    return this.initialCountdownRemaining.toFixed(1);
  }

  getDrawPosition(camera) {
    return {
      x: Math.round(this.x - camera.x - (this.spriteWidth - this.width) * 0.5),
      y: Math.round(this.y - camera.y - (this.spriteHeight - this.height)),
    };
  }

  getBlastOrigin() {
    const center = this.getCenter();
    return {
      x: center.x,
      y: center.y,
    };
  }

  getRenderState() {
    if (this.phase === "warning") {
      return {
        row: 3,
        frame: Math.min(4, Math.floor((1 - this.warningTimeRemaining / SHEEP_WARNING_SECONDS) * 5)),
      };
    }

    if (this.phase === "explode") {
      return {
        row: 4,
        frame: Math.min(2, Math.floor((1 - this.explosionTimeRemaining / SHEEP_EXPLOSION_SECONDS) * 3)),
      };
    }

    if (this.animationState === "walk") {
      return {
        row: 1,
        frame: Math.floor((this.animationTime * 8) % 5),
      };
    }

    if (this.animationState === "jump") {
      let frame = 1;
      if (this.vy < -80) {
        frame = 0;
      } else if (this.vy > 80) {
        frame = 2;
      }

      return {
        row: 2,
        frame,
      };
    }

    return {
      row: 0,
      frame: Math.floor((this.animationTime * 4) % 3),
    };
  }
}