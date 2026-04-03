export const TILE_SIZE = 32;

export const TILE_TYPES = Object.freeze({
  EMPTY: "empty",
  DIRT: "dirt",
  STONE: "stone",
  COAL: "coal",
  IRON: "iron",
});

export const TILE_DEFINITIONS = Object.freeze({
  [TILE_TYPES.EMPTY]: {
    id: 0,
    solid: false,
    hp: 0,
    sprite: { x: 0, y: 0 },
    drop: null,
    label: "Empty",
  },
  [TILE_TYPES.DIRT]: {
    id: 1,
    solid: true,
    hp: 35,
    sprite: { x: 0, y: 0 },
    drop: null,
    label: "Dirt",
  },
  [TILE_TYPES.STONE]: {
    id: 2,
    solid: true,
    hp: 55,
    sprite: { x: 1, y: 0 },
    drop: null,
    label: "Stone",
  },
  [TILE_TYPES.COAL]: {
    id: 3,
    solid: true,
    hp: 70,
    sprite: { x: 2, y: 0 },
    drop: "coal",
    label: "Coal Ore",
  },
  [TILE_TYPES.IRON]: {
    id: 4,
    solid: true,
    hp: 95,
    sprite: { x: 3, y: 0 },
    drop: "iron",
    label: "Iron Ore",
  },
});

export class Tile {
  constructor(type) {
    this.setType(type);
  }

  setType(type) {
    const definition = TILE_DEFINITIONS[type] ?? TILE_DEFINITIONS[TILE_TYPES.EMPTY];
    this.type = type;
    this.definition = definition;
    this.maxHp = definition.hp;
    this.hp = definition.hp;
    return this;
  }

  get solid() {
    return this.definition.solid;
  }

  get sprite() {
    return this.definition.sprite;
  }

  get breakRatio() {
    if (!this.maxHp) {
      return 0;
    }

    return 1 - Math.max(0, this.hp) / this.maxHp;
  }

  damage(amount) {
    if (!this.solid || amount <= 0) {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }
}