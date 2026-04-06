import { ITEM_DEFINITIONS } from "./inventory.js";
import { TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";
import { RendererSubsystem } from "./rendererSubsystem.js";

const SUNNY_SKY_TOP = "#8fd8ff";
const SUNNY_SKY_MID = "#dff6ff";
const CLOUD_BAND_HEIGHT = 168;
const SURFACE_TRANSITION_DEPTH = TILE_SIZE * 3;
const ATLAS_TILE_OVERFLOW_TOP = 4;
const ATLAS_TILE_HEIGHT = TILE_SIZE + ATLAS_TILE_OVERFLOW_TOP;
const MAGMA_FRAME_COUNT = 6;
const MAGMA_ANIMATION_FPS = 6;
const CRACK_LEVEL_COUNT = 4;

export class RendererWorldSubsystem extends RendererSubsystem {
  constructor(renderer) {
    super(renderer);
    this.tileAtlas = null;
    this.tileAtlasLookup = new Map();
    this.tileAtlasMeta = null;
  }

  ensureTileAtlas() {
    const nextAtlas = this.assets?.terrainAtlas ?? null;
    const nextManifest = this.assets?.terrainAtlasManifest ?? null;
    if (this.tileAtlas === nextAtlas && this.tileAtlasMeta === nextManifest?.meta) {
      return;
    }

    this.tileAtlas = nextAtlas;
    this.tileAtlasMeta = nextManifest?.meta ?? null;
    this.tileAtlasLookup = new Map(Object.entries(nextManifest?.entries ?? {}));
  }

  buildBaseTileAtlasKey({ type, frame = 0 }) {
    return `base:${type}:${frame}`;
  }

  buildSurfaceOverlayAtlasKey(surfaceTreatment, surfaceVariant = 0) {
    const variant = surfaceTreatment === "grass" ? surfaceVariant % 3 : 0;
    return `overlay:${surfaceTreatment}:${variant}`;
  }

  buildDebrisAtlasKey(type, variant, placement) {
    return `debris:${placement}:${type}:${variant % 3}`;
  }

  buildCrackAtlasKey(crackLevel) {
    const maxCrackLevel = this.tileAtlasMeta?.crackLevels ?? CRACK_LEVEL_COUNT;
    return `crack:${Math.max(1, Math.min(maxCrackLevel, crackLevel))}`;
  }

  drawPreRenderedBaseTile(context, tile, x, y, column, row) {
    this.ensureTileAtlas();

    const frame = tile.type === TILE_TYPES.MAGMA ? this.getMagmaFrame(column, row) : 0;
    return this.drawAtlasEntry(
      context,
      this.buildBaseTileAtlasKey({ type: tile.type, frame }),
      x,
      y,
    );
  }

  drawPreRenderedSurfaceOverlay(context, x, y, surfaceTreatment, surfaceVariant = 0) {
    if (!surfaceTreatment) {
      return false;
    }

    this.ensureTileAtlas();
    return this.drawAtlasEntry(context, this.buildSurfaceOverlayAtlasKey(surfaceTreatment, surfaceVariant), x, y);
  }

  drawPreRenderedDebris(context, x, y, debrisType, debrisVariant, placement = "ground") {
    this.ensureTileAtlas();
    return this.drawAtlasEntry(context, this.buildDebrisAtlasKey(debrisType, debrisVariant ?? 0, placement), x, y);
  }

  drawPreRenderedDamageCracks(context, x, y, breakRatio) {
    this.ensureTileAtlas();
    const maxCrackLevel = this.tileAtlasMeta?.crackLevels ?? CRACK_LEVEL_COUNT;
    const crackLevel = Math.min(maxCrackLevel, Math.max(1, Math.ceil(breakRatio * maxCrackLevel)));
    return this.drawAtlasEntry(context, this.buildCrackAtlasKey(crackLevel), x, y);
  }

  drawAtlasEntry(context, key, x, y) {
    if (!this.tileAtlas) {
      return false;
    }

    const atlasSprite = this.tileAtlasLookup.get(key);
    if (!atlasSprite) {
      return false;
    }

    context.drawImage(
      this.tileAtlas,
      atlasSprite.x,
      atlasSprite.y,
      TILE_SIZE,
      this.tileAtlasMeta?.tileHeight ?? ATLAS_TILE_HEIGHT,
      x,
      y - (this.tileAtlasMeta?.overflowTop ?? ATLAS_TILE_OVERFLOW_TOP),
      TILE_SIZE,
      this.tileAtlasMeta?.tileHeight ?? ATLAS_TILE_HEIGHT,
    );
    return true;
  }

  getMagmaFrame(column, row) {
    const frameCount = this.tileAtlasMeta?.magmaFrames ?? MAGMA_FRAME_COUNT;
    const animationFps = this.tileAtlasMeta?.magmaAnimationFps ?? MAGMA_ANIMATION_FPS;
    const elapsedFrames = Math.floor(performance.now() * 0.001 * animationFps);
    const offset = Math.abs((column * 17 + row * 31) % frameCount);
    return (elapsedFrames + offset) % frameCount;
  }

  drawBackground(player) {
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

      this.drawClouds(skyBottom);
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

    this.drawCaveNoise(caveTop, theme);
  }

  drawClouds(skyBottom) {
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
        this.drawCloudShape(screenX, screenY, 0.9 + (index % 3) * 0.18);
      }
    }

    this.ctx.restore();

    const mistGradient = this.ctx.createLinearGradient(0, 0, 0, Math.min(CLOUD_BAND_HEIGHT, skyBottom));
    mistGradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    mistGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    this.ctx.fillStyle = mistGradient;
    this.ctx.fillRect(0, 0, this.viewport.width, Math.min(CLOUD_BAND_HEIGHT, skyBottom));
  }

  drawCloudShape(x, y, scale = 1) {
    const width = 62 * scale;
    const height = 18 * scale;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, width * 0.24, height * 0.7, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.22, y - height * 0.28, width * 0.28, height * 0.9, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.52, y - height * 0.08, width * 0.24, height * 0.76, 0, 0, Math.PI * 2);
    this.ctx.ellipse(x + width * 0.76, y, width * 0.18, height * 0.58, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawCaveNoise(caveTop, theme) {
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
        const noise = this.backgroundNoise(column, row);
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

  backgroundNoise(column, row) {
    const value = Math.sin(column * 12.9898 + row * 78.233 + this.world.seed * 0.0001) * 43758.5453;
    return value - Math.floor(value);
  }

  drawBaseTileLayer(context, tile, x, y, column, row) {
    if (!tile || tile.type === TILE_TYPES.EMPTY) {
      return;
    }
    this.drawPreRenderedBaseTile(context, tile, x, y, column, row);
  }

  drawSurfaceOverlayLayer(context, tile, x, y) {
    if (!tile?.surfaceTreatment) {
      return;
    }
    this.drawPreRenderedSurfaceOverlay(context, x, y, tile.surfaceTreatment, tile.surfaceVariant ?? 0);
  }

  drawDebrisLayer(context, tile, x, y) {
    if (!tile?.debrisType) {
      return;
    }

    const placement = tile.type === TILE_TYPES.PLATFORM ? "top" : "ground";
    this.drawPreRenderedDebris(context, x, y, tile.debrisType, tile.debrisVariant ?? 0, placement);
  }

  drawDamageLayer(context, tile, x, y) {
    if (!tile?.breakRatio || tile.breakRatio <= 0) {
      return;
    }
    this.drawPreRenderedDamageCracks(context, x, y, tile.breakRatio);
  }

  drawVisibleTerrain(world) {
    const bounds = world.getVisibleTileBounds(this.camera, this.viewport.width, this.viewport.height);
    const baseTiles = [];
    const platformTiles = [];
    const overlayPasses = {
      grass: [],
      moss: [],
      rock: [],
      "rock-spires": [],
    };
    const debrisTiles = [];
    const crackedTiles = [];

    for (let row = bounds.startRow; row < bounds.endRow; row += 1) {
      for (let column = bounds.startColumn; column < bounds.endColumn; column += 1) {
        const tile = world.getTile(column, row);
        if (!tile || (tile.type === TILE_TYPES.EMPTY && !tile.debrisType)) {
          continue;
        }

        const entry = {
          tile,
          column,
          row,
          x: column * TILE_SIZE - this.camera.x,
          y: row * TILE_SIZE - this.camera.y,
        };

        if (tile.type === TILE_TYPES.PLATFORM) {
          platformTiles.push(entry);
        } else if (tile.type !== TILE_TYPES.EMPTY) {
          baseTiles.push(entry);
        }

        if (tile.surfaceTreatment && overlayPasses[tile.surfaceTreatment]) {
          overlayPasses[tile.surfaceTreatment].push(entry);
        }

        if (tile.debrisType) {
          debrisTiles.push(entry);
        }

        if (tile.breakRatio > 0) {
          crackedTiles.push(entry);
        }
      }
    }

    for (const entry of baseTiles) {
      this.drawBaseTileLayer(this.ctx, entry.tile, entry.x, entry.y, entry.column, entry.row);
    }

    for (const treatment of ["grass", "moss", "rock", "rock-spires"]) {
      for (const entry of overlayPasses[treatment]) {
        this.drawSurfaceOverlayLayer(this.ctx, entry.tile, entry.x, entry.y);
      }
    }

    for (const entry of platformTiles) {
      this.drawBaseTileLayer(this.ctx, entry.tile, entry.x, entry.y, entry.column, entry.row);
    }

    for (const entry of debrisTiles) {
      this.drawDebrisLayer(this.ctx, entry.tile, entry.x, entry.y);
    }

    for (const entry of crackedTiles) {
      this.drawDamageLayer(this.ctx, entry.tile, entry.x, entry.y);
    }
  }

  drawTileToContext(context, tile, x, y, column, row) {
    if (tile.type === TILE_TYPES.EMPTY) {
      if (tile.debrisType) {
        this.drawDebrisLayer(context, tile, x, y);
      }
      return;
    }

    this.drawBaseTileLayer(context, tile, x, y, column, row);
    this.drawSurfaceOverlayLayer(context, tile, x, y);
    this.drawDebrisLayer(context, tile, x, y);
    this.drawDamageLayer(context, tile, x, y);
  }


  drawPlatformTile(tile, column, row) {
    const x = column * TILE_SIZE - this.camera.x;
    const y = row * TILE_SIZE - this.camera.y;
    this.drawBaseTileLayer(this.ctx, tile, x, y, column, row);
  }

  getDebrisDrawY(tile, y) {
    if (tile.type === TILE_TYPES.PLATFORM) {
      return y;
    }

    return y + TILE_SIZE - 8;
  }

  drawFallingDebris(fallingDebris = []) {
    for (const debris of fallingDebris) {
      const x = debris.x - this.camera.x;
      const y = debris.y - this.camera.y;
      if (x < -TILE_SIZE || y < -TILE_SIZE || x > this.viewport.width || y > this.viewport.height + TILE_SIZE) {
        continue;
      }
      this.drawPreRenderedDebris(this.ctx, x, y, debris.type, debris.variant, "top");
    }
  }

  drawTilePreviewFromAtlas(context, tileType, size) {
    const definition = TILE_DEFINITIONS[tileType];
    if (!definition || definition.pattern === "empty") {
      return;
    }

    this.ensureTileAtlas();
    const frame = tileType === TILE_TYPES.MAGMA ? this.getMagmaFrame(0, 0) : 0;
    const key = this.buildBaseTileAtlasKey({ type: tileType, frame });
    const atlasSprite = this.tileAtlasLookup.get(key);
    if (!this.tileAtlas || !atlasSprite) {
      return;
    }

    context.clearRect(0, 0, size, size);
    context.drawImage(
      this.tileAtlas,
      atlasSprite.x,
      atlasSprite.y + (this.tileAtlasMeta?.overflowTop ?? ATLAS_TILE_OVERFLOW_TOP),
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      size,
      size,
    );
  }

  paintIcon(canvas, tileType) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    this.drawTilePreviewFromAtlas(context, tileType, canvas.width);
  }

  renderOreChip(container, tileType) {
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
    this.drawTilePreviewFromAtlas(context, tileType, 18);
  }

  drawMiningHighlight(hoverTarget, miningResult) {
    const target = miningResult?.target ?? hoverTarget;
    if (!target) {
      return;
    }

    const { column, row } = target;
    const x = column * TILE_SIZE - this.camera.x;
    const y = row * TILE_SIZE - this.camera.y;
    this.ctx.strokeStyle = miningResult?.target ? "rgba(255, 228, 156, 0.9)" : "rgba(136, 185, 216, 0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  drawHotbarItemIcon(x, y, size, itemId, context = this.ctx) {
    const tileDefinition = TILE_DEFINITIONS[itemId];
    if (!tileDefinition) {
      context.fillStyle = ITEM_DEFINITIONS[itemId]?.color ?? "#f2ede3";
      context.fillRect(x, y, size, size);
      return;
    }

    context.save();
    context.translate(x, y);
    this.drawTilePreviewFromAtlas(context, itemId, size);
    context.restore();
  }
}