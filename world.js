import { Tile, TILE_DEFINITIONS, TILE_SIZE, TILE_TYPES } from "./tile.js";

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

    const coalChance = profile.coalChance + Math.max(0, veinNoise - 0.56) * 0.42 + Math.max(0, pocketNoise - 0.7) * 0.2;
    const ironChance = profile.ironChance + Math.max(0, veinNoise - 0.66) * 0.28 + Math.max(0, pocketNoise - 0.78) * 0.12;
    const oreRoll = Math.random();

    if (profile.ironChance > 0 && oreRoll < ironChance) {
      return TILE_TYPES.IRON;
    }

    if (oreRoll < ironChance + coalChance) {
      return TILE_TYPES.COAL;
    }

    const dirtBias = profile.dirtBias + (stratumNoise - 0.5) * profile.stratumStrength;
    return Math.random() < dirtBias ? TILE_TYPES.DIRT : TILE_TYPES.STONE;
  }

  #getDepthProfile(depth) {
    if (depth < 10) {
      return {
        dirtBias: 0.84,
        coalChance: 0.025,
        ironChance: 0,
        tunnelChance: 0.028,
        stratumStrength: 0.28,
      };
    }

    if (depth < 26) {
      return {
        dirtBias: 0.7,
        coalChance: 0.055,
        ironChance: 0,
        tunnelChance: 0.022,
        stratumStrength: 0.24,
      };
    }

    if (depth < 64) {
      return {
        dirtBias: 0.36,
        coalChance: 0.14,
        ironChance: 0,
        tunnelChance: 0.016,
        stratumStrength: 0.2,
      };
    }

    if (depth < 112) {
      return {
        dirtBias: 0.12,
        coalChance: 0.22,
        ironChance: 0.07,
        tunnelChance: 0.012,
        stratumStrength: 0.14,
      };
    }

    return {
      dirtBias: 0.04,
      coalChance: 0.26,
      ironChance: 0.13,
      tunnelChance: 0.008,
      stratumStrength: 0.1,
    };
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
}