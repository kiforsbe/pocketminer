export class Input {
  constructor(target = window) {
    this.target = target;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.onKeyDown = (event) => this.#handleKeyDown(event);
    this.onKeyUp = (event) => this.#handleKeyUp(event);
    this.bindings = {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      jump: ["KeyW", "ArrowUp"],
      mine: ["KeyE", "Space"],
    };

    this.target.addEventListener("keydown", this.onKeyDown);
    this.target.addEventListener("keyup", this.onKeyUp);
  }

  #handleKeyDown(event) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
      event.preventDefault();
    }

    if (!this.keysDown.has(event.code)) {
      this.keysPressed.add(event.code);
    }

    this.keysDown.add(event.code);
  }

  #handleKeyUp(event) {
    this.keysDown.delete(event.code);
  }

  isDown(action) {
    return this.bindings[action]?.some((code) => this.keysDown.has(code)) ?? false;
  }

  wasPressed(action) {
    return this.bindings[action]?.some((code) => this.keysPressed.has(code)) ?? false;
  }

  endFrame() {
    this.keysPressed.clear();
  }

  destroy() {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
  }
}