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
const TILE_ATLAS_COLUMNS = 8;
const SURFACE_VARIANTS = Object.freeze([
  Object.freeze({ surfaceTreatment: null, surfaceVariant: 0 }),
  Object.freeze({ surfaceTreatment: "grass", surfaceVariant: 0 }),
  Object.freeze({ surfaceTreatment: "grass", surfaceVariant: 1 }),
  Object.freeze({ surfaceTreatment: "grass", surfaceVariant: 2 }),
  Object.freeze({ surfaceTreatment: "moss", surfaceVariant: 0 }),
  Object.freeze({ surfaceTreatment: "rock", surfaceVariant: 0 }),
  Object.freeze({ surfaceTreatment: "rock-spires", surfaceVariant: 0 }),
]);

export class RendererWorldSubsystem extends RendererSubsystem {
  constructor(renderer) {
    super(renderer);
    this.tileAtlas = null;
    this.tileAtlasLookup = new Map();
  }

  ensureTileAtlas() {
    const nextAtlas = this.assets?.tilesheet ?? null;
    if (this.tileAtlas === nextAtlas) {
      return;
    }

    this.tileAtlas = nextAtlas;
    this.tileAtlasLookup = this.buildTileAtlasLookup();
  }

  buildTileAtlasLookup() {
    const lookup = new Map();
    let index = 0;

    for (const [type] of Object.entries(TILE_DEFINITIONS)) {
      if (type === TILE_TYPES.EMPTY) {
        continue;
      }

      const variants = this.supportsSurfaceTreatment(type)
        ? SURFACE_VARIANTS
        : [{ surfaceTreatment: null, surfaceVariant: 0 }];
      const frameCount = type === TILE_TYPES.MAGMA ? MAGMA_FRAME_COUNT : 1;
      for (let frame = 0; frame < frameCount; frame += 1) {
        for (const variant of variants) {
          lookup.set(this.buildTileAtlasKey({
            type,
            surfaceTreatment: variant.surfaceTreatment,
            surfaceVariant: variant.surfaceVariant,
            frame,
          }), {
            x: (index % TILE_ATLAS_COLUMNS) * TILE_SIZE,
            y: Math.floor(index / TILE_ATLAS_COLUMNS) * ATLAS_TILE_HEIGHT,
          });
          index += 1;
        }
      }
    }

    for (const [type] of Object.entries(TILE_DEFINITIONS)) {
      if (type === TILE_TYPES.EMPTY) {
        continue;
      }

      for (let variant = 0; variant < 3; variant += 1) {
        for (const placement of ["ground", "top"]) {
          lookup.set(this.buildDebrisAtlasKey(type, variant, placement), {
            x: (index % TILE_ATLAS_COLUMNS) * TILE_SIZE,
            y: Math.floor(index / TILE_ATLAS_COLUMNS) * ATLAS_TILE_HEIGHT,
          });
          index += 1;
        }
      }
    }

    for (let crackLevel = 1; crackLevel <= 4; crackLevel += 1) {
      lookup.set(this.buildCrackAtlasKey(crackLevel), {
        x: (index % TILE_ATLAS_COLUMNS) * TILE_SIZE,
        y: Math.floor(index / TILE_ATLAS_COLUMNS) * ATLAS_TILE_HEIGHT,
      });
      index += 1;
    }

    return lookup;
  }

  supportsSurfaceTreatment(type) {
    return ![
      TILE_TYPES.EMPTY,
      TILE_TYPES.CHEST,
      TILE_TYPES.PLATFORM,
      TILE_TYPES.MAGMA,
    ].includes(type);
  }

  buildTileAtlasKey({ type, surfaceTreatment = null, surfaceVariant = 0, frame = 0 }) {
    const treatment = surfaceTreatment ?? "none";
    const variant = surfaceTreatment === "grass" ? surfaceVariant % 3 : 0;
    return `tile:${type}:${treatment}:${variant}:${frame}`;
  }

  buildDebrisAtlasKey(type, variant, placement) {
    return `debris:${placement}:${type}:${variant % 3}`;
  }

  buildCrackAtlasKey(crackLevel) {
    return `crack:${Math.max(1, Math.min(4, crackLevel))}`;
  }

  drawPreRenderedTile(context, tile, x, y, column, row) {
    this.ensureTileAtlas();

    const frame = tile.type === TILE_TYPES.MAGMA ? this.getMagmaFrame(column, row) : 0;
    return this.drawAtlasEntry(
      context,
      this.buildTileAtlasKey({
        type: tile.type,
        surfaceTreatment: tile.surfaceTreatment,
        surfaceVariant: tile.surfaceVariant ?? 0,
        frame,
      }),
      x,
      y,
    );
  }

  drawPreRenderedDebris(context, x, y, debrisType, debrisVariant, placement = "ground") {
    this.ensureTileAtlas();
    return this.drawAtlasEntry(context, this.buildDebrisAtlasKey(debrisType, debrisVariant ?? 0, placement), x, y);
  }

  drawPreRenderedDamageCracks(context, x, y, breakRatio) {
    this.ensureTileAtlas();
    const crackLevel = Math.min(4, Math.max(1, Math.ceil(breakRatio * 4)));
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
      ATLAS_TILE_HEIGHT,
      x,
      y - ATLAS_TILE_OVERFLOW_TOP,
      TILE_SIZE,
      ATLAS_TILE_HEIGHT,
    );
    return true;
  }

  getMagmaFrame(column, row) {
    const elapsedFrames = Math.floor(performance.now() * 0.001 * MAGMA_ANIMATION_FPS);
    const offset = Math.abs((column * 17 + row * 31) % MAGMA_FRAME_COUNT);
    return (elapsedFrames + offset) % MAGMA_FRAME_COUNT;
  }

  drawSurfaceTreatment(context, x, y, surfaceTreatment, surfaceVariant = 0) {
    if (surfaceTreatment === "grass") {
      this.drawGrassCap(context, x, y, surfaceVariant);
    } else if (surfaceTreatment === "moss") {
      this.drawMossCap(context, x, y);
    } else if (surfaceTreatment === "rock") {
      this.drawRockCap(context, x, y, { drawStalagmites: false });
    } else if (surfaceTreatment === "rock-spires") {
      this.drawRockCap(context, x, y, { drawStalagmites: true });
    }
  }

  paintTilePattern(context, definition, x, y, size, { time = 0, column = 0, row = 0 } = {}) {
    const unit = size / 32;
    context.fillStyle = definition.fill;
    context.fillRect(x, y, size, size);
    context.strokeStyle = "rgba(0, 0, 0, 0.18)";
    context.strokeRect(x, y, size, size);
    context.fillStyle = definition.accent;

    switch (definition.pattern) {
      case "speck":
        for (const offset of [4, 11, 18, 24]) {
          context.fillRect(x + offset * unit, y + (6 + (offset % 4) * 4) * unit, 4 * unit, 4 * unit);
        }
        break;
      case "bands":
        context.fillRect(x + 4 * unit, y + 6 * unit, 22 * unit, 2 * unit);
        context.fillRect(x + 7 * unit, y + 14 * unit, 18 * unit, 2 * unit);
        context.fillRect(x + 5 * unit, y + 22 * unit, 20 * unit, 2 * unit);
        break;
      case "slate":
        context.fillRect(x + 5 * unit, y + 5 * unit, 20 * unit, 3 * unit);
        context.fillRect(x + 9 * unit, y + 12 * unit, 16 * unit, 2 * unit);
        context.fillRect(x + 4 * unit, y + 19 * unit, 22 * unit, 3 * unit);
        break;
      case "blocks":
        context.fillRect(x + 5 * unit, y + 5 * unit, 8 * unit, 8 * unit);
        context.fillRect(x + 17 * unit, y + 8 * unit, 9 * unit, 9 * unit);
        context.fillRect(x + 9 * unit, y + 19 * unit, 12 * unit, 6 * unit);
        break;
      case "magma":
        this.drawMagmaPattern(context, definition, x, y, size, time, column, row);
        break;
      case "chest":
        context.fillRect(x + 5 * unit, y + 10 * unit, 22 * unit, 14 * unit);
        context.fillRect(x + 7 * unit, y + 7 * unit, 18 * unit, 5 * unit);
        context.fillStyle = "#34210c";
        context.fillRect(x + 5 * unit, y + 12 * unit, 22 * unit, 2 * unit);
        context.fillStyle = definition.accent;
        context.fillRect(x + 14 * unit, y + 13 * unit, 4 * unit, 8 * unit);
        context.fillRect(x + 5 * unit, y + 16 * unit, 22 * unit, 2 * unit);
        break;
      case "platform":
        context.fillRect(x + 4 * unit, y + 1 * unit, 24 * unit, 5 * unit);
        context.fillRect(x + 6 * unit, y + 6 * unit, 20 * unit, 2 * unit);
        context.fillStyle = "#4f3720";
        context.fillRect(x + 8 * unit, y + 8 * unit, 3 * unit, 6 * unit);
        context.fillRect(x + 15 * unit, y + 8 * unit, 3 * unit, 6 * unit);
        context.fillRect(x + 22 * unit, y + 8 * unit, 3 * unit, 6 * unit);
        context.fillStyle = definition.accent;
        context.fillRect(x + 6 * unit, y + 2 * unit, 20 * unit, 1 * unit);
        break;
      case "ore-cluster":
        context.fillRect(x + 6 * unit, y + 5 * unit, 6 * unit, 6 * unit);
        context.fillRect(x + 18 * unit, y + 8 * unit, 7 * unit, 7 * unit);
        context.fillRect(x + 11 * unit, y + 19 * unit, 8 * unit, 8 * unit);
        break;
      case "ore-gem":
        context.fillRect(x + 7 * unit, y + 6 * unit, 5 * unit, 5 * unit);
        context.fillRect(x + 19 * unit, y + 10 * unit, 6 * unit, 6 * unit);
        context.fillRect(x + 13 * unit, y + 18 * unit, 7 * unit, 7 * unit);
        context.fillRect(x + 9 * unit, y + 14 * unit, 3 * unit, 3 * unit);
        break;
      case "gem-shard":
        context.fillRect(x + 8 * unit, y + 6 * unit, 4 * unit, 8 * unit);
        context.fillRect(x + 20 * unit, y + 9 * unit, 5 * unit, 9 * unit);
        context.fillRect(x + 13 * unit, y + 19 * unit, 6 * unit, 7 * unit);
        break;
      default:
        break;
    }
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

  drawVisibleTerrain(world) {
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

        this.drawTileToContext(
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
      this.drawPlatformTile(platform.tile, platform.column, platform.row);
    }
  }

  drawTileToContext(context, tile, x, y, column, row) {
    if (tile.type === TILE_TYPES.EMPTY) {
      if (tile.debrisType) {
        if (!this.drawPreRenderedDebris(context, x, y, tile.debrisType, tile.debrisVariant ?? 0, "ground")) {
          this.drawDebris(context, x, y + TILE_SIZE - 8, tile.debrisType, tile.debrisVariant ?? 0);
        }
      }
      return;
    }

    if (!this.drawPreRenderedTile(context, tile, x, y, column, row)) {
      this.drawProceduralTile(context, tile, x, y, column, row);
      this.drawSurfaceTreatment(context, x, y, tile.surfaceTreatment, tile.surfaceVariant ?? 0);
    }

    if (tile.debrisType) {
      const placement = tile.type === TILE_TYPES.PLATFORM ? "top" : "ground";
      if (!this.drawPreRenderedDebris(context, x, y, tile.debrisType, tile.debrisVariant ?? 0, placement)) {
        this.drawDebris(context, x, this.getDebrisDrawY(tile, y), tile.debrisType, tile.debrisVariant ?? 0);
      }
    }

    if (tile.breakRatio > 0) {
      if (!this.drawPreRenderedDamageCracks(context, x, y, tile.breakRatio)) {
        this.drawDamageCracks(context, x, y, tile.breakRatio);
      }
    }
  }

  drawProceduralTile(context, tile, x, y, column = 0, row = 0) {
    this.paintTilePattern(context, tile.definition, x, y, TILE_SIZE, {
      time: performance.now() * 0.0018,
      column,
      row,
    });
  }

  drawProceduralTilePreview(context, definition, size) {
    context.clearRect(0, 0, size, size);
    if (!definition || definition.pattern === "empty") {
      return;
    }

    this.paintTilePattern(context, definition, 0, 0, size, { time: 0, column: 0, row: 0 });
  }

  drawMagmaPattern(context, definition, x, y, size, time, column, row) {
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

  drawGrassCap(context, x, y, variant) {
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

  drawMossCap(context, x, y) {
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

  drawRockCap(context, x, y, { drawStalagmites }) {
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

  drawDebris(context, x, y, debrisType, debrisVariant) {
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

  drawPlatformTile(tile, column, row) {
    const x = column * TILE_SIZE - this.camera.x;
    const y = row * TILE_SIZE - this.camera.y;
    this.drawTileToContext(this.ctx, tile, x, y, column, row);
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

      if (!this.drawPreRenderedDebris(this.ctx, x, y, debris.type, debris.variant, "top")) {
        this.drawDebris(this.ctx, x, y, debris.type, debris.variant);
      }
    }
  }

  drawDamageCracks(context, x, y, breakRatio) {
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

  paintIcon(canvas, tileType) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    this.drawProceduralTilePreview(context, TILE_DEFINITIONS[tileType], canvas.width);
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
    this.drawProceduralTilePreview(context, definition, 18);
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
    this.drawProceduralTilePreview(context, tileDefinition, size);
    context.restore();
  }
}