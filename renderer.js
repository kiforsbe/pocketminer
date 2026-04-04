import { ITEM_DEFINITIONS } from "./inventory.js";
import { TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";

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
    this.assets = null;
    this.resize();
  }

  setWorld(world) {
    this.world = world;
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
  }

  markTerrainDirty() {
    // Terrain is rendered directly from visible tile bounds each frame.
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

  render({ player, world, inventory, miningResult, hoverTarget, particles, pickups, roundInfo }) {
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.#drawBackground();
    this.updateCamera(player);
    this.#drawVisibleTerrain(world);
    this.#drawFallingDebris(world.getFallingDebris?.() ?? []);

    this.#drawMiningHighlight(hoverTarget, miningResult);
    this.#drawPickups(pickups);
    this.#drawParticles(particles);
    this.#drawPlayer(player);
    this.#drawHud(inventory, roundInfo);
    this.#drawHotbar(inventory);
    this.#drawSurveyPanel(player, miningResult?.target ?? hoverTarget);
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

  #drawVisibleTerrain(world) {
    const bounds = world.getVisibleTileBounds(this.camera, this.viewport.width, this.viewport.height);
    for (let row = bounds.startRow; row < bounds.endRow; row += 1) {
      for (let column = bounds.startColumn; column < bounds.endColumn; column += 1) {
        const tile = world.getTile(column, row);
        if (!tile || (tile.type === TILE_TYPES.EMPTY && !tile.debrisType)) {
          continue;
        }

        this.#drawTileToContext(
          this.ctx,
          tile,
          column * TILE_SIZE - this.camera.x,
          row * TILE_SIZE - this.camera.y,
          column,
          row,
        );
      }
    }
  }

  #drawTileToContext(context, tile, x, y, column, row) {
    if (tile.type === TILE_TYPES.EMPTY) {
      if (tile.debrisType) {
        this.#drawDebris(context, x, y + TILE_SIZE - 8, tile.debrisType, tile.debrisVariant ?? 0);
      }
      return;
    }

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
    } else {
      this.#drawProceduralTile(context, tile, x, y);
    }

    const surfaceTreatment = tile.surfaceTreatment;
    if (surfaceTreatment === "grass") {
      this.#drawGrassCap(context, x, y, tile.surfaceVariant ?? 0);
    } else if (surfaceTreatment === "moss") {
      this.#drawMossCap(context, x, y);
    } else if (surfaceTreatment === "rock") {
      this.#drawRockCap(context, x, y, { drawStalagmites: false });
    } else if (surfaceTreatment === "rock-spires") {
      this.#drawRockCap(context, x, y, { drawStalagmites: true });
    }

    if (tile.debrisType) {
      this.#drawDebris(context, x, y + TILE_SIZE - 8, tile.debrisType, tile.debrisVariant ?? 0);
    }

    if (tile.breakRatio > 0) {
      this.#drawDamageCracks(context, x, y, tile.breakRatio);
    }
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
      case "chest":
        context.fillRect(x + 5, y + 10, 22, 14);
        context.fillRect(x + 7, y + 7, 18, 5);
        context.fillStyle = "#34210c";
        context.fillRect(x + 5, y + 12, 22, 2);
        context.fillStyle = tile.definition.accent;
        context.fillRect(x + 14, y + 13, 4, 8);
        context.fillRect(x + 5, y + 16, 22, 2);
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

  #drawProceduralTilePreview(context, definition, size) {
    context.clearRect(0, 0, size, size);
    if (!definition || definition.pattern === "empty") {
      return;
    }

    context.fillStyle = definition.fill;
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "rgba(0, 0, 0, 0.2)";
    context.strokeRect(0, 0, size, size);
    context.fillStyle = definition.accent;
    const unit = size / 32;

    switch (definition.pattern) {
      case "speck":
        for (const offset of [4, 11, 18, 24]) {
          context.fillRect(offset * unit, (6 + (offset % 4) * 4) * unit, 4 * unit, 4 * unit);
        }
        break;
      case "bands":
        context.fillRect(4 * unit, 6 * unit, 22 * unit, 2 * unit);
        context.fillRect(7 * unit, 14 * unit, 18 * unit, 2 * unit);
        context.fillRect(5 * unit, 22 * unit, 20 * unit, 2 * unit);
        break;
      case "slate":
        context.fillRect(5 * unit, 5 * unit, 20 * unit, 3 * unit);
        context.fillRect(9 * unit, 12 * unit, 16 * unit, 2 * unit);
        context.fillRect(4 * unit, 19 * unit, 22 * unit, 3 * unit);
        break;
      case "blocks":
        context.fillRect(5 * unit, 5 * unit, 8 * unit, 8 * unit);
        context.fillRect(17 * unit, 8 * unit, 9 * unit, 9 * unit);
        context.fillRect(9 * unit, 19 * unit, 12 * unit, 6 * unit);
        break;
      case "chest":
        context.fillRect(5 * unit, 10 * unit, 22 * unit, 14 * unit);
        context.fillRect(7 * unit, 7 * unit, 18 * unit, 5 * unit);
        context.fillStyle = "#34210c";
        context.fillRect(5 * unit, 12 * unit, 22 * unit, 2 * unit);
        context.fillStyle = definition.accent;
        context.fillRect(14 * unit, 13 * unit, 4 * unit, 8 * unit);
        context.fillRect(5 * unit, 16 * unit, 22 * unit, 2 * unit);
        break;
      case "ore-cluster":
        context.fillRect(6 * unit, 5 * unit, 6 * unit, 6 * unit);
        context.fillRect(18 * unit, 8 * unit, 7 * unit, 7 * unit);
        context.fillRect(11 * unit, 19 * unit, 8 * unit, 8 * unit);
        break;
      case "ore-gem":
        context.fillRect(7 * unit, 6 * unit, 5 * unit, 5 * unit);
        context.fillRect(19 * unit, 10 * unit, 6 * unit, 6 * unit);
        context.fillRect(13 * unit, 18 * unit, 7 * unit, 7 * unit);
        context.fillRect(9 * unit, 14 * unit, 3 * unit, 3 * unit);
        break;
      case "gem-shard":
        context.fillRect(8 * unit, 6 * unit, 4 * unit, 8 * unit);
        context.fillRect(20 * unit, 9 * unit, 5 * unit, 9 * unit);
        context.fillRect(13 * unit, 19 * unit, 6 * unit, 7 * unit);
        break;
      default:
        break;
    }
  }

  #drawGrassCap(context, x, y, variant) {
    context.fillStyle = "#4a922f";
    context.fillRect(x, y, TILE_SIZE, 5);
    context.fillStyle = "#7dcb4f";
    context.fillRect(x, y, TILE_SIZE, 2);
    context.fillRect(x + 3, y + 4, 3, 3);
    context.fillRect(x + 9, y + 5, 4, 3);
    context.fillRect(x + 17, y + 4, 3, 4);
    context.fillRect(x + 24, y + 5, 4, 3);

    const flowerPalettes = [
      {
        petal: "#f1d04d",
        center: "#fff4a3",
        flowers: [
          { x: 7, y: 1, stem: 4 },
          { x: 20, y: 2, stem: 4 },
        ],
      },
      {
        petal: "#b277e8",
        center: "#f4d7ff",
        flowers: [
          { x: 6, y: 2, stem: 3 },
          { x: 14, y: 1, stem: 4 },
          { x: 23, y: 2, stem: 3 },
        ],
      },
      {
        petal: "#58a8ea",
        center: "#d8f2ff",
        flowers: [
          { x: 8, y: 1, stem: 4 },
          { x: 18, y: 2, stem: 3 },
          { x: 25, y: 1, stem: 4 },
        ],
      },
    ];

    const palette = flowerPalettes[variant % flowerPalettes.length];
    context.fillStyle = palette.petal;
    for (const flower of palette.flowers) {
      context.fillRect(x + flower.x, y + flower.y, 2, 2);
      context.fillRect(x + flower.x + 1, y + flower.y - 1, 1, flower.stem);
    }
    context.fillStyle = palette.center;
    for (const flower of palette.flowers) {
      context.fillRect(x + flower.x + 1, y + flower.y, 1, 1);
    }
  }

  #drawMossCap(context, x, y) {
    context.fillStyle = "#2f4a24";
    context.fillRect(x, y, TILE_SIZE, 4);
    context.fillStyle = "#456736";
    context.fillRect(x + 2, y + 1, TILE_SIZE - 4, 2);
    context.fillRect(x + 4, y + 4, 5, 2);
    context.fillRect(x + 13, y + 3, 6, 3);
    context.fillRect(x + 23, y + 4, 4, 2);
    context.fillStyle = "#d8d1c6";
    context.fillRect(x + 8, y + 2, 2, 3);
    context.fillRect(x + 22, y + 1, 2, 4);
    context.fillStyle = "#7a685f";
    context.fillRect(x + 7, y + 1, 4, 2);
    context.fillRect(x + 21, y, 4, 2);
    context.fillStyle = "#efe6db";
    context.fillRect(x + 8, y + 1, 1, 1);
    context.fillRect(x + 22, y, 1, 1);
  }

  #drawRockCap(context, x, y, { drawStalagmites }) {
    context.fillStyle = "#232934";
    context.fillRect(x, y, TILE_SIZE, 4);
    context.fillStyle = "rgba(188, 198, 214, 0.25)";
    context.fillRect(x + 3, y + 1, 7, 1);
    context.fillRect(x + 14, y + 2, 5, 1);
    context.fillRect(x + 23, y + 1, 4, 1);

    if (drawStalagmites) {
      context.fillStyle = "#5b6577";
      context.beginPath();
      context.moveTo(x + 4, y + 4);
      context.lineTo(x + 7, y - 1);
      context.lineTo(x + 10, y + 4);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(x + 14, y + 4);
      context.lineTo(x + 17, y - 3);
      context.lineTo(x + 20, y + 4);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(x + 23, y + 4);
      context.lineTo(x + 26, y);
      context.lineTo(x + 29, y + 4);
      context.closePath();
      context.fill();
    }

    context.strokeStyle = "rgba(18, 22, 29, 0.72)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 6, y + 4);
    context.lineTo(x + 10, y + 7);
    context.moveTo(x + 15, y + 4);
    context.lineTo(x + 13, y + 8);
    context.lineTo(x + 18, y + 10);
    context.moveTo(x + 24, y + 4);
    context.lineTo(x + 27, y + 8);
    context.stroke();
  }

  #drawDebris(context, x, y, debrisType, debrisVariant) {
    const definition = TILE_DEFINITIONS[debrisType] ?? TILE_DEFINITIONS[TILE_TYPES.STONE];
    const layouts = [
      [
        { x: 4, y: 3, w: 5, h: 3 },
        { x: 12, y: 2, w: 6, h: 4 },
        { x: 22, y: 3, w: 4, h: 3 },
      ],
      [
        { x: 6, y: 2, w: 4, h: 4 },
        { x: 14, y: 3, w: 5, h: 3 },
        { x: 21, y: 2, w: 6, h: 4 },
      ],
      [
        { x: 5, y: 3, w: 6, h: 3 },
        { x: 15, y: 1, w: 4, h: 5 },
        { x: 23, y: 3, w: 3, h: 3 },
      ],
    ];
    const pieces = layouts[debrisVariant % layouts.length];

    context.fillStyle = definition.fill;
    for (const piece of pieces) {
      context.fillRect(x + piece.x, y + piece.y, piece.w, piece.h);
    }

    context.fillStyle = definition.accent;
    for (const piece of pieces) {
      context.fillRect(x + piece.x + 1, y + piece.y, Math.max(1, piece.w - 2), 1);
    }

    context.strokeStyle = "rgba(0, 0, 0, 0.28)";
    context.lineWidth = 1;
    for (const piece of pieces) {
      context.strokeRect(x + piece.x, y + piece.y, piece.w, piece.h);
    }
  }

  #drawFallingDebris(fallingDebris = []) {
    for (const debris of fallingDebris) {
      const x = debris.x - this.camera.x;
      const y = debris.y - this.camera.y;
      if (x < -TILE_SIZE || y < -TILE_SIZE || x > this.viewport.width || y > this.viewport.height + TILE_SIZE) {
        continue;
      }

      this.#drawDebris(this.ctx, x, y, debris.type, debris.variant);
    }
  }

  #drawDamageCracks(context, x, y, breakRatio) {
    const crackLevel = Math.min(4, Math.max(1, Math.ceil(breakRatio * 4)));
    context.strokeStyle = "rgba(16, 18, 24, 0.72)";
    context.lineWidth = 1.5;
    context.lineCap = "round";

    context.beginPath();
    context.moveTo(x + 16, y + 3);
    context.lineTo(x + 14, y + 10);
    context.lineTo(x + 11, y + 16);
    if (crackLevel >= 2) {
      context.lineTo(x + 12, y + 23);
      context.lineTo(x + 9, y + 29);
    }
    context.moveTo(x + 14, y + 10);
    context.lineTo(x + 20, y + 13);
    if (crackLevel >= 3) {
      context.lineTo(x + 25, y + 10);
    }
    context.stroke();

    if (crackLevel >= 2) {
      context.beginPath();
      context.moveTo(x + 20, y + 13);
      context.lineTo(x + 22, y + 19);
      context.lineTo(x + 26, y + 24);
      context.moveTo(x + 11, y + 16);
      context.lineTo(x + 6, y + 18);
      context.lineTo(x + 4, y + 24);
      context.stroke();
    }

    if (crackLevel >= 3) {
      context.beginPath();
      context.moveTo(x + 12, y + 23);
      context.lineTo(x + 18, y + 26);
      context.lineTo(x + 22, y + 30);
      context.moveTo(x + 22, y + 19);
      context.lineTo(x + 27, y + 17);
      context.stroke();
    }

    if (crackLevel >= 4) {
      context.beginPath();
      context.moveTo(x + 10, y + 8);
      context.lineTo(x + 6, y + 11);
      context.moveTo(x + 17, y + 6);
      context.lineTo(x + 23, y + 4);
      context.moveTo(x + 7, y + 25);
      context.lineTo(x + 4, y + 29);
      context.moveTo(x + 25, y + 24);
      context.lineTo(x + 28, y + 28);
      context.stroke();
    }
  }

  #paintIcon(canvasId, tileType) {
    const canvas = document.getElementById(canvasId);
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    this.#drawProceduralTilePreview(context, TILE_DEFINITIONS[tileType], canvas.width);
  }

  #renderOreChip(container, tileType) {
    const definition = TILE_DEFINITIONS[tileType];
    if (!definition) {
      return;
    }

    const chip = document.createElement("span");
    chip.className = "ore-chip";
    const canvas = document.createElement("canvas");
    canvas.width = 18;
    canvas.height = 18;
    const label = document.createElement("span");
    label.textContent = definition.label.replace(" Ore", "");
    chip.append(canvas, label);
    container.append(chip);

    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    this.#drawProceduralTilePreview(context, definition, 18);
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

  #drawHud(inventory, roundInfo) {
    const timerEl = document.getElementById("round-timer");
    const timerValueEl = document.getElementById("round-timer-value");
    const bankValueEl = document.getElementById("bank-value");
    const roundValueEl = document.getElementById("round-value");
    const toastEl = document.getElementById("round-toast");
    if (timerEl && timerValueEl) {
      timerEl.setAttribute("data-urgent", roundInfo.urgent ? "true" : "false");
      timerValueEl.textContent = `${roundInfo.timeLeft}s`;
    }
    if (roundValueEl) {
      roundValueEl.textContent = String(roundInfo.round);
    }
    if (bankValueEl) {
      bankValueEl.textContent = `${roundInfo.bank}€`;
    }
    if (toastEl) {
      if (roundInfo.notification?.message) {
        toastEl.textContent = roundInfo.notification.message;
        toastEl.setAttribute("data-visible", "true");
        toastEl.setAttribute("data-urgent", roundInfo.notification.urgent ? "true" : "false");
      } else {
        toastEl.textContent = "";
        toastEl.setAttribute("data-visible", "false");
        toastEl.setAttribute("data-urgent", "false");
      }
    }
  }

  #drawSurveyPanel(player, target) {
    const stratumNameEl = document.getElementById("stratum-name");
    const stratumDepthEl = document.getElementById("stratum-depth");
    const stratumChestsEl = document.getElementById("stratum-chests");
    const stratumCoreSwatchesEl = document.getElementById("stratum-core-swatches");
    const stratumBonusSwatchesEl = document.getElementById("stratum-bonus-swatches");
    const blockNameEl = document.getElementById("block-name");
    const blockTypeEl = document.getElementById("block-type");
    const blockHpEl = document.getElementById("block-hp");
    const blockValueEl = document.getElementById("block-value");
    const blockRangeEl = document.getElementById("block-range");
    const blockYieldEl = document.getElementById("block-yield");
    const stratum = this.world.getStratumAtPixel(player.getCenter().y);

    this.#paintIcon("stratum-icon", stratum.base[0].type);

    if (stratumNameEl) {
      stratumNameEl.textContent = stratum.name;
    }

    if (stratumDepthEl) {
      stratumDepthEl.textContent = `Depth ${stratum.depth}m`;
    }

    if (stratumChestsEl) {
      const chestStats = this.world.getChestStatsForStratum(stratum.index);
      stratumChestsEl.textContent = `Chests ${chestStats.spawned} / ${chestStats.max}`;
    }

    if (stratumCoreSwatchesEl) {
      stratumCoreSwatchesEl.replaceChildren();
      for (const ore of stratum.primaryOres) {
        this.#renderOreChip(stratumCoreSwatchesEl, ore.type);
      }
    }

    if (stratumBonusSwatchesEl) {
      stratumBonusSwatchesEl.replaceChildren();
      for (const ore of [...stratum.bonusFromPrev, ...stratum.bonusFromNext]) {
        this.#renderOreChip(stratumBonusSwatchesEl, ore.type);
      }
    }

    if (!blockNameEl || !blockTypeEl || !blockHpEl || !blockValueEl || !blockRangeEl || !blockYieldEl) {
      return;
    }

    if (!target) {
      this.#paintIcon("block-icon", TILE_TYPES.EMPTY);
      blockNameEl.textContent = "None";
      blockTypeEl.textContent = "No target";
      blockHpEl.textContent = "--";
      blockValueEl.textContent = "--";
      blockRangeEl.textContent = "--";
      blockYieldEl.textContent = "--";
      return;
    }

    const tile = this.world.getTile(target.column, target.row);
    if (!tile) {
      this.#paintIcon("block-icon", TILE_TYPES.EMPTY);
      blockNameEl.textContent = "None";
      blockTypeEl.textContent = "No target";
      blockHpEl.textContent = "--";
      blockValueEl.textContent = "--";
      blockRangeEl.textContent = "--";
      blockYieldEl.textContent = "--";
      return;
    }

    this.#paintIcon("block-icon", tile.type);
    blockNameEl.textContent = tile.definition.label;
    blockTypeEl.textContent = tile.type === TILE_TYPES.CHEST ? "Treasure chest" : (tile.definition.drop ? "Ore" : "Stratum block");
    blockHpEl.textContent = tile.maxHp > 0 ? `${Math.ceil(tile.hp)} / ${tile.maxHp}` : "--";
    blockValueEl.textContent = tile.definition.drop
      ? `${ITEM_DEFINITIONS[tile.definition.drop]?.value ?? 0}€`
      : (tile.type === TILE_TYPES.CHEST ? "Reward" : "0€");
    blockRangeEl.textContent = target.distance ? `${(target.distance / TILE_SIZE).toFixed(1)} tiles` : "In range";
    const dropRange = this.world.getOreDropRange(target.row, tile.type);
    blockYieldEl.textContent = tile.type === TILE_TYPES.CHEST
      ? "1 card pick"
      : dropRange
      ? (dropRange.min === dropRange.max ? `${dropRange.min}` : `${dropRange.min}-${dropRange.max}`)
      : "--";
  }

  #drawHotbar(inventory) {
    const slots = inventory.getSlots();
    const slotsPerRow = 8;
    const slotSize = 52;
    const gap = 8;
    const iconPadding = 5;
    const iconSize = slotSize - iconPadding * 2;
    const rowCount = Math.max(1, Math.ceil(slots.length / slotsPerRow));
    const columns = Math.min(slots.length, slotsPerRow);
    const totalWidth = columns * slotSize + Math.max(0, columns - 1) * gap;
    const startX = (this.viewport.width - totalWidth) * 0.5;
    const startY = this.viewport.height - rowCount * slotSize - Math.max(0, rowCount - 1) * gap - 24;

    for (let index = 0; index < slots.length; index += 1) {
      const column = index % slotsPerRow;
      const row = Math.floor(index / slotsPerRow);
      const x = startX + column * (slotSize + gap);
      const y = startY + row * (slotSize + gap);
      const slot = slots[index];
      this.ctx.fillStyle = "rgba(9, 16, 28, 0.82)";
      this.ctx.fillRect(x, y, slotSize, slotSize);
      this.ctx.strokeStyle = slot ? "rgba(242, 237, 227, 0.45)" : "rgba(136, 185, 216, 0.22)";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, slotSize, slotSize);

      if (!slot) {
        continue;
      }

      this.#drawHotbarItemIcon(x + iconPadding, y + iconPadding, iconSize, slot.itemId);
      this.ctx.font = "bold 13px 'Segoe UI'";
      this.ctx.fillStyle = "#f2ede3";
      this.ctx.fillText(String(slot.count), x + slotSize - 15, y + slotSize - 11);
    }
  }

  #drawHotbarItemIcon(x, y, size, itemId) {
    const tileDefinition = TILE_DEFINITIONS[itemId];
    if (!tileDefinition) {
      this.ctx.fillStyle = ITEM_DEFINITIONS[itemId]?.color ?? "#f2ede3";
      this.ctx.fillRect(x, y, size, size);
      return;
    }

    this.ctx.save();
    this.ctx.translate(x, y);
    this.#drawProceduralTilePreview(this.ctx, tileDefinition, size);
    this.ctx.restore();
  }
}