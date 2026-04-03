import { Tile, TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";

const STRATA = Object.freeze([
  {
    name: "Topsoil Vein",
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
    tunnelChance: 0.025,
    stratumStrength: 0.24,
  },
  {
    name: "Shale Shelf",
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
    tunnelChance: 0.018,
    stratumStrength: 0.18,
  },
  {
    name: "Basalt Forge",
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
    tunnelChance: 0.012,
    stratumStrength: 0.12,
  },
  {
    name: "Abyssal Crown",
    maxDepth: Infinity,
    base: [
      { type: TILE_TYPES.BASALT, weight: 0.66 },
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
    tunnelChance: 0.008,
    stratumStrength: 0.08,
  },
]);

export const WORLD_STRATA = STRATA;

export class World {
  constructor({ columns = 32, rows = 180, surfaceRow = 6 } = {}) {
    this.columns = columns;
    this.rows = rows;
    this.surfaceRow = surfaceRow;
    this.pixelWidth = columns * TILE_SIZE;
    this.pixelHeight = rows * TILE_SIZE;
    this.grid = this.#generate();
  }

  #generate() {
    const grid = Array.from({ length: this.rows }, (_, row) => (
      Array.from({ length: this.columns }, (_, column) => new Tile(this.#pickType(column, row)))
    ));

    this.#carveStarterPocket(grid);
    return grid;
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
      return Math.random() < 0.2 ? TILE_TYPES.STONE : TILE_TYPES.DIRT;
    }

    const depth = row - this.surfaceRow;
    const profile = this.#getDepthProfile(depth);
    const stratumNoise = this.#sampleNoise(column, row, 0.17, 0.11, 0.09);
    const veinNoise = this.#sampleNoise(column, row, 0.63, 0.24, 0.32);
    const pocketNoise = this.#sampleNoise(column, row, 1.14, 0.57, 0.51);
    const roll = Math.random();
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
    const oreType = this.#rollWeighted([...oreWeights, ...bonusWeights], Math.random());
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

  #sampleNoise(column, row, columnScale, rowScale, phaseOffset) {
    const a = Math.sin(column * columnScale + row * rowScale + phaseOffset);
    const b = Math.sin(column * (columnScale * 0.47) - row * (rowScale * 1.83) + phaseOffset * 1.7);
    const c = Math.cos(column * (columnScale * 1.31) + row * (rowScale * 0.42) - phaseOffset * 0.6);
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

  isSolid(column, row) {
    const tile = this.getTile(column, row);
    return Boolean(tile?.solid);
  }

  damageTile(column, row, amount) {
    const tile = this.getTile(column, row);

    if (!tile || !tile.solid) {
      return { hit: false, broken: false, resource: null, tile: null };
    }

    const broken = tile.damage(amount);

    if (!broken) {
      return { hit: true, broken: false, resource: null, tile };
    }

    const resource = tile.definition.drop;
    const brokenType = tile.type;
    tile.setType(TILE_TYPES.EMPTY);
    return {
      hit: true,
      broken: true,
      resource,
      tile,
      brokenType,
      column,
      row,
    };
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
    const stratum = this.#getDepthProfile(depth);
    return {
      ...stratum,
      depth,
    };
  }
}