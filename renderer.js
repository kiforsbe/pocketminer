import { ITEM_DEFINITIONS } from "./inventory.js";
import { PLATFORM_SURFACE_OFFSET, TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";

const VIEWPORT = { width: 1280, height: 720 };
const PLAYER_FRAME_WIDTH = 32;
const PLAYER_FRAME_HEIGHT = 32;
const SUNNY_SKY_TOP = "#8fd8ff";
const SUNNY_SKY_MID = "#dff6ff";
const CLOUD_BAND_HEIGHT = 168;
const SURFACE_TRANSITION_DEPTH = TILE_SIZE * 3;

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
    this.bonusStatsSignature = "";
    this.hudSignature = "";
    this.stratumSignature = "";
    this.blockSignature = "";
    this.lastStratumIconType = null;
    this.lastBlockIconType = null;
    this.lastFrameTimestamp = 0;
    this.fpsSampleElapsed = 0;
    this.fpsSampleFrames = 0;
    this.displayedFps = 0;
    this.dom = {
      roundTimer: document.getElementById("round-timer"),
      roundTimerValue: document.getElementById("round-timer-value"),
      bankValue: document.getElementById("bank-value"),
      bonusStats: document.getElementById("bonus-stats"),
      roundValue: document.getElementById("round-value"),
      roundToast: document.getElementById("round-toast"),
      stratumIcon: document.getElementById("stratum-icon"),
      stratumName: document.getElementById("stratum-name"),
      stratumDepth: document.getElementById("stratum-depth"),
      stratumCoreSwatches: document.getElementById("stratum-core-swatches"),
      stratumBonusSwatches: document.getElementById("stratum-bonus-swatches"),
      blockIcon: document.getElementById("block-icon"),
      blockName: document.getElementById("block-name"),
      blockType: document.getElementById("block-type"),
      blockHp: document.getElementById("block-hp"),
      blockValue: document.getElementById("block-value"),
      blockRange: document.getElementById("block-range"),
      blockYield: document.getElementById("block-yield"),
    };
    this.resize();
  }

  setWorld(world) {
    this.world = world;
  }

  static async loadAssets() {
    const [tilesheet, spritesheet] = await Promise.all([
      loadImage("./assets/tiles/tilesheet.png"),
      loadImage("./assets/sprites/player-spritesheet.png"),
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

  render({ player, world, inventory, miningResult, hoverTarget, particles, pickups, floatingTexts, roundInfo }) {
    this.#updateFrameRateCounter();
    this.updateCamera(player);
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.#drawBackground(player);
    this.#drawVisibleTerrain(world);
    this.#drawFallingDebris(world.getFallingDebris?.() ?? []);

    this.#drawMiningHighlight(hoverTarget, miningResult);
    this.#drawPickups(pickups);
    this.#drawParticles(particles);
    this.#drawPlayer(player);
    this.#drawHud(inventory, roundInfo);
    this.#drawHotbar(inventory);
    this.#drawSurveyPanel(player, miningResult?.target ?? hoverTarget);
    this.#drawFloatingTexts(floatingTexts);
    this.#drawPerformanceCounters(roundInfo);
  }

  #updateFrameRateCounter() {
    const now = performance.now();
    if (this.lastFrameTimestamp > 0) {
      const deltaMs = now - this.lastFrameTimestamp;
      this.fpsSampleElapsed += deltaMs;
      this.fpsSampleFrames += 1;
      if (this.fpsSampleElapsed >= 250) {
        this.displayedFps = Math.round((this.fpsSampleFrames * 1000) / this.fpsSampleElapsed);
        this.fpsSampleElapsed = 0;
        this.fpsSampleFrames = 0;
      }
    }

    this.lastFrameTimestamp = now;
  }

  #drawPerformanceCounters(roundInfo = {}) {
    if (!roundInfo.showPerformance) {
      return;
    }

    this.ctx.save();
    this.ctx.font = '600 10px "Segoe UI", "Trebuchet MS", sans-serif';
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "top";
    this.ctx.fillStyle = "rgba(242, 237, 227, 0.72)";
    this.ctx.strokeStyle = "rgba(6, 10, 16, 0.82)";
    this.ctx.lineWidth = 3;
    this.ctx.lineJoin = "round";
    const x = this.viewport.width - 18;
    const lines = [`FPS ${this.displayedFps}`, `TPS ${roundInfo.tickRate ?? 0}`];
    lines.forEach((text, index) => {
      const y = 18 + index * 12;
      this.ctx.strokeText(text, x, y);
      this.ctx.fillText(text, x, y);
    });
    this.ctx.restore();
  }

  #setTextContentIfChanged(element, nextText) {
    if (element && element.textContent !== nextText) {
      element.textContent = nextText;
    }
  }

  #setDataAttributeIfChanged(element, name, value) {
    if (!element || element.getAttribute(name) === value) {
      return;
    }

    element.setAttribute(name, value);
  }

  #drawBackground(player) {
    const stratum = player
      ? this.world.getStratumAtPixel(player.getCenter().y)
      : this.world.getStratumAtPixel(this.camera.y + this.viewport.height * 0.5);
    const theme = stratum?.skyTheme ?? {
      horizon: "#7e92a8",
      depth: "#455567",
      glow: "#b9cad8",
    };

    const surfaceScreenY = this.world.surfaceRow * TILE_SIZE - this.camera.y;
    const skyBottom = Math.max(0, Math.min(this.viewport.height, surfaceScreenY));
    const caveTop = Math.max(0, Math.min(this.viewport.height, surfaceScreenY));
    const transitionBottom = Math.max(
      caveTop,
      Math.min(this.viewport.height, surfaceScreenY + SURFACE_TRANSITION_DEPTH),
    );

    this.ctx.fillStyle = "#020304";
    this.ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    if (skyBottom > 0) {
      const skyGradient = this.ctx.createLinearGradient(0, 0, 0, skyBottom);
      skyGradient.addColorStop(0, SUNNY_SKY_TOP);
      skyGradient.addColorStop(0.55, SUNNY_SKY_MID);
      skyGradient.addColorStop(1, "#eef8ff");
      this.ctx.fillStyle = skyGradient;
      this.ctx.fillRect(0, 0, this.viewport.width, skyBottom);

      const sunGlow = this.ctx.createRadialGradient(
        this.viewport.width * 0.52,
        Math.min(120, skyBottom * 0.45),
        16,
        this.viewport.width * 0.52,
        Math.min(120, skyBottom * 0.45),
        this.viewport.width * 0.34,
      );
      sunGlow.addColorStop(0, "rgba(255, 244, 204, 0.35)");
      sunGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      this.ctx.fillStyle = sunGlow;
      this.ctx.fillRect(0, 0, this.viewport.width, skyBottom);

      this.#drawClouds(skyBottom);
    }

    if (transitionBottom > caveTop) {
      const transitionGradient = this.ctx.createLinearGradient(0, caveTop, 0, transitionBottom);
      transitionGradient.addColorStop(0, "#eef8ff");
      transitionGradient.addColorStop(0.16, "#d7e1e8");
      transitionGradient.addColorStop(0.32, "#b8c3cb");
      transitionGradient.addColorStop(0.5, "#8d99a3");
      transitionGradient.addColorStop(0.66, "#55616a");
      transitionGradient.addColorStop(0.82, "#111519");
      transitionGradient.addColorStop(1, "#020304");
      this.ctx.fillStyle = transitionGradient;
      this.ctx.fillRect(0, caveTop, this.viewport.width, transitionBottom - caveTop);

      const transitionTint = this.ctx.createLinearGradient(0, caveTop, 0, transitionBottom);
      transitionTint.addColorStop(0, "rgba(0, 0, 0, 0)");
      transitionTint.addColorStop(0.22, `${theme.horizon}08`);
      transitionTint.addColorStop(0.6, `${theme.horizon}12`);
      transitionTint.addColorStop(1, `${theme.depth}20`);
      this.ctx.fillStyle = transitionTint;
      this.ctx.fillRect(0, caveTop, this.viewport.width, transitionBottom - caveTop);
    }

    const caveGradient = this.ctx.createLinearGradient(0, transitionBottom, 0, this.viewport.height);
    caveGradient.addColorStop(0, "#020304");
    caveGradient.addColorStop(0.18, "#030405");
    caveGradient.addColorStop(1, theme.depth);
    this.ctx.fillStyle = caveGradient;
    this.ctx.fillRect(0, transitionBottom, this.viewport.width, this.viewport.height - transitionBottom);

    const caveTint = this.ctx.createRadialGradient(
      this.viewport.width * 0.5,
      Math.max(transitionBottom + 80, this.viewport.height * 0.42),
      24,
      this.viewport.width * 0.5,
      Math.max(transitionBottom + 80, this.viewport.height * 0.42),
      this.viewport.width * 0.7,
    );
    caveTint.addColorStop(0, `${theme.horizon}18`);
    caveTint.addColorStop(0.58, `${theme.glow}08`);
    caveTint.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = caveTint;
    this.ctx.fillRect(0, caveTop, this.viewport.width, this.viewport.height - caveTop);

    this.#drawCaveNoise(caveTop, theme);
  }

  #drawClouds(skyBottom) {
    const surfaceY = this.world.surfaceRow * TILE_SIZE;
    const bandTop = -32;
    const bandBottom = surfaceY - 12;
    const visibleTop = this.camera.y;
    const visibleBottom = this.camera.y + this.viewport.height;

    if (visibleBottom < bandTop || visibleTop > bandBottom) {
      return;
    }

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.viewport.width, skyBottom);
    this.ctx.clip();

    const cloudSets = [
      { offsetX: 0, offsetY: 22, speed: 0.12, alpha: 0.24 },
      { offsetX: 140, offsetY: 64, speed: 0.18, alpha: 0.17 },
      { offsetX: 60, offsetY: 108, speed: 0.24, alpha: 0.12 },
    ];

    for (const layer of cloudSets) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${layer.alpha})`;
      for (let index = 0; index < 7; index += 1) {
        const worldX = 80 + index * 170 + layer.offsetX;
        const worldY = layer.offsetY + (index % 2) * 12;
        const screenX = worldX - this.camera.x * layer.speed;
        const screenY = worldY - this.camera.y;
        this.#drawCloudShape(screenX, screenY, 0.9 + (index % 3) * 0.18);
      }
    }

    this.ctx.restore();

    const mistGradient = this.ctx.createLinearGradient(0, 0, 0, Math.min(CLOUD_BAND_HEIGHT, skyBottom));
    mistGradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    mistGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    this.ctx.fillStyle = mistGradient;
    this.ctx.fillRect(0, 0, this.viewport.width, Math.min(CLOUD_BAND_HEIGHT, skyBottom));
  }

  #drawCloudShape(x, y, scale = 1) {
    const width = 62 * scale;
    const height = 18 * scale;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, width * 0.24, height * 0.7, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.22, y - height * 0.28, width * 0.28, height * 0.9, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.52, y - height * 0.08, width * 0.24, height * 0.76, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.76, y, width * 0.18, height * 0.58, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  #drawCaveNoise(caveTop, theme) {
    if (caveTop >= this.viewport.height) {
      return;
    }

    const cellSize = 22;
    const startColumn = Math.floor(this.camera.x / cellSize) - 1;
    const endColumn = Math.ceil((this.camera.x + this.viewport.width) / cellSize) + 1;
    const startRow = Math.floor((this.camera.y + caveTop) / cellSize) - 1;
    const endRow = Math.ceil((this.camera.y + this.viewport.height) / cellSize) + 1;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, caveTop, this.viewport.width, this.viewport.height - caveTop);
    this.ctx.clip();

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const noise = this.#backgroundNoise(column, row);
        const x = column * cellSize - this.camera.x;
        const y = row * cellSize - this.camera.y;

        if (noise > 0.72) {
          this.ctx.fillStyle = `${theme.horizon}12`;
          this.ctx.fillRect(x, y, 2, 2);
        }

        if (noise > 0.84) {
          this.ctx.fillStyle = `${theme.glow}0c`;
          this.ctx.fillRect(x + 8, y + 5, 3, 1);
        }

        if (noise < 0.14) {
          this.ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
          this.ctx.fillRect(x + 3, y + 11, 4, 2);
        }
      }
    }

    this.ctx.restore();
  }

  #backgroundNoise(column, row) {
    const value = Math.sin(column * 12.9898 + row * 78.233 + this.world.seed * 0.0001) * 43758.5453;
    return value - Math.floor(value);
  }

  #drawVisibleTerrain(world) {
    const bounds = world.getVisibleTileBounds(this.camera, this.viewport.width, this.viewport.height);
    const platforms = [];
    for (let row = bounds.startRow; row < bounds.endRow; row += 1) {
      for (let column = bounds.startColumn; column < bounds.endColumn; column += 1) {
        const tile = world.getTile(column, row);
        if (!tile || (tile.type === TILE_TYPES.EMPTY && !tile.debrisType)) {
          continue;
        }

        if (tile.type === TILE_TYPES.PLATFORM) {
          platforms.push({ tile, column, row });
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

    for (const platform of platforms) {
      this.#drawPlatformTile(platform.tile, platform.column, platform.row);
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
      this.#drawProceduralTile(context, tile, x, y, column, row);
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
      this.#drawDebris(context, x, this.#getDebrisDrawY(tile, y), tile.debrisType, tile.debrisVariant ?? 0);
    }

    if (tile.breakRatio > 0) {
      this.#drawDamageCracks(context, x, y, tile.breakRatio);
    }
  }

  #drawProceduralTile(context, tile, x, y, column = 0, row = 0) {
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
      case "magma":
        this.#drawMagmaPattern(context, tile.definition, x, y, TILE_SIZE, performance.now() * 0.0018, column, row);
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
      case "platform":
        context.fillRect(x + 4, y + 1, 24, 5);
        context.fillRect(x + 6, y + 6, 20, 2);
        context.fillStyle = "#4f3720";
        context.fillRect(x + 8, y + 8, 3, 6);
        context.fillRect(x + 15, y + 8, 3, 6);
        context.fillRect(x + 22, y + 8, 3, 6);
        context.fillStyle = tile.definition.accent;
        context.fillRect(x + 6, y + 2, 20, 1);
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
      case "magma":
        this.#drawMagmaPattern(context, definition, 0, 0, size, 0, 0, 0);
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
      case "platform":
        context.fillRect(4 * unit, 1 * unit, 24 * unit, 5 * unit);
        context.fillRect(6 * unit, 6 * unit, 20 * unit, 2 * unit);
        context.fillStyle = "#4f3720";
        context.fillRect(8 * unit, 8 * unit, 3 * unit, 6 * unit);
        context.fillRect(15 * unit, 8 * unit, 3 * unit, 6 * unit);
        context.fillRect(22 * unit, 8 * unit, 3 * unit, 6 * unit);
        context.fillStyle = definition.accent;
        context.fillRect(6 * unit, 2 * unit, 20 * unit, 1 * unit);
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

  #drawMagmaPattern(context, definition, x, y, size, time, column, row) {
    const unit = size / 32;
    const phase = time * 3.4 + column * 0.73 + row * 0.51;
    const pulseA = (Math.sin(phase) + 1) * 0.5;
    const pulseB = (Math.sin(phase * 1.37 + 1.2) + 1) * 0.5;
    const pulseC = (Math.cos(phase * 1.91 - 0.8) + 1) * 0.5;

    context.fillStyle = definition.fill;
    context.fillRect(x, y, size, size);

    context.fillStyle = "rgba(33, 12, 16, 0.92)";
    context.fillRect(x + 2 * unit, y + 2 * unit, 10 * unit, 9 * unit);
    context.fillRect(x + 18 * unit, y + 3 * unit, 11 * unit, 8 * unit);
    context.fillRect(x + 4 * unit, y + 19 * unit, 9 * unit, 9 * unit);
    context.fillRect(x + 16 * unit, y + 18 * unit, 12 * unit, 10 * unit);

    context.fillStyle = `rgb(${160 + Math.round(pulseA * 60)}, ${46 + Math.round(pulseB * 44)}, ${20 + Math.round(pulseC * 18)})`;
    context.fillRect(x + 4 * unit, y + (6 + Math.round(pulseA * 2)) * unit, 24 * unit, 4 * unit);
    context.fillRect(x + 6 * unit, y + (14 + Math.round(pulseB * 2)) * unit, 19 * unit, 4 * unit);
    context.fillRect(x + 8 * unit, y + (22 - Math.round(pulseC * 2)) * unit, 16 * unit, 3 * unit);

    context.fillStyle = `rgb(${220 + Math.round(pulseB * 28)}, ${112 + Math.round(pulseA * 50)}, ${28 + Math.round(pulseC * 20)})`;
    context.fillRect(x + 9 * unit, y + (8 + Math.round(pulseC * 1.5)) * unit, 5 * unit, 5 * unit);
    context.fillRect(x + 20 * unit, y + (12 - Math.round(pulseA * 2)) * unit, 4 * unit, 4 * unit);
    context.fillRect(x + 13 * unit, y + (19 + Math.round(pulseB * 1.5)) * unit, 6 * unit, 5 * unit);

    context.fillStyle = `rgba(255, ${180 + Math.round(pulseA * 40)}, ${88 + Math.round(pulseB * 32)}, 0.7)`;
    context.fillRect(x + 7 * unit, y + 7 * unit, 16 * unit, 1 * unit);
    context.fillRect(x + 11 * unit, y + 15 * unit, 10 * unit, 1 * unit);
    context.fillRect(x + 10 * unit, y + 23 * unit, 8 * unit, 1 * unit);
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

  #drawPlatformTile(tile, column, row) {
    const x = column * TILE_SIZE - this.camera.x;
    const y = row * TILE_SIZE - this.camera.y;

    this.ctx.fillStyle = tile.definition.fill;
    this.ctx.fillRect(x + 4, y + 1, 24, 5);
    this.ctx.fillRect(x + 6, y + 6, 20, 2);
    this.ctx.fillStyle = "#4f3720";
    this.ctx.fillRect(x + 8, y + 8, 3, 6);
    this.ctx.fillRect(x + 15, y + 8, 3, 6);
    this.ctx.fillRect(x + 22, y + 8, 3, 6);
    this.ctx.fillStyle = tile.definition.accent;
    this.ctx.fillRect(x + 6, y + 2, 20, 1);

    if (tile.debrisType) {
      this.#drawDebris(this.ctx, x, this.#getDebrisDrawY(tile, y), tile.debrisType, tile.debrisVariant ?? 0);
    }

    if (tile.breakRatio > 0) {
      this.#drawDamageCracks(this.ctx, x, y, tile.breakRatio);
    }
  }

  #getDebrisDrawY(tile, y) {
    if (tile.type === TILE_TYPES.PLATFORM) {
      return y;
    }

    return y + TILE_SIZE - 8;
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

  #paintIcon(canvas, tileType) {
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

  #drawFloatingTexts(floatingTexts = []) {
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
        this.#drawHotbarItemIcon(iconX, y - iconSize * 0.5, iconSize, floatingText.iconItemId);
      }
    }

    this.ctx.restore();
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
    const toastMessage = roundInfo.notification?.message ?? "";
    const toastUrgent = roundInfo.notification?.urgent ? "true" : "false";
    const hudSignature = [
      roundInfo.timeLeft,
      roundInfo.round,
      roundInfo.bank,
      roundInfo.urgent ? 1 : 0,
      toastMessage,
      toastUrgent,
    ].join("|");

    if (hudSignature !== this.hudSignature) {
      this.hudSignature = hudSignature;
      this.#setDataAttributeIfChanged(this.dom.roundTimer, "data-urgent", roundInfo.urgent ? "true" : "false");
      this.#setTextContentIfChanged(this.dom.roundTimerValue, `${roundInfo.timeLeft}s`);
      this.#setTextContentIfChanged(this.dom.roundValue, String(roundInfo.round));
      this.#setTextContentIfChanged(this.dom.bankValue, `${roundInfo.bank}€`);

      if (toastMessage) {
        this.#setTextContentIfChanged(this.dom.roundToast, toastMessage);
        this.#setDataAttributeIfChanged(this.dom.roundToast, "data-visible", "true");
        this.#setDataAttributeIfChanged(this.dom.roundToast, "data-urgent", toastUrgent);
      } else {
        this.#setTextContentIfChanged(this.dom.roundToast, "");
        this.#setDataAttributeIfChanged(this.dom.roundToast, "data-visible", "false");
        this.#setDataAttributeIfChanged(this.dom.roundToast, "data-urgent", "false");
      }
    }

    this.#drawBonusStats(this.dom.bonusStats, roundInfo.bonuses);

    this.#drawPlatformCooldown(roundInfo.platformCooldown ?? 0);
  }

  #drawBonusStats(container, bonuses = {}) {
    if (!container) {
      return;
    }

    const bonusStats = this.#getBonusStats(bonuses);
    const signature = bonusStats
      .map(({ label, value, active }) => `${label}:${value}:${active ? 1 : 0}`)
      .join("|");

    if (signature === this.bonusStatsSignature) {
      return;
    }

    this.bonusStatsSignature = signature;
    container.replaceChildren(...bonusStats.map(({ label, value, active }) => {
      const statEl = document.createElement("div");
      statEl.className = "bonus-stat";
      statEl.setAttribute("data-active", active ? "true" : "false");

      const labelEl = document.createElement("span");
      labelEl.className = "bonus-stat-label";
      labelEl.textContent = label;

      const valueEl = document.createElement("strong");
      valueEl.className = "bonus-stat-value";
      valueEl.textContent = value;

      statEl.append(labelEl, valueEl);
      return statEl;
    }));
  }

  #getBonusStats(bonuses = {}) {
    const definitions = [
      { key: "moveSpeed", label: "Move", value: bonuses.moveSpeed ?? 0 },
      { key: "jumpPower", label: "Jump", value: bonuses.jumpPower ?? 0 },
      { key: "swingRate", label: "Swing", value: bonuses.swingRate ?? 0 },
      { key: "platformCooldown", label: "Platform", value: bonuses.platformCooldown ?? 0 },
      { key: "luck", label: "Luck", value: bonuses.luck ?? 0 },
      { key: "mastery", label: "Mastery", value: bonuses.mastery ?? 0 },
      { key: "toolDamage", label: "Damage", value: bonuses.toolDamage ?? 0 },
    ];

    return definitions.map(({ label, value }) => ({
        label,
        active: Math.abs(value) > 0.0001,
        value: this.#formatBonusStatValue(value),
      }));
  }

  #formatBonusStatValue(value) {
    const percent = Math.round(value * 100);
    return `${percent >= 0 ? "+" : ""}${percent}%`;
  }

  #drawSurveyPanel(player, target) {
    const stratum = this.world.getStratumAtPixel(player.getCenter().y);
    const stratumSignature = [
      stratum.name,
      stratum.depth,
      stratum.base[0]?.type ?? "",
      stratum.primaryOres.map((ore) => ore.type).join(","),
      [...stratum.bonusFromPrev, ...stratum.bonusFromNext].map((ore) => ore.type).join(","),
    ].join("|");

    if (stratumSignature !== this.stratumSignature) {
      this.stratumSignature = stratumSignature;
      if (this.lastStratumIconType !== stratum.base[0].type) {
        this.#paintIcon(this.dom.stratumIcon, stratum.base[0].type);
        this.lastStratumIconType = stratum.base[0].type;
      }
      this.#setTextContentIfChanged(this.dom.stratumName, stratum.name);
      this.#setTextContentIfChanged(this.dom.stratumDepth, `Depth ${stratum.depth}m`);

      if (this.dom.stratumCoreSwatches) {
        this.dom.stratumCoreSwatches.replaceChildren();
        for (const ore of stratum.primaryOres) {
          this.#renderOreChip(this.dom.stratumCoreSwatches, ore.type);
        }
      }

      if (this.dom.stratumBonusSwatches) {
        this.dom.stratumBonusSwatches.replaceChildren();
        for (const ore of [...stratum.bonusFromPrev, ...stratum.bonusFromNext]) {
          this.#renderOreChip(this.dom.stratumBonusSwatches, ore.type);
        }
      }
    }

    if (!this.dom.blockName || !this.dom.blockType || !this.dom.blockHp || !this.dom.blockValue || !this.dom.blockRange || !this.dom.blockYield) {
      return;
    }

    if (!target) {
      if (this.blockSignature === "empty") {
        return;
      }

      this.blockSignature = "empty";
      if (this.lastBlockIconType !== TILE_TYPES.EMPTY) {
        this.#paintIcon(this.dom.blockIcon, TILE_TYPES.EMPTY);
        this.lastBlockIconType = TILE_TYPES.EMPTY;
      }
      this.#setTextContentIfChanged(this.dom.blockName, "None");
      this.#setTextContentIfChanged(this.dom.blockType, "No target");
      this.#setTextContentIfChanged(this.dom.blockHp, "--");
      this.#setTextContentIfChanged(this.dom.blockValue, "--");
      this.#setTextContentIfChanged(this.dom.blockRange, "--");
      this.#setTextContentIfChanged(this.dom.blockYield, "--");
      return;
    }

    const tile = this.world.getTile(target.column, target.row);
    if (!tile) {
      if (this.blockSignature === "empty") {
        return;
      }

      this.blockSignature = "empty";
      if (this.lastBlockIconType !== TILE_TYPES.EMPTY) {
        this.#paintIcon(this.dom.blockIcon, TILE_TYPES.EMPTY);
        this.lastBlockIconType = TILE_TYPES.EMPTY;
      }
      this.#setTextContentIfChanged(this.dom.blockName, "None");
      this.#setTextContentIfChanged(this.dom.blockType, "No target");
      this.#setTextContentIfChanged(this.dom.blockHp, "--");
      this.#setTextContentIfChanged(this.dom.blockValue, "--");
      this.#setTextContentIfChanged(this.dom.blockRange, "--");
      this.#setTextContentIfChanged(this.dom.blockYield, "--");
      return;
    }

    const blockTypeText = tile.type === TILE_TYPES.CHEST ? "Treasure chest" : (tile.definition.drop ? "Ore" : "Stratum block");
    const blockHpText = tile.maxHp > 0 ? `${Math.ceil(tile.hp)} / ${tile.maxHp}` : "--";
    const blockValueText = tile.definition.drop
      ? `${ITEM_DEFINITIONS[tile.definition.drop]?.value ?? 0}€`
      : (tile.type === TILE_TYPES.CHEST ? "Reward" : "0€");
    const blockRangeText = target.distance ? `${(target.distance / TILE_SIZE).toFixed(1)} tiles` : "In range";
    const dropRange = this.world.getOreDropRange(target.row, tile.type, player?.bonuses);
    const blockYieldText = tile.type === TILE_TYPES.CHEST
      ? "1 card pick"
      : dropRange
      ? this.#formatOreDropRange(dropRange)
      : "--";

    const blockSignature = [
      tile.type,
      tile.definition.label,
      blockTypeText,
      blockHpText,
      blockValueText,
      blockRangeText,
      blockYieldText,
    ].join("|");

    if (blockSignature === this.blockSignature) {
      return;
    }

    this.blockSignature = blockSignature;
    if (this.lastBlockIconType !== tile.type) {
      this.#paintIcon(this.dom.blockIcon, tile.type);
      this.lastBlockIconType = tile.type;
    }
    this.#setTextContentIfChanged(this.dom.blockName, tile.definition.label);
    this.#setTextContentIfChanged(this.dom.blockType, blockTypeText);
    this.#setTextContentIfChanged(this.dom.blockHp, blockHpText);
    this.#setTextContentIfChanged(this.dom.blockValue, blockValueText);
    this.#setTextContentIfChanged(this.dom.blockRange, blockRangeText);
    this.#setTextContentIfChanged(this.dom.blockYield, blockYieldText);
  }

  #formatOreDropRange(dropRange) {
    const normalRange = dropRange.normalMin === dropRange.normalMax
      ? `${dropRange.normalMin}`
      : `${dropRange.normalMin}-${dropRange.normalMax}`;

    if (!dropRange.bonusMax) {
      return normalRange;
    }

    return `${normalRange} (+${dropRange.bonusMax})`;
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

  #drawPlatformCooldown(cooldownProgress) {
    const slots = 8;
    const slotSize = 52;
    const gap = 8;
    const totalWidth = slots * slotSize + (slots - 1) * gap;
    const startX = (this.viewport.width - totalWidth) * 0.5;
    const startY = this.viewport.height - slotSize - 24;
    const centerX = startX - 42;
    const centerY = startY + slotSize * 0.5;
    const radius = 26;
    const ready = cooldownProgress <= 0;
    const remainingArc = Math.max(0, Math.min(1, cooldownProgress));

    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.fillStyle = "rgba(10, 16, 28, 0.9)";
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = ready ? "rgba(241, 208, 77, 0.8)" : "rgba(136, 185, 216, 0.5)";
    this.ctx.lineWidth = 2.5;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.fillStyle = "rgba(120, 132, 148, 0.4)";
    this.ctx.arc(-0.0001, -0.0001, radius - 2, -Math.PI * 0.5, -Math.PI * 0.5 - Math.PI * 2 * remainingArc, true);
    this.ctx.closePath();
    this.ctx.fill();

    this.#drawPlatformClockIcon();
    this.ctx.restore();
  }

  #drawPlatformClockIcon() {
    this.ctx.fillStyle = "#d7b07b";
    this.ctx.fillRect(-12, 2, 24, 6);
    this.ctx.fillRect(-10, -1, 20, 3);
    this.ctx.fillStyle = "#4f3720";
    this.ctx.fillRect(-9, 8, 3, 5);
    this.ctx.fillRect(-1, 8, 3, 5);
    this.ctx.fillRect(7, 8, 3, 5);
    this.ctx.fillStyle = "rgba(255, 246, 208, 0.75)";
    this.ctx.fillRect(-10, 0, 20, 1);
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