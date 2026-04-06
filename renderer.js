import { RendererEntitySubsystem } from "./rendererEntitySubsystem.js";
import { RendererUiSubsystem } from "./rendererUiSubsystem.js";
import { RendererWorldSubsystem } from "./rendererWorldSubsystem.js";
import { TERRAIN_ATLAS_MANIFEST } from "./assets/tiles/terrain-atlas-manifest.js";

const VIEWPORT = { width: 1280, height: 720 };

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
    image.src = source;
  });
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
    this.worldRenderer = new RendererWorldSubsystem(this);
    this.entityRenderer = new RendererEntitySubsystem(this, this.worldRenderer);
    this.uiRenderer = new RendererUiSubsystem(this, this.worldRenderer);
    this.resize();
  }

  setWorld(world) {
    this.world = world;
  }

  static async loadAssets() {
    const [terrainAtlas, spritesheet, bombSpritesheet, bombIcon] = await Promise.all([
      loadImage("./assets/tiles/terrain-atlas.png"),
      loadImage("./assets/sprites/player-spritesheet.png"),
      loadImage("./assets/sprites/bomb-spritesheet.png"),
      loadImage("./assets/sprites/bomb-icon.png"),
    ]);

    return {
      terrainAtlas,
      terrainAtlasManifest: TERRAIN_ATLAS_MANIFEST,
      spritesheet,
      bombSpritesheet,
      bombIcon,
    };
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

  render({ player, world, inventory, miningResult, hoverTarget, particles, bombs, pickups, floatingTexts, roundInfo }) {
    this.uiRenderer.updateFrameRateCounter();
    this.updateCamera(player);
    this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.worldRenderer.drawBackground(player);
    this.worldRenderer.drawVisibleTerrain(world);
    this.worldRenderer.drawFallingDebris(world.getFallingDebris?.() ?? []);
    this.entityRenderer.drawBombs(bombs ?? []);
    this.worldRenderer.drawMiningHighlight(hoverTarget, miningResult);
    this.entityRenderer.drawPickups(pickups);
    this.entityRenderer.drawParticles(particles);
    this.entityRenderer.drawPlayer(player);
    this.uiRenderer.drawHud(inventory, roundInfo);
    this.uiRenderer.drawHotbar(inventory);
    this.uiRenderer.drawSurveyPanel(player, miningResult?.target ?? hoverTarget);
    this.entityRenderer.drawFloatingTexts(floatingTexts);
    this.uiRenderer.drawPerformanceCounters(roundInfo);
  }
}
