import { ITEM_DEFINITIONS } from "./inventory.js";
import { TILE_SIZE, TILE_TYPES } from "./tile.js";

const VIEWPORT = { width: 1280, height: 720 };
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 32;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
    image.src = source;
  });
}

function createRenderSurface(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = world;
    this.viewport = { ...VIEWPORT };
    this.camera = { x: 0, y: 0 };
    this.pixelRatio = window.devicePixelRatio || 1;
    this.terrainCanvas = createRenderSurface(world.pixelWidth, world.pixelHeight);
    this.terrainCtx = this.terrainCanvas.getContext("2d");
    this.assets = null;
    this.terrainDirty = true;
    this.resize();
  }

  static async loadAssets() {
    const [tilesheet, spritesheet] = await Promise.all([
      loadImage("./assets/tilesheet.png"),
      loadImage("./assets/player-spritesheet.png"),
    ]);

    return { tilesheet, spritesheet };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.pixelRatio);
    this.canvas.height = Math.round(rect.height * this.pixelRatio);
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.viewport.width = rect.width || VIEWPORT.width;
    this.viewport.height = rect.height || VIEWPORT.height;
  }

  setAssets(assets) {
    this.assets = assets;
    this.terrainDirty = true;
  }

  markTerrainDirty() {
    this.terrainDirty = true;
  }

  screenToWorld(screenX, screenY) {
    return {
      x: this.camera.x + screenX,
      y: this.camera.y + screenY,
    };
  }

  updateCamera(player) {
    const targetX = player.x - this.viewport.width * 0.5 + player.width * 0.5;
    const targetY = player.y - this.viewport.height * 0.58 + player.height * 0.5;
    this.camera.x = Math.max(0, Math.min(targetX, this.world.pixelWidth - this.viewport.width));
    this.camera.y = Math.max(0, Math.min(targetY, this.world.pixelHeight - this.viewport.height));
  }

  render({ player, world, inventory, miningResult, hoverTarget, particles, pickups, statusText, audioReady }) {
    if (this.terrainDirty) {
      this.#redrawTerrain(world);
    }

    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.#drawBackground();
    this.updateCamera(player);

    this.ctx.drawImage(
      this.terrainCanvas,
      this.camera.x,
      this.camera.y,
      this.viewport.width,
      this.viewport.height,
      0,
      0,
      this.viewport.width,
      this.viewport.height,
    );

    this.#drawMiningHighlight(hoverTarget, miningResult);
    this.#drawPickups(pickups);
    this.#drawParticles(particles);
    this.#drawPlayer(player);
    this.#drawDepthMeter(player);
    this.#drawHud(inventory, statusText, audioReady);
    this.#drawHotbar(inventory);
  }

  #drawBackground() {
    const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.viewport.height);
    skyGradient.addColorStop(0, "#1d324e");
    skyGradient.addColorStop(0.45, "#12263d");
    skyGradient.addColorStop(1, "#05070e");
    this.ctx.fillStyle = skyGradient;
    this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 83 - this.camera.x * 0.1) % (this.viewport.width + 160);
      this.ctx.fillRect(x, 54 + (i % 4) * 18, 120, 2);
    }
  }

  #redrawTerrain(world) {
    this.terrainCtx.clearRect(0, 0, world.pixelWidth, world.pixelHeight);
    this.terrainCtx.imageSmoothingEnabled = false;

    for (let row = 0; row < world.rows; row += 1) {
      for (let column = 0; column < world.columns; column += 1) {
        const tile = world.getTile(column, row);
        if (!tile || tile.type === TILE_TYPES.EMPTY) {
          continue;
        }

        this.#drawTileToContext(this.terrainCtx, tile, column * TILE_SIZE, row * TILE_SIZE);
      }
    }

    this.terrainDirty = false;
  }

  #drawTileToContext(context, tile, x, y) {
    const canUseTilesheet = this.assets?.tilesheet
      && tile.sprite.x * TILE_SIZE + TILE_SIZE <= this.assets.tilesheet.width
      && tile.sprite.y * TILE_SIZE + TILE_SIZE <= this.assets.tilesheet.height
      && [TILE_TYPES.DIRT, TILE_TYPES.STONE, TILE_TYPES.COAL, TILE_TYPES.IRON].includes(tile.type);

    if (canUseTilesheet) {
      context.drawImage(
        this.assets.tilesheet,
        tile.sprite.x * TILE_SIZE,
        tile.sprite.y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        x,
        y,
        TILE_SIZE,
        TILE_SIZE,
      );
      return;
    }

    this.#drawProceduralTile(context, tile, x, y);
  }

  #drawProceduralTile(context, tile, x, y) {
    context.fillStyle = tile.definition.fill;
    context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    context.strokeStyle = "rgba(0, 0, 0, 0.18)";
    context.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = tile.definition.accent;

    switch (tile.definition.pattern) {
      case "speck":
        for (const offset of [4, 11, 18, 24]) {
          context.fillRect(x + offset, y + 6 + (offset % 4) * 4, 4, 4);
        }
        break;
      case "bands":
        context.fillRect(x + 4, y + 6, 22, 2);
        context.fillRect(x + 7, y + 14, 18, 2);
        context.fillRect(x + 5, y + 22, 20, 2);
        break;
      case "slate":
        context.fillRect(x + 5, y + 5, 20, 3);
        context.fillRect(x + 9, y + 12, 16, 2);
        context.fillRect(x + 4, y + 19, 22, 3);
        break;
      case "blocks":
        context.fillRect(x + 5, y + 5, 8, 8);
        context.fillRect(x + 17, y + 8, 9, 9);
        context.fillRect(x + 9, y + 19, 12, 6);
        break;
      case "ore-cluster":
        context.fillRect(x + 6, y + 5, 6, 6);
        context.fillRect(x + 18, y + 8, 7, 7);
        context.fillRect(x + 11, y + 19, 8, 8);
        break;
      case "ore-gem":
        context.fillRect(x + 7, y + 6, 5, 5);
        context.fillRect(x + 19, y + 10, 6, 6);
        context.fillRect(x + 13, y + 18, 7, 7);
        context.fillRect(x + 9, y + 14, 3, 3);
        break;
      case "gem-shard":
        context.fillRect(x + 8, y + 6, 4, 8);
        context.fillRect(x + 20, y + 9, 5, 9);
        context.fillRect(x + 13, y + 19, 6, 7);
        break;
      default:
        break;
    }
  }

  #drawMiningHighlight(hoverTarget, miningResult) {
    const target = miningResult?.target ?? hoverTarget;
    if (!target) {
      return;
    }

    const { column, row } = target;
    const tile = this.world.getTile(column, row);
    const x = column * TILE_SIZE - this.camera.x;
    const y = row * TILE_SIZE - this.camera.y;
    this.ctx.strokeStyle = miningResult?.target ? "rgba(255, 228, 156, 0.9)" : "rgba(136, 185, 216, 0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    if (miningResult?.target && tile?.solid && tile.breakRatio > 0) {
      this.ctx.fillStyle = "rgba(8, 12, 18, 0.78)";
      this.ctx.fillRect(x + 4, y + TILE_SIZE - 8, TILE_SIZE - 8, 5);
      this.ctx.fillStyle = "#e2a94b";
      this.ctx.fillRect(x + 4, y + TILE_SIZE - 8, (TILE_SIZE - 8) * (1 - tile.breakRatio), 5);
    }
  }

  #drawPlayer(player) {
    const drawX = Math.round(player.x - this.camera.x - (PLAYER_FRAME_WIDTH - player.width) * 0.5);
    const drawY = Math.round(player.y - this.camera.y - (PLAYER_FRAME_HEIGHT - player.height));
    const frame = player.getAnimationFrame();

    this.ctx.save();
    if (player.facing < 0) {
      this.ctx.translate(drawX + PLAYER_FRAME_WIDTH, drawY);
      this.ctx.scale(-1, 1);
      this.#blitPlayerFrame(frame, 0, 0);
    } else {
      this.#blitPlayerFrame(frame, drawX, drawY);
    }
    this.ctx.restore();
  }

  #drawParticles(particles = []) {
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

  #drawPickups(pickups = []) {
    for (const pickup of pickups) {
      const x = pickup.x - this.camera.x;
      const y = pickup.y - this.camera.y + Math.sin(pickup.bobTime) * 2.5;
      if (x < -32 || y < -32 || x > this.viewport.width + 32 || y > this.viewport.height + 32) {
        continue;
      }

      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(pickup.rotation);
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

  #blitPlayerFrame(frame, x, y) {
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

  #drawDepthMeter(player) {
    const depthTiles = Math.max(0, Math.floor(player.y / TILE_SIZE) - this.world.surfaceRow);
    this.ctx.fillStyle = "rgba(9, 16, 28, 0.84)";
    this.ctx.fillRect(this.viewport.width - 160, 18, 142, 42);
    this.ctx.strokeStyle = "rgba(136, 185, 216, 0.35)";
    this.ctx.strokeRect(this.viewport.width - 160, 18, 142, 42);
    this.ctx.fillStyle = "#f2ede3";
    this.ctx.font = "14px 'Segoe UI'";
    this.ctx.fillText(`Depth: ${depthTiles}m`, this.viewport.width - 145, 44);
  }

  #drawHud(inventory, statusText, audioReady) {
    const statusEl = document.getElementById("status-text");
    const resourceEl = document.getElementById("resource-bar");
    if (statusEl) {
      statusEl.textContent = audioReady ? statusText : `${statusText} Click or press a key to enable audio.`;
    }
    if (resourceEl) {
      resourceEl.innerHTML = `<span>Items: ${inventory.getItemCount()}</span><span>Slots: ${inventory.getOccupiedSlotCount()}/${inventory.slotCount}</span><span>Stack: ${inventory.stackSize}</span>`;
    }
  }

  #drawHotbar(inventory) {
    const slots = inventory.getSlots();
    const slotSize = 52;
    const gap = 8;
    const totalWidth = slots.length * slotSize + (slots.length - 1) * gap;
    const startX = (this.viewport.width - totalWidth) * 0.5;
    const y = this.viewport.height - slotSize - 24;

    for (let index = 0; index < slots.length; index += 1) {
      const x = startX + index * (slotSize + gap);
      const slot = slots[index];
      this.ctx.fillStyle = "rgba(9, 16, 28, 0.82)";
      this.ctx.fillRect(x, y, slotSize, slotSize);
      this.ctx.strokeStyle = slot ? "rgba(242, 237, 227, 0.45)" : "rgba(136, 185, 216, 0.22)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, slotSize, slotSize);

      if (!slot) {
        continue;
      }

      const item = ITEM_DEFINITIONS[slot.itemId];
      this.ctx.fillStyle = item.glow;
      this.ctx.beginPath();
      this.ctx.arc(x + slotSize * 0.5, y + slotSize * 0.42, 13, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = item.color;
      this.ctx.fillRect(x + 16, y + 13, 20, 20);
      this.ctx.strokeStyle = "rgba(255, 240, 211, 0.6)";
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(x + 16, y + 13, 20, 20);
      this.ctx.fillStyle = "#f2ede3";
      this.ctx.font = "bold 12px 'Segoe UI'";
      this.ctx.fillText(item.shortLabel, x + 22, y + 27);
      this.ctx.font = "bold 13px 'Segoe UI'";
      this.ctx.fillText(String(slot.count), x + slotSize - 15, y + slotSize - 11);
    }
  }
}