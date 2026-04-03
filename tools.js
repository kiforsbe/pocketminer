import { TILE_DEFINITIONS, TILE_TYPES } from "./tile.js";

const SWING_WINDOW_SECONDS = 0.18;

function oneSwingPowerFor(tileType) {
  return Math.ceil(TILE_DEFINITIONS[tileType].hp / SWING_WINDOW_SECONDS);
}

function createTool({
  id,
  label,
  materialItemId = null,
  category,
  branchId,
  branchLabel,
  price,
  miningPower,
  description,
  oneSwingBlockType = null,
  tier,
}) {
  return Object.freeze({
    id,
    label,
    materialItemId,
    category,
    branchId,
    branchLabel,
    price,
    miningPower,
    description,
    oneSwingBlockType,
    oneSwingBlockLabel: oneSwingBlockType ? TILE_DEFINITIONS[oneSwingBlockType].label : null,
    tier,
  });
}

export const DEFAULT_GAME_MODE = "standard";
export const DEFAULT_TOOL_ID = "bare-hands";

export const TOOL_DEFINITIONS = Object.freeze({
  [DEFAULT_TOOL_ID]: createTool({
    id: DEFAULT_TOOL_ID,
    label: "Bare Hands",
    category: "hands",
    branchId: "hands",
    branchLabel: "Bare Hands",
    price: 0,
    miningPower: 38,
    description: "No tool yet. Good enough for scraping out the first few blocks.",
    tier: 0,
  }),
  "wood-pick": createTool({
    id: "wood-pick",
    label: "Wood Pickaxe",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 12,
    miningPower: 90,
    description: "Your first real pickaxe, mapped to the coal tier of progression.",
    tier: 1,
  }),
  "copper-pick": createTool({
    id: "copper-pick",
    label: "Copper Pickaxe",
    materialItemId: "copper",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 26,
    miningPower: 130,
    description: "Cuts through the upper vein with a steadier bite.",
    tier: 2,
  }),
  "tin-pick": createTool({
    id: "tin-pick",
    label: "Tin Pickaxe",
    materialItemId: "tin",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 48,
    miningPower: oneSwingPowerFor(TILE_TYPES.DIRT),
    description: "Strong enough to clear dirt in a single swing.",
    oneSwingBlockType: TILE_TYPES.DIRT,
    tier: 3,
  }),
  "iron-pick": createTool({
    id: "iron-pick",
    label: "Iron Pickaxe",
    materialItemId: "iron",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 84,
    miningPower: oneSwingPowerFor(TILE_TYPES.STONE),
    description: "Built to crack stone in one swing.",
    oneSwingBlockType: TILE_TYPES.STONE,
    tier: 4,
  }),
  "silver-pick": createTool({
    id: "silver-pick",
    label: "Silver Pickaxe",
    materialItemId: "silver",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 140,
    miningPower: oneSwingPowerFor(TILE_TYPES.SHALE),
    description: "Turns shale into a one-swing block.",
    oneSwingBlockType: TILE_TYPES.SHALE,
    tier: 5,
  }),
  "gold-pick": createTool({
    id: "gold-pick",
    label: "Gold Pickaxe",
    materialItemId: "gold",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 220,
    miningPower: oneSwingPowerFor(TILE_TYPES.BASALT),
    description: "Lets you smash basalt in one clean swing.",
    oneSwingBlockType: TILE_TYPES.BASALT,
    tier: 6,
  }),
  "ruby-pick": createTool({
    id: "ruby-pick",
    label: "Ruby Pickaxe",
    materialItemId: "ruby",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 360,
    miningPower: oneSwingPowerFor(TILE_TYPES.BASALT) + 140,
    description: "A brutal late-game pick for high-yield stone and ore.",
    oneSwingBlockType: TILE_TYPES.BASALT,
    tier: 7,
  }),
  "sapphire-pick": createTool({
    id: "sapphire-pick",
    label: "Sapphire Pickaxe",
    materialItemId: "sapphire",
    category: "pickaxe",
    branchId: "pickaxe",
    branchLabel: "Pickaxes",
    price: 520,
    miningPower: oneSwingPowerFor(TILE_TYPES.BASALT) + 260,
    description: "The top-end pick for tearing through the deepest rock.",
    oneSwingBlockType: TILE_TYPES.BASALT,
    tier: 8,
  }),
});

export const GAME_MODE_DEFINITIONS = Object.freeze({
  [DEFAULT_GAME_MODE]: Object.freeze({
    id: DEFAULT_GAME_MODE,
    label: "Standard Shift",
    toolIds: Object.freeze([
      DEFAULT_TOOL_ID,
      "wood-pick",
      "copper-pick",
      "tin-pick",
      "iron-pick",
      "silver-pick",
      "gold-pick",
      "ruby-pick",
      "sapphire-pick",
    ]),
  }),
});

export function getToolDefinition(toolId) {
  return TOOL_DEFINITIONS[toolId] ?? TOOL_DEFINITIONS[DEFAULT_TOOL_ID];
}

export function getToolsForGameMode(gameMode = DEFAULT_GAME_MODE) {
  const mode = GAME_MODE_DEFINITIONS[gameMode] ?? GAME_MODE_DEFINITIONS[DEFAULT_GAME_MODE];
  return mode.toolIds.map((toolId) => TOOL_DEFINITIONS[toolId]);
}

export function getToolBranchTools(gameMode = DEFAULT_GAME_MODE, branchId = "pickaxe") {
  return getToolsForGameMode(gameMode).filter((tool) => tool.branchId === branchId);
}
