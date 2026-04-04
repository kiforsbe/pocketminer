export const TILE_SIZE = 32;

export const TILE_TYPES = Object.freeze({
  EMPTY: "empty",
  CHEST: "chest",
  DIRT: "dirt",
  STONE: "stone",
  SHALE: "shale",
  BASALT: "basalt",
  COAL: "coal",
  COPPER: "copper",
  TIN: "tin",
  IRON: "iron",
  SILVER: "silver",
  GOLD: "gold",
  RUBY: "ruby",
  SAPPHIRE: "sapphire",
});

const createDefinition = ({ id, solid = true, hp, sprite, drop = null, label, fill, accent, pattern }) => ({
  id,
  solid,
  hp,
  sprite,
  drop,
  label,
  fill,
  accent,
  pattern,
});

export const TILE_DEFINITIONS = Object.freeze({
  [TILE_TYPES.EMPTY]: createDefinition({
    id: 0,
    solid: false,
    hp: 0,
    sprite: { x: 0, y: 0 },
    label: "Empty",
    fill: "rgba(0,0,0,0)",
    accent: "rgba(0,0,0,0)",
    pattern: "empty",
  }),
  [TILE_TYPES.CHEST]: createDefinition({
    id: 18,
    hp: 28,
    sprite: { x: 0, y: 0 },
    label: "Treasure Chest",
    fill: "#70491f",
    accent: "#f0c45a",
    pattern: "chest",
  }),
  [TILE_TYPES.DIRT]: createDefinition({
    id: 1,
    hp: 24,
    sprite: { x: 0, y: 0 },
    label: "Dirt",
    fill: "#7f5634",
    accent: "#a1764b",
    pattern: "speck",
  }),
  [TILE_TYPES.STONE]: createDefinition({
    id: 2,
    hp: 38,
    sprite: { x: 1, y: 0 },
    label: "Stone",
    fill: "#7d8799",
    accent: "#b8c0cf",
    pattern: "bands",
  }),
  [TILE_TYPES.SHALE]: createDefinition({
    id: 3,
    hp: 50,
    sprite: { x: 4, y: 0 },
    label: "Shale",
    fill: "#5f6a7c",
    accent: "#8993a8",
    pattern: "slate",
  }),
  [TILE_TYPES.BASALT]: createDefinition({
    id: 4,
    hp: 68,
    sprite: { x: 5, y: 0 },
    label: "Basalt",
    fill: "#3e4655",
    accent: "#697388",
    pattern: "blocks",
  }),
  [TILE_TYPES.COAL]: createDefinition({
    id: 10,
    hp: 44,
    sprite: { x: 2, y: 0 },
    drop: "coal",
    label: "Coal Ore",
    fill: "#3c353f",
    accent: "#15131a",
    pattern: "ore-cluster",
  }),
  [TILE_TYPES.COPPER]: createDefinition({
    id: 11,
    hp: 48,
    sprite: { x: 6, y: 0 },
    drop: "copper",
    label: "Copper Ore",
    fill: "#8a6c5f",
    accent: "#c97a43",
    pattern: "ore-cluster",
  }),
  [TILE_TYPES.TIN]: createDefinition({
    id: 12,
    hp: 62,
    sprite: { x: 7, y: 0 },
    drop: "tin",
    label: "Tin Ore",
    fill: "#71808a",
    accent: "#d7e1e8",
    pattern: "ore-cluster",
  }),
  [TILE_TYPES.IRON]: createDefinition({
    id: 13,
    hp: 68,
    sprite: { x: 3, y: 0 },
    drop: "iron",
    label: "Iron Ore",
    fill: "#7a6f68",
    accent: "#cf7449",
    pattern: "ore-cluster",
  }),
  [TILE_TYPES.SILVER]: createDefinition({
    id: 14,
    hp: 82,
    sprite: { x: 8, y: 0 },
    drop: "silver",
    label: "Silver Ore",
    fill: "#697386",
    accent: "#d7dce6",
    pattern: "ore-gem",
  }),
  [TILE_TYPES.GOLD]: createDefinition({
    id: 15,
    hp: 90,
    sprite: { x: 9, y: 0 },
    drop: "gold",
    label: "Gold Ore",
    fill: "#77675b",
    accent: "#e0ba4e",
    pattern: "ore-gem",
  }),
  [TILE_TYPES.RUBY]: createDefinition({
    id: 16,
    hp: 106,
    sprite: { x: 10, y: 0 },
    drop: "ruby",
    label: "Ruby Ore",
    fill: "#5b4550",
    accent: "#da4d68",
    pattern: "gem-shard",
  }),
  [TILE_TYPES.SAPPHIRE]: createDefinition({
    id: 17,
    hp: 110,
    sprite: { x: 11, y: 0 },
    drop: "sapphire",
    label: "Sapphire Ore",
    fill: "#435067",
    accent: "#58a8ea",
    pattern: "gem-shard",
  }),
});

export const ORE_TILE_TYPES = Object.freeze([
  TILE_TYPES.COAL,
  TILE_TYPES.COPPER,
  TILE_TYPES.TIN,
  TILE_TYPES.IRON,
  TILE_TYPES.SILVER,
  TILE_TYPES.GOLD,
  TILE_TYPES.RUBY,
  TILE_TYPES.SAPPHIRE,
]);

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
    this.surfaceTreatment = null;
    this.surfaceVariant = 0;
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