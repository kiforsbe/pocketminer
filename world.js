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
    grid[this.surfaceRow + 1][3].setType(TILE_TYPES.DIRT);
  }

  #pickType(column, row) {
    if (row < this.surfaceRow) {
      return TILE_TYPES.EMPTY;
    }

    if (row === this.surfaceRow) {
      return Math.random() < 0.2 ? TILE_TYPES.STONE : TILE_TYPES.DIRT;
    }

    const depth = row - this.surfaceRow;
    const stoneBias = Math.min(0.85, 0.28 + depth * 0.0125);
    const coalChance = Math.min(0.14, 0.02 + depth * 0.0022);
    const ironChance = depth > 12 ? Math.min(0.11, 0.01 + (depth - 12) * 0.0018) : 0;
    const tunnelChance = row > this.surfaceRow + 2 ? Math.max(0, 0.06 - depth * 0.00025) : 0;
    const noise = (Math.sin(column * 1.37 + row * 0.61) + 1) * 0.5;
    const roll = Math.random() * 0.82 + noise * 0.18;

    if (roll < tunnelChance) {
      return TILE_TYPES.EMPTY;
    }

    if (roll > 1 - ironChance) {
      return TILE_TYPES.IRON;
    }

    if (roll > 1 - ironChance - coalChance) {
      return TILE_TYPES.COAL;
    }

    return roll < stoneBias ? TILE_TYPES.STONE : TILE_TYPES.DIRT;
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
      x: TILE_SIZE * 1.1,
      y: TILE_SIZE * (this.surfaceRow + 2) - 28,
    };
  }

  getTileDefinition(type) {
    return TILE_DEFINITIONS[type] ?? TILE_DEFINITIONS[TILE_TYPES.EMPTY];
  }
}