import { ITEM_DEFINITIONS } from "./inventory.js";
import { RendererSubsystem } from "./rendererSubsystem.js";

const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 32;
const SHEEP_FRAME_COLUMNS = 7;
const SHEEP_FRAME_ROWS = 5;

class EntityTypeRenderer extends RendererSubsystem {
  isVisible(x, y, width, height, padding = 0) {
    return !(
      x + width < -padding
      || y + height < -padding
      || x > this.viewport.width + padding
      || y > this.viewport.height + padding
    );
  }

  drawSpriteFrame({
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destX,
    destY,
    destWidth = sourceWidth,
    destHeight = sourceHeight,
    flipX = false,
  }) {
    if (!image) {
      return false;
    }

    this.ctx.save();
    if (flipX) {
      this.ctx.translate(destX + destWidth, destY);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        destWidth,
        destHeight,
      );
    } else {
      this.ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        destX,
        destY,
        destWidth,
        destHeight,
      );
    }
    this.ctx.restore();
    return true;
  }

  drawSpriteSheetFrame({
    image,
    frame,
    row = 0,
    frameWidth,
    frameHeight,
    destX,
    destY,
    destWidth = frameWidth,
    destHeight = frameHeight,
    flipX = false,
  }) {
    return this.drawSpriteFrame({
      image,
      sourceX: frame * frameWidth,
      sourceY: row * frameHeight,
      sourceWidth: frameWidth,
      sourceHeight: frameHeight,
      destX,
      destY,
      destWidth,
      destHeight,
      flipX,
    });
  }
}

class PlayerRenderer extends EntityTypeRenderer {
  draw(player) {
    const drawX = Math.round(player.x - this.camera.x - (PLAYER_FRAME_WIDTH - player.width) * 0.5);
    const drawY = Math.round(player.y - this.camera.y - (PLAYER_FRAME_HEIGHT - player.height));
    const frame = player.getAnimationFrame();

    const didDraw = this.drawSpriteSheetFrame({
      image: this.assets?.spritesheet,
      frame,
      frameWidth: PLAYER_FRAME_WIDTH,
      frameHeight: PLAYER_FRAME_HEIGHT,
      destX: drawX,
      destY: drawY,
      flipX: player.facing < 0,
    });

    if (didDraw) {
      return;
    }

    this.ctx.fillStyle = "#e2a94b";
    this.ctx.fillRect(drawX + 8, drawY + 8, 16, 24);
  }
}

class ParticleRenderer extends EntityTypeRenderer {
  draw(particles = []) {
    for (const particle of particles) {
      const x = particle.x - this.camera.x;
      const y = particle.y - this.camera.y;
      if (!this.isVisible(x, y, 0, 0, 24)) {
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
}

class PickupRenderer extends EntityTypeRenderer {
  draw(pickups = []) {
    for (const pickup of pickups) {
      const x = pickup.x - this.camera.x;
      const y = pickup.y - this.camera.y + Math.sin(pickup.bobTime) * 2.5;
      if (!this.isVisible(x, y, 0, 0, 32)) {
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
}

class CombatTextRenderer extends EntityTypeRenderer {
  constructor(renderer, worldRenderer) {
    super(renderer);
    this.worldRenderer = worldRenderer;
  }

  draw(floatingTexts = []) {
    this.ctx.save();
    this.ctx.textBaseline = "middle";
    this.ctx.lineJoin = "round";
    this.ctx.font = "700 20.5px 'Segoe UI'";

    for (const floatingText of floatingTexts) {
      const x = floatingText.x - this.camera.x;
      const y = floatingText.y - this.camera.y;
      if (!this.isVisible(x, y, 0, 0, 48)) {
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
}

class BombRenderer extends EntityTypeRenderer {
  draw(bombs = []) {
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
      if (!this.isVisible(x, y, frameWidth, frameHeight)) {
        continue;
      }

      const frame = Math.floor((bomb.animationElapsed * 8) % frameCount);
      const spriteRow = Math.max(0, Math.min(rowCount - 1, bomb.spriteRow ?? 0));
      const didDraw = this.drawSpriteSheetFrame({
        image: sheet,
        frame,
        row: spriteRow,
        frameWidth,
        frameHeight,
        destX: x,
        destY: y,
      });
      if (didDraw) {
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

class NpcRenderer extends EntityTypeRenderer {
  draw(npcs = []) {
    if (!npcs.length) {
      return;
    }

    const sheet = this.assets?.sheepSpritesheet;
    const frameWidth = sheet ? Math.max(1, Math.floor(sheet.width / SHEEP_FRAME_COLUMNS)) : 32;
    const frameHeight = sheet ? Math.max(1, Math.floor(sheet.height / SHEEP_FRAME_ROWS)) : 32;

    for (const npc of npcs) {
      if (npc.kind === "dolly") {
        this.drawSheepBomb(npc, sheet, frameWidth, frameHeight);
      }
    }
  }

  drawSheepBomb(bomb, sheet, frameWidth, frameHeight) {
    const drawPosition = bomb.getDrawPosition(this.camera);
    const x = drawPosition.x;
    const y = drawPosition.y;
    if (!this.isVisible(x, y, 32, 32)) {
      return;
    }

    const renderState = bomb.getRenderState();
    const didDraw = this.drawSpriteSheetFrame({
      image: sheet,
      frame: renderState.frame,
      row: renderState.row,
      frameWidth,
      frameHeight,
      destX: x,
      destY: y,
      destWidth: 32,
      destHeight: 32,
      flipX: bomb.facing < 0,
    });

    if (!didDraw) {
      this.ctx.fillStyle = "#f5f2e8";
      this.ctx.fillRect(x + 5, y + 8, 22, 16);
    }

    const countdownText = bomb.getCountdownText();
    if (!countdownText) {
      return;
    }

    this.ctx.save();
    this.ctx.font = "700 12px 'Segoe UI'";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = "rgba(16, 18, 22, 0.9)";
    this.ctx.fillStyle = "#fff4de";
    this.ctx.strokeText(countdownText, x + 16, y - 7);
    this.ctx.fillText(countdownText, x + 16, y - 7);
    this.ctx.restore();
  }
}

export class RendererEntitySubsystem extends RendererSubsystem {
  constructor(renderer, worldRenderer) {
    super(renderer);
    this.worldRenderer = worldRenderer;
    this.playerRenderer = new PlayerRenderer(renderer);
    this.particleRenderer = new ParticleRenderer(renderer);
    this.pickupRenderer = new PickupRenderer(renderer);
    this.combatTextRenderer = new CombatTextRenderer(renderer, worldRenderer);
    this.bombRenderer = new BombRenderer(renderer);
    this.npcRenderer = new NpcRenderer(renderer);
  }

  drawPlayer(player) {
    this.playerRenderer.draw(player);
  }

  drawParticles(particles = []) {
    this.particleRenderer.draw(particles);
  }

  drawPickups(pickups = []) {
    this.pickupRenderer.draw(pickups);
  }

  drawFloatingTexts(floatingTexts = []) {
    this.combatTextRenderer.draw(floatingTexts);
  }

  drawBombs(bombs = []) {
    const staticBombs = bombs.filter((bomb) => bomb.kind !== "dolly");
    const npcs = bombs.filter((bomb) => bomb.kind === "dolly");
    this.bombRenderer.draw(staticBombs);
    this.drawNpcs(npcs);
  }

  drawNpcs(npcs = []) {
    this.npcRenderer.draw(npcs);
  }
}
