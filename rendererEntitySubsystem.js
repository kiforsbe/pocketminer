import { ITEM_DEFINITIONS } from "./inventory.js";
import { RendererSubsystem } from "./rendererSubsystem.js";

const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 32;

export class RendererEntitySubsystem extends RendererSubsystem {
  constructor(renderer, worldRenderer) {
    super(renderer);
    this.worldRenderer = worldRenderer;
  }

  drawPlayer(player) {
    const drawX = Math.round(player.x - this.camera.x - (PLAYER_FRAME_WIDTH - player.width) * 0.5);
    const drawY = Math.round(player.y - this.camera.y - (PLAYER_FRAME_HEIGHT - player.height));
    const frame = player.getAnimationFrame();

    this.ctx.save();
    if (player.facing < 0) {
      this.ctx.translate(drawX + PLAYER_FRAME_WIDTH, drawY);
      this.ctx.scale(-1, 1);
      this.blitPlayerFrame(frame, 0, 0);
    } else {
      this.blitPlayerFrame(frame, drawX, drawY);
    }
    this.ctx.restore();
  }

  drawParticles(particles = []) {
    for (const particle of particles) {
      const x = particle.x - this.camera.x;
      const y = particle.y - this.camera.y;
      if (x < -24 || y < -24 || x > this.viewport.width + 24 || y > this.viewport.height + 24) {
        continue;
      }

      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(particle.rotation);
      this.ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      this.ctx.fillStyle = particle.glow;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, particle.size * 0.75, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(-particle.size * 0.5, -particle.size * 0.5, particle.size, particle.size);
      this.ctx.restore();
    }
  }

  drawPickups(pickups = []) {
    for (const pickup of pickups) {
      const x = pickup.x - this.camera.x;
      const y = pickup.y - this.camera.y + Math.sin(pickup.bobTime) * 2.5;
      if (x < -32 || y < -32 || x > this.viewport.width + 32 || y > this.viewport.height + 32) {
        continue;
      }

      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(pickup.rotation);
      if (pickup.kind === "treasure") {
        const pulse = 1 + Math.sin(pickup.bobTime * 2.4) * 0.12;
        this.ctx.fillStyle = pickup.glow;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, pickup.radius * 1.75 * pulse, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(255, 240, 190, 0.92)";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, pickup.radius * 1.28 * pulse, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.fillStyle = pickup.color;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -pickup.radius);
        this.ctx.lineTo(pickup.radius * 0.78, 0);
        this.ctx.lineTo(0, pickup.radius);
        this.ctx.lineTo(-pickup.radius * 0.78, 0);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.fillStyle = pickup.accent ?? "#fff2c4";
        this.ctx.fillRect(-2, -pickup.radius * 0.62, 4, pickup.radius * 1.24);
        this.ctx.fillRect(-pickup.radius * 0.62, -2, pickup.radius * 1.24, 4);
        this.ctx.restore();
        continue;
      }

      this.ctx.fillStyle = pickup.glow;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, pickup.radius * 1.15, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = pickup.color;
      this.ctx.fillRect(-pickup.radius * 0.55, -pickup.radius * 0.55, pickup.radius * 1.1, pickup.radius * 1.1);
      this.ctx.strokeStyle = "rgba(255, 240, 211, 0.5)";
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(-pickup.radius * 0.55, -pickup.radius * 0.55, pickup.radius * 1.1, pickup.radius * 1.1);
      this.ctx.restore();
    }
  }

  drawFloatingTexts(floatingTexts = []) {
    this.ctx.save();
    this.ctx.textBaseline = "middle";
    this.ctx.lineJoin = "round";
    this.ctx.font = "700 20.5px 'Segoe UI'";

    for (const floatingText of floatingTexts) {
      const x = floatingText.x - this.camera.x;
      const y = floatingText.y - this.camera.y;
      if (x < -48 || y < -48 || x > this.viewport.width + 48 || y > this.viewport.height + 48) {
        continue;
      }

      const lifeRatio = Math.max(0, floatingText.life / floatingText.maxLife);
      this.ctx.globalAlpha = 1 - (1 - lifeRatio) ** 4;
      const hasIcon = Boolean(floatingText.iconItemId && ITEM_DEFINITIONS[floatingText.iconItemId]);
      const iconSize = 11;
      const iconGap = hasIcon ? 7 : 0;
      const textWidth = this.ctx.measureText(floatingText.text).width;
      const totalWidth = textWidth + (hasIcon ? iconGap + iconSize : 0);
      const startX = x - totalWidth * 0.5;

      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = floatingText.outlineColor ?? "rgba(14, 21, 33, 0.95)";
      this.ctx.textAlign = "left";
      this.ctx.strokeText(floatingText.text, startX, y);
      this.ctx.fillStyle = floatingText.color;
      this.ctx.fillText(floatingText.text, startX, y);

      if (hasIcon) {
        const iconX = startX + textWidth + iconGap;
        this.worldRenderer.drawHotbarItemIcon(iconX, y - iconSize * 0.5, iconSize, floatingText.iconItemId);
      }
    }

    this.ctx.restore();
  }

  blitPlayerFrame(frame, x, y) {
    if (this.assets?.spritesheet) {
      this.ctx.drawImage(
        this.assets.spritesheet,
        frame * PLAYER_FRAME_WIDTH,
        0,
        PLAYER_FRAME_WIDTH,
        PLAYER_FRAME_HEIGHT,
        x,
        y,
        PLAYER_FRAME_WIDTH,
        PLAYER_FRAME_HEIGHT,
      );
      return;
    }

    this.ctx.fillStyle = "#e2a94b";
    this.ctx.fillRect(x + 8, y + 8, 16, 24);
  }

  drawBombs(bombs = []) {
    if (!bombs.length) {
      return;
    }

    const frameWidth = 32;
    const frameHeight = 32;
    const sheet = this.assets?.bombSpritesheet;
    const frameCount = sheet ? Math.max(1, Math.floor(sheet.width / frameWidth)) : 1;
    const rowCount = sheet ? Math.max(1, Math.floor(sheet.height / frameHeight)) : 1;

    for (const bomb of bombs) {
      const x = bomb.x - this.camera.x;
      const y = bomb.y - this.camera.y;
      if (x + frameWidth < 0 || y + frameHeight < 0 || x > this.viewport.width || y > this.viewport.height) {
        continue;
      }

      if (sheet) {
        const frame = Math.floor((bomb.animationElapsed * 8) % frameCount);
        const spriteRow = Math.max(0, Math.min(rowCount - 1, bomb.spriteRow ?? 0));
        this.ctx.drawImage(
          sheet,
          frame * frameWidth,
          spriteRow * frameHeight,
          frameWidth,
          frameHeight,
          x,
          y,
          frameWidth,
          frameHeight,
        );
        continue;
      }

      this.ctx.save();
      this.ctx.translate(x + 16, y + 16);
      this.ctx.fillStyle = "#1f1a21";
      this.ctx.beginPath();
      this.ctx.arc(0, 2, 10, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = "#b78356";
      this.ctx.fillRect(4, -10, 3, 8);
      this.ctx.fillStyle = "#ffb45a";
      this.ctx.fillRect(5, -13, 2, 3);
      this.ctx.restore();
    }
  }
}
