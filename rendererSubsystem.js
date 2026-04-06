export class RendererSubsystem {
  constructor(renderer) {
    this.renderer = renderer;
  }

  get ctx() {
    return this.renderer.ctx;
  }

  get world() {
    return this.renderer.world;
  }

  get camera() {
    return this.renderer.camera;
  }

  get viewport() {
    return this.renderer.viewport;
  }

  get assets() {
    return this.renderer.assets;
  }
}