import { PLATFORM_SURFACE_OFFSET, Tile, TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const STRATA = Object.freeze([
  {
    name: "Topsoil Vein",
    bgmTrack: "Morning_Shift_at_the_Quarry",
    skyTheme: Object.freeze({
      name: "earth",
      horizon: "#5c6c46",
      depth: "#2c3522",
      glow: "#8f855c",
    }),
    maxDepth: 18,
    base: [
      { type: TILE_TYPES.DIRT, weight: 0.74 },
      { type: TILE_TYPES.STONE, weight: 0.2 },
      { type: TILE_TYPES.SHALE, weight: 0.06 },
    ],
    primaryOres: [
      { type: TILE_TYPES.COAL, weight: 0.085 },
      { type: TILE_TYPES.COPPER, weight: 0.058 },
    ],
    bonusFromPrev: [],
    bonusFromNext: [
      { type: TILE_TYPES.TIN, weight: 0.014 },
      { type: TILE_TYPES.IRON, weight: 0.008 },
    ],
    coreYield: { base: 2, variance: 1 },
    tunnelChance: 0.025,
    stratumStrength: 0.24,
  },
  {
    name: "Shale Shelf",
    bgmTrack: "Vein_of_Obsidian",
    skyTheme: Object.freeze({
      name: "stone",
      horizon: "#536170",
      depth: "#252f39",
      glow: "#788897",
    }),
    maxDepth: 52,
    base: [
      { type: TILE_TYPES.STONE, weight: 0.46 },
      { type: TILE_TYPES.SHALE, weight: 0.38 },
      { type: TILE_TYPES.DIRT, weight: 0.16 },
    ],
    primaryOres: [
      { type: TILE_TYPES.TIN, weight: 0.096 },
      { type: TILE_TYPES.IRON, weight: 0.088 },
    ],
    bonusFromPrev: [
      { type: TILE_TYPES.COAL, weight: 0.026 },
      { type: TILE_TYPES.COPPER, weight: 0.016 },
    ],
    bonusFromNext: [
      { type: TILE_TYPES.SILVER, weight: 0.016 },
      { type: TILE_TYPES.GOLD, weight: 0.01 },
    ],
    coreYield: { base: 3, variance: 1 },
    tunnelChance: 0.018,
    stratumStrength: 0.18,
  },
  {
    name: "Basalt Forge",
    bgmTrack: "Crucible_of_the_Deep",
    skyTheme: Object.freeze({
      name: "forge",
      horizon: "#8b472e",
      depth: "#341711",
      glow: "#b2764e",
    }),
    maxDepth: 108,
    base: [
      { type: TILE_TYPES.SHALE, weight: 0.26 },
      { type: TILE_TYPES.STONE, weight: 0.26 },
      { type: TILE_TYPES.BASALT, weight: 0.48 },
    ],
    primaryOres: [
      { type: TILE_TYPES.SILVER, weight: 0.094 },
      { type: TILE_TYPES.GOLD, weight: 0.072 },
    ],
    bonusFromPrev: [
      { type: TILE_TYPES.TIN, weight: 0.026 },
      { type: TILE_TYPES.IRON, weight: 0.024 },
    ],
    bonusFromNext: [
      { type: TILE_TYPES.RUBY, weight: 0.014 },
      { type: TILE_TYPES.SAPPHIRE, weight: 0.014 },
    ],
    coreYield: { base: 4, variance: 1 },
    tunnelChance: 0.012,
    stratumStrength: 0.12,
  },
  {
    name: "Abyssal Crown",
    bgmTrack: "Iron_Throat",
    skyTheme: Object.freeze({
      name: "fire",
      horizon: "#7f301b",
      depth: "#220907",
      glow: "#9b5a30",
    }),
    maxDepth: Infinity,
    base: [
      { type: TILE_TYPES.BASALT, weight: 0.5 },
      { type: TILE_TYPES.MAGMA, weight: 0.16 },
      { type: TILE_TYPES.SHALE, weight: 0.18 },
      { type: TILE_TYPES.STONE, weight: 0.16 },
    ],
    primaryOres: [
      { type: TILE_TYPES.RUBY, weight: 0.088 },
      { type: TILE_TYPES.SAPPHIRE, weight: 0.088 },
    ],
    bonusFromPrev: [
      { type: TILE_TYPES.SILVER, weight: 0.024 },
      { type: TILE_TYPES.GOLD, weight: 0.02 },
    ],
    bonusFromNext: [],
    coreYield: { base: 5, variance: 1 },
    tunnelChance: 0.008,
    stratumStrength: 0.08,
  },
]);

const CHEST_CLEARANCE_COLUMNS = 3;
const CHEST_CLEARANCE_ROWS = 4;
const CHEST_BLOCKS_PER_SPAWN = 40 * 8;
const DEFAULT_WORLD_COLUMNS = 32 * 6;
const DEBRIS_FALL_GRAVITY = 1800;
const DEBRIS_REST_HEIGHT = 8;
const LUCK_BASE_BIAS = -0.08;
const LUCK_BIAS_STRENGTH = 0.16;
const LUCK_BIAS_SATURATION = 0.5;

export const WORLD_STRATA = STRATA;

function getLuckBias(luck) {
  return LUCK_BASE_BIAS + LUCK_BIAS_STRENGTH * (luck / (LUCK_BIAS_SATURATION + luck));
}

function getEffectiveLuckBonus(luck) {
  if (luck <= 0) {
    return 0;
  }

  if (luck <= 1) {
    return luck;
  }

  return 1 + (luck - 1) * 0.4;
}

function getLuckBonusOre(luck, random) {
  const effectiveLuck = getEffectiveLuckBonus(luck);
  if (effectiveLuck <= 0) {
    return 0;
  }

  const guaranteedBonus = Math.floor(effectiveLuck);
  const fractionalBonus = effectiveLuck - guaranteedBonus;
  return guaranteedBonus + (random < fractionalBonus ? 1 : 0);
}

function getLuckBonusOreMax(luck) {
  return Math.ceil(getEffectiveLuckBonus(luck));
}

export class World {
  static createRandomSeed() {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0];
    }

    return Math.floor(Math.random() * 0x100000000);
  }

  constructor({ columns = DEFAULT_WORLD_COLUMNS, rows = 180, surfaceRow = 6, seed = World.createRandomSeed() } = {}) {
    this.columns = columns;
    this.rows = rows;
    this.surfaceRow = surfaceRow;
    this.seed = seed >>> 0;
    this.random = createSeededRandom(this.seed);
    this.pixelWidth = columns * TILE_SIZE;
    this.pixelHeight = rows * TILE_SIZE;
    this.chestMap = new Map();
    this.chests = [];
    this.fallingDebris = [];
    this.noiseOffsets = Object.freeze({
      stratum: this.#createNoiseOffset(),
      vein: this.#createNoiseOffset(),
      pocket: this.#createNoiseOffset(),
    });
    this.grid = this.#generate();
  }

  #generate() {
    const grid = Array.from({ length: this.rows }, (_, row) => (
      Array.from({ length: this.columns }, (_, column) => new Tile(this.#pickType(column, row)))
    ));

    this.#carveStarterPocket(grid);
    this.#placeChests(grid);
    this.#assignSurfaceTreatments(grid);
    return grid;
  }

  #assignSurfaceTreatments(grid) {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const tile = grid[row][column];
        tile.surfaceTreatment = this.#getSurfaceTreatmentForGrid(grid, tile, column, row);
        tile.surfaceVariant = this.#getSurfaceVariantForGrid(tile, column, row);
      }
    }
  }

  #getSurfaceVariantForGrid(tile, column, row) {
    if (tile.surfaceTreatment !== "grass") {
      return 0;
    }

    return Math.abs(((this.seed ^ (column * 73856093) ^ (row * 19349663)) >>> 0)) % 3;
  }

  #placeChests(grid) {
    let startDepth = 0;

    for (let index = 0; index < STRATA.length; index += 1) {
      const stratum = STRATA[index];
      const maxDepth = Number.isFinite(stratum.maxDepth)
        ? stratum.maxDepth - 1
        : this.rows - this.surfaceRow - CHEST_CLEARANCE_ROWS - 1;
      const minDepth = startDepth + CHEST_CLEARANCE_ROWS;
      const maxPlacementDepth = maxDepth - CHEST_CLEARANCE_ROWS;
      startDepth = Number.isFinite(stratum.maxDepth) ? stratum.maxDepth : startDepth;

      if (minDepth > maxPlacementDepth) {
        continue;
      }

      const stratumRows = maxPlacementDepth - minDepth + 1;
      const maxChestsPerStratum = Math.max(1, Math.floor((this.columns * stratumRows) / CHEST_BLOCKS_PER_SPAWN));
      const chestsPerStratum = this.#rollCenteredChestCount(maxChestsPerStratum);

      let placedChestCount = 0;
      const maxAttempts = Math.max(24, chestsPerStratum * 40);
      for (let attempt = 0; attempt < maxAttempts && placedChestCount < chestsPerStratum; attempt += 1) {
        const depth = this.#randomInt(minDepth, maxPlacementDepth);
        const row = this.surfaceRow + depth;
        const column = this.#randomInt(CHEST_CLEARANCE_COLUMNS, this.columns - CHEST_CLEARANCE_COLUMNS - 1);
        if (!this.#isChestPlacementValid(column, row)) {
          continue;
        }

        this.#placeChest(grid, column, row, index);
        placedChestCount += 1;
      }
    }
  }

  #isChestPlacementValid(column, row) {
    if (!this.inBounds(column, row)) {
      return false;
    }

    if (column < CHEST_CLEARANCE_COLUMNS || column >= this.columns - CHEST_CLEARANCE_COLUMNS) {
      return false;
    }

    if (row <= this.surfaceRow + CHEST_CLEARANCE_ROWS || row >= this.rows - CHEST_CLEARANCE_ROWS) {
      return false;
    }

    for (const chest of this.chests) {
      if (Math.abs(chest.column - column) <= 4 && Math.abs(chest.row - row) <= 4) {
        return false;
      }
    }

    return !(column <= 4 && row <= this.surfaceRow + 4);
  }

  #placeChest(grid, column, row, stratumIndex) {
    const guardType = this.#getChestGuardType(stratumIndex);

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const targetColumn = column + columnOffset;
        const targetRow = row + rowOffset;
        if (!this.inBounds(targetColumn, targetRow)) {
          continue;
        }

        grid[targetRow][targetColumn].setType(
          rowOffset === 0 && columnOffset === 0 ? TILE_TYPES.CHEST : guardType,
        );
      }
    }

    const chest = Object.freeze({
      id: `${this.seed}-${stratumIndex}-${column}-${row}`,
      column,
      row,
      stratumIndex,
      stratumName: STRATA[stratumIndex].name,
      powerScale: 0.05 * 2 ** stratumIndex,
    });
    this.chests.push(chest);
    this.chestMap.set(this.#getChestKey(column, row), chest);
  }

  #getChestGuardType(stratumIndex) {
    const sourceStratum = STRATA[stratumIndex + 1] ?? STRATA[stratumIndex];
    const candidateTypes = new Set([
      ...sourceStratum.base.map((definition) => definition.type),
      ...sourceStratum.primaryOres.map((definition) => definition.type),
      ...sourceStratum.bonusFromPrev.map((definition) => definition.type),
      ...sourceStratum.bonusFromNext.map((definition) => definition.type),
    ]);

    let toughestType = TILE_TYPES.BASALT;
    let toughestHp = -1;
    for (const type of candidateTypes) {
      const hp = TILE_DEFINITIONS[type]?.hp ?? -1;
      if (hp > toughestHp) {
        toughestHp = hp;
        toughestType = type;
      }
    }

    return toughestType;
  }

  #carveStarterPocket(grid) {
    for (let row = this.surfaceRow - 1; row <= this.surfaceRow + 1; row += 1) {
      for (let column = 0; column <= 2; column += 1) {
        grid[row][column].setType(TILE_TYPES.EMPTY);
      }
    }

    for (let column = 0; column <= 2; column += 1) {
      grid[this.surfaceRow + 2][column].setType(TILE_TYPES.STONE);
    }

    grid[this.surfaceRow][3].setType(TILE_TYPES.DIRT);
    grid[this.surfaceRow + 1][3].setType(TILE_TYPES.COAL);
  }

  #pickType(column, row) {
    if (row < this.surfaceRow) {
      return TILE_TYPES.EMPTY;
    }

    if (row === this.surfaceRow) {
      return this.random() < 0.2 ? TILE_TYPES.STONE : TILE_TYPES.DIRT;
    }

    const depth = row - this.surfaceRow;
    const profile = this.#getDepthProfile(depth);
    const stratumNoise = this.#sampleNoise(column, row, 0.17, 0.11, 0.09, this.noiseOffsets.stratum);
    const veinNoise = this.#sampleNoise(column, row, 0.63, 0.24, 0.32, this.noiseOffsets.vein);
    const pocketNoise = this.#sampleNoise(column, row, 1.14, 0.57, 0.51, this.noiseOffsets.pocket);
    const roll = this.random();
    const tunnelChance = row > this.surfaceRow + 2 ? profile.tunnelChance : 0;

    if (roll < tunnelChance) {
      return TILE_TYPES.EMPTY;
    }

    const oreWeights = profile.primaryOres.map((ore) => ({
      type: ore.type,
      weight: ore.weight + Math.max(0, veinNoise - 0.54) * 0.11 + Math.max(0, pocketNoise - 0.72) * 0.08,
    }));
    const bonusWeights = [...profile.bonusFromPrev, ...profile.bonusFromNext].map((ore) => ({
      type: ore.type,
      weight: ore.weight + Math.max(0, pocketNoise - 0.8) * 0.025,
    }));
    const oreType = this.#rollWeighted([...oreWeights, ...bonusWeights], this.random());
    if (oreType) {
      return oreType;
    }

    return this.#pickBaseTile(profile.base, stratumNoise);
  }

  #getDepthProfile(depth) {
    return STRATA.find((stratum) => depth < stratum.maxDepth) ?? STRATA[STRATA.length - 1];
  }

  #pickBaseTile(baseDefinitions, noise) {
    let threshold = Math.min(0.999, Math.max(0, noise));
    let cursor = 0;

    for (const definition of baseDefinitions) {
      cursor += definition.weight;
      if (threshold <= cursor) {
        return definition.type;
      }
    }

    return baseDefinitions[baseDefinitions.length - 1].type;
  }

  #rollWeighted(options, roll) {
    const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
    if (totalWeight <= 0 || roll > totalWeight) {
      return null;
    }

    let cursor = 0;
    for (const option of options) {
      cursor += option.weight;
      if (roll <= cursor) {
        return option.type;
      }
    }

    return null;
  }

  #randomInt(min, max) {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  #rollCenteredChestCount(maxCount) {
    if (maxCount <= 1) {
      return Math.max(1, maxCount);
    }

    const normalizedRoll = (this.random() + this.random() + this.random()) / 3;
    return 1 + Math.round(normalizedRoll * (maxCount - 1));
  }

  #getSurfaceTreatmentForGrid(grid, tile, column, row) {
    if (!tile?.solid || tile.type === TILE_TYPES.CHEST || tile.type === TILE_TYPES.MAGMA) {
      return null;
    }

    const tileAbove = this.#getGridTile(grid, column, row - 1);
    if (tileAbove?.solid) {
      return null;
    }

    const coveringTile = this.#findFirstSolidAboveInGrid(grid, column, row - 1);
    if (!coveringTile) {
      return "grass";
    }

    if (tile.type === TILE_TYPES.DIRT) {
      return "moss";
    }

    return this.#isRockLikeTile(coveringTile) ? "rock-spires" : "rock";
  }

  #findFirstSolidAboveInGrid(grid, column, row) {
    for (let scanRow = row; scanRow >= 0; scanRow -= 1) {
      const tile = this.#getGridTile(grid, column, scanRow);
      if (tile?.solid) {
        return tile;
      }
    }

    return null;
  }

  #isRockLikeTile(tile) {
    return Boolean(tile?.solid && tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.CHEST);
  }

  #getGridTile(grid, column, row) {
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) {
      return null;
    }

    return grid[row][column];
  }

  #getMaxChestsForDepthRange(minDepth, maxPlacementDepth) {
    const stratumRows = maxPlacementDepth - minDepth + 1;
    return Math.max(1, Math.floor((this.columns * stratumRows) / CHEST_BLOCKS_PER_SPAWN));
  }

  #getStratumPlacementDepthRange(stratumIndex) {
    let startDepth = 0;

    for (let index = 0; index < STRATA.length; index += 1) {
      const stratum = STRATA[index];
      const maxDepth = Number.isFinite(stratum.maxDepth)
        ? stratum.maxDepth - 1
        : this.rows - this.surfaceRow - CHEST_CLEARANCE_ROWS - 1;
      const minDepth = startDepth + CHEST_CLEARANCE_ROWS;
      const maxPlacementDepth = maxDepth - CHEST_CLEARANCE_ROWS;
      startDepth = Number.isFinite(stratum.maxDepth) ? stratum.maxDepth : startDepth;

      if (index === stratumIndex) {
        return { minDepth, maxPlacementDepth };
      }
    }

    return null;
  }

  #getChestKey(column, row) {
    return `${column},${row}`;
  }

  #createNoiseOffset() {
    return Object.freeze({
      column: this.random() * 1000,
      row: this.random() * 1000,
      phase: this.random() * Math.PI * 2,
    });
  }

  #sampleNoise(column, row, columnScale, rowScale, phaseOffset, offset) {
    const shiftedColumn = column + offset.column;
    const shiftedRow = row + offset.row;
    const shiftedPhase = phaseOffset + offset.phase;
    const a = Math.sin(shiftedColumn * columnScale + shiftedRow * rowScale + shiftedPhase);
    const b = Math.sin(
      shiftedColumn * (columnScale * 0.47) - shiftedRow * (rowScale * 1.83) + shiftedPhase * 1.7,
    );
    const c = Math.cos(
      shiftedColumn * (columnScale * 1.31) + shiftedRow * (rowScale * 0.42) - shiftedPhase * 0.6,
    );
    return (a + b + c + 3) / 6;
  }

  inBounds(column, row) {
    return column >= 0 && column < this.columns && row >= 0 && row < this.rows;
  }

  getTile(column, row) {
    if (!this.inBounds(column, row)) {
      return null;
    }

    return this.grid[row][column];
  }

  getTileAtPixel(x, y) {
    return this.getTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
  }

  canPlacePlatform(column, row) {
    const tile = this.getTile(column, row);
    return Boolean(tile && tile.type === TILE_TYPES.EMPTY);
  }

  placePlatform(column, row) {
    const tile = this.getTile(column, row);
    if (!tile || tile.type !== TILE_TYPES.EMPTY) {
      return false;
    }

    tile.debrisType = null;
    tile.debrisVariant = 0;
    tile.setType(TILE_TYPES.PLATFORM);
    return true;
  }

  clearDebris(column, row) {
    const tile = this.getTile(column, row);
    if (!tile?.debrisType) {
      return false;
    }

    tile.debrisType = null;
    tile.debrisVariant = 0;
    return true;
  }

  getChestAt(column, row) {
    return this.chestMap.get(this.#getChestKey(column, row)) ?? null;
  }

  isSolid(column, row) {
    const tile = this.getTile(column, row);
    return Boolean(tile?.solid && tile.type !== TILE_TYPES.PLATFORM);
  }

  isPlatform(column, row) {
    return this.getTile(column, row)?.type === TILE_TYPES.PLATFORM;
  }

  getPlatformSurfaceY(row) {
    return row * TILE_SIZE + PLATFORM_SURFACE_OFFSET;
  }

  damageTile(column, row, amount, bonuses = {}) {
    const tile = this.getTile(column, row);

    if (!tile || !tile.solid || !tile.mineable) {
      return { hit: false, broken: false, resource: null, tile: null, damageDealt: 0, bonusDropCount: 0 };
    }

    const chest = tile.type === TILE_TYPES.CHEST ? this.getChestAt(column, row) : null;
    const previousHp = tile.hp;

    const broken = tile.damage(amount);
    const damageDealt = Math.min(previousHp, amount);

    if (!broken) {
      return { hit: true, broken: false, resource: null, tile, damageDealt };
    }

    const resource = chest ? null : tile.definition.drop;
    const brokenType = tile.type;
    const dropOutcome = this.getOreDropOutcome(row, brokenType, bonuses);
    const dropCount = dropOutcome.count;
    this.#clearDebrisAt(column, row);
    this.#clearDebrisAbove(column, row);
    tile.setType(TILE_TYPES.EMPTY);
    const magmaFlowed = this.#flowMagmaIntoColumn(column, row);
    if (!magmaFlowed) {
      this.#dropDebris(column, row, brokenType);
    }
    if (chest) {
      this.chestMap.delete(this.#getChestKey(column, row));
      this.chests = this.chests.filter((entry) => entry.id !== chest.id);
    }
    return {
      hit: true,
      broken: true,
      resource,
      dropCount,
      normalDropCount: dropOutcome.normalCount,
      chest,
      tile,
      damageDealt,
      bonusDropCount: dropOutcome.overflowOre,
      brokenType,
      column,
      row,
    };
  }

  #clearDebrisAt(column, row) {
    this.clearDebris(column, row);
  }

  #clearDebrisAbove(column, row) {
    const tileAbove = this.getTile(column, row - 1);
    if (!tileAbove || tileAbove.solid || !tileAbove.debrisType) {
      return;
    }

    tileAbove.debrisType = null;
    tileAbove.debrisVariant = 0;
  }

  #flowMagmaIntoColumn(column, startRow) {
    const sourceTile = this.getTile(column, startRow - 1);
    if (sourceTile?.type !== TILE_TYPES.MAGMA) {
      return false;
    }

    let flowed = false;
    for (let row = startRow; row < this.rows; row += 1) {
      const tile = this.getTile(column, row);
      if (!tile || tile.solid) {
        break;
      }

      tile.setType(TILE_TYPES.MAGMA);
      this.fallingDebris = this.fallingDebris.filter((debris) => !(debris.column === column && debris.targetRow === row));
      flowed = true;
    }

    return flowed;
  }

  #dropDebris(column, row, brokenType) {
    const target = this.#getDebrisLandingTarget(column, row + 1);
    if (!target) {
      return;
    }

    const { supportRow, targetIsPlatform, restingRow, targetY } = target;
    const restingTile = this.getTile(column, restingRow);
    if (!restingTile) {
      return;
    }

    if (!targetIsPlatform && restingTile.solid) {
      return;
    }

    const debrisVariant = ((this.seed ^ (column * 73856093) ^ (supportRow * 19349663)) >>> 0) % 3;
    this.fallingDebris.push({
      column,
      type: brokenType,
      variant: debrisVariant,
      x: column * TILE_SIZE,
      y: row * TILE_SIZE,
      vy: 0,
      targetRow: restingRow,
      targetIsPlatform,
      targetY,
    });
  }

  #getDebrisLandingTarget(column, startRow) {
    const supportTile = this.#findFirstSupportBelow(column, startRow);
    if (!supportTile) {
      return null;
    }

    const targetIsPlatform = supportTile.tile.type === TILE_TYPES.PLATFORM;
    const restingRow = targetIsPlatform ? supportTile.row : supportTile.row - 1;
    return {
      supportRow: supportTile.row,
      targetIsPlatform,
      restingRow,
      targetY: targetIsPlatform
        ? this.getPlatformSurfaceY(supportTile.row)
        : restingRow * TILE_SIZE + TILE_SIZE - DEBRIS_REST_HEIGHT,
    };
  }

  #findFirstSupportBelow(column, startRow) {
    for (let row = startRow; row < this.rows; row += 1) {
      const tile = this.getTile(column, row);
      if (tile?.solid || tile?.type === TILE_TYPES.PLATFORM) {
        return { tile, row };
      }
    }

    return null;
  }

  updateFallingDebris(dt) {
    if (this.fallingDebris.length === 0) {
      return;
    }

    const settledDebris = [];
    for (const debris of this.fallingDebris) {
      const currentRow = Math.floor(debris.y / TILE_SIZE);
      const target = this.#getDebrisLandingTarget(debris.column, currentRow + 1);
      if (target) {
        debris.targetRow = target.restingRow;
        debris.targetIsPlatform = target.targetIsPlatform;
        debris.targetY = target.targetY;
      }

      debris.vy += DEBRIS_FALL_GRAVITY * dt;
      debris.y = Math.min(debris.targetY, debris.y + debris.vy * dt);
      if (debris.y >= debris.targetY) {
        settledDebris.push(debris);
      }
    }

    if (settledDebris.length === 0) {
      return;
    }

    this.fallingDebris = this.fallingDebris.filter((debris) => !settledDebris.includes(debris));
    for (const debris of settledDebris) {
      const tile = this.getTile(debris.column, debris.targetRow);
      if (!tile) {
        continue;
      }

      if (debris.targetIsPlatform) {
        if (tile.type !== TILE_TYPES.PLATFORM) {
          continue;
        }
      } else if (tile.solid) {
        continue;
      }

      tile.debrisType = debris.type;
      tile.debrisVariant = debris.variant;
    }
  }

  getFallingDebris() {
    return this.fallingDebris;
  }

  getVisibleTileBounds(camera, viewportWidth, viewportHeight) {
    const startColumn = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
    const endColumn = Math.min(this.columns, Math.ceil((camera.x + viewportWidth) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
    const endRow = Math.min(this.rows, Math.ceil((camera.y + viewportHeight) / TILE_SIZE) + 1);

    return { startColumn, endColumn, startRow, endRow };
  }

  getSpawnPosition() {
    return {
      x: TILE_SIZE * 2.25,
      y: TILE_SIZE * (this.surfaceRow + 2) - 28,
    };
  }

  getTileDefinition(type) {
    return TILE_DEFINITIONS[type] ?? TILE_DEFINITIONS[TILE_TYPES.EMPTY];
  }

  getDepthAtPixel(y) {
    return Math.max(0, Math.floor(y / TILE_SIZE) - this.surfaceRow);
  }

  getStratumAtPixel(y) {
    const depth = this.getDepthAtPixel(y);
    const stratumIndex = STRATA.findIndex((entry) => depth < entry.maxDepth);
    const resolvedIndex = stratumIndex >= 0 ? stratumIndex : STRATA.length - 1;
    const stratum = STRATA[resolvedIndex];
    return {
      ...stratum,
      index: resolvedIndex,
      depth,
    };
  }

  getStratumAtRow(row) {
    const depth = Math.max(0, row - this.surfaceRow);
    const stratumIndex = STRATA.findIndex((entry) => depth < entry.maxDepth);
    const resolvedIndex = stratumIndex >= 0 ? stratumIndex : STRATA.length - 1;
    const stratum = STRATA[resolvedIndex];
    return {
      ...stratum,
      index: resolvedIndex,
      depth,
    };
  }

  getChestStatsForStratum(stratumIndex) {
    const range = this.#getStratumPlacementDepthRange(stratumIndex);
    if (!range || range.minDepth > range.maxPlacementDepth) {
      return { spawned: 0, max: 0 };
    }

    return {
      spawned: this.chests.filter((chest) => chest.stratumIndex === stratumIndex).length,
      max: this.#getMaxChestsForDepthRange(range.minDepth, range.maxPlacementDepth),
    };
  }

  getOreDropOutcome(row, tileType, bonuses = {}) {
    const definition = this.getTileDefinition(tileType);
    if (!definition.drop) {
      return { count: 0, overflowOre: 0 };
    }

    const stratum = this.getStratumAtRow(row);
    const isCoreOre = stratum.primaryOres.some((ore) => ore.type === tileType);
    const { base, variance } = isCoreOre ? stratum.coreYield : { base: 1, variance: 0 };
    const luck = Math.max(0, bonuses.luck ?? 0);
    const normalizedRoll = (this.random() + this.random() + this.random()) / 3;
    const luckBias = getLuckBias(luck);
    const biasedRoll = Math.max(0, normalizedRoll + luckBias);
    const cappedRoll = Math.min(1, biasedRoll);
    const swing = Math.round((cappedRoll * 2 - 1) * variance);
    const bonusOre = getLuckBonusOre(luck, this.random());
    return {
      count: Math.max(1, base + swing + bonusOre),
      normalCount: base,
      overflowOre: bonusOre,
    };
  }

  getOreDropCount(column, row, tileType, bonuses = {}) {
    return this.getOreDropOutcome(row, tileType, bonuses).count;
  }

  getOreDropRange(row, tileType, bonuses = {}) {
    const definition = this.getTileDefinition(tileType);
    if (!definition.drop) {
      return null;
    }

    const stratum = this.getStratumAtRow(row);
    const isCoreOre = stratum.primaryOres.some((ore) => ore.type === tileType);
    const { base, variance } = isCoreOre ? stratum.coreYield : { base: 1, variance: 0 };
    const luck = Math.max(0, bonuses.luck ?? 0);
    const luckBias = getLuckBias(luck);
    const minRoll = Math.max(0, luckBias);
    const normalMin = Math.max(1, base + Math.round((minRoll * 2 - 1) * variance));
    const normalMax = Math.max(1, base + variance);
    const bonusMax = getLuckBonusOreMax(luck);
    return {
      min: normalMin,
      max: Math.max(1, normalMax + bonusMax),
      normalMin,
      normalMax,
      bonusMax,
    };
  }
}