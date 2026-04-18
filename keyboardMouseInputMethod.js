import { InputMethod } from "./inputMethod.js";

const PREVENT_DEFAULT_KEY_CODES = Object.freeze(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"]);

export class KeyboardMouseInputMethod extends InputMethod {
  constructor({ keyboardTarget, pointerTarget, bindings, keyPressListeners }) {
    super({ id: "keyboardMouse", bindings });
    this.keyboardTarget = keyboardTarget;
    this.pointerTarget = pointerTarget;
    this.keyPressListeners = keyPressListeners;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.pointer = {
      x: 0,
      y: 0,
      active: false,
      buttonsDown: new Set(),
      buttonsPressed: new Set(),
    };
    this.onKeyDown = (event) => this.#handleKeyDown(event);
    this.onKeyUp = (event) => this.#handleKeyUp(event);
    this.onPointerMove = (event) => this.#handlePointerMove(event);
    this.onPointerEnter = (event) => this.#handlePointerEnter(event);
    this.onPointerLeave = () => this.#handlePointerLeave();
    this.onPointerDown = (event) => this.#handlePointerDown(event);
    this.onPointerUp = (event) => this.#handlePointerUp(event);
    this.onContextMenu = (event) => event.preventDefault();

    this.keyboardTarget.addEventListener("keydown", this.onKeyDown);
    this.keyboardTarget.addEventListener("keyup", this.onKeyUp);
    this.pointerTarget.addEventListener("pointermove", this.onPointerMove);
    this.pointerTarget.addEventListener("pointerenter", this.onPointerEnter);
    this.pointerTarget.addEventListener("pointerleave", this.onPointerLeave);
    this.pointerTarget.addEventListener("pointerdown", this.onPointerDown);
    this.pointerTarget.addEventListener("pointerup", this.onPointerUp);
    this.pointerTarget.addEventListener("contextmenu", this.onContextMenu);
  }

  #handleKeyDown(event) {
    if (PREVENT_DEFAULT_KEY_CODES.includes(event.code)) {
      event.preventDefault();
    }

    if (!this.keysDown.has(event.code)) {
      this.keysPressed.add(event.code);
      for (const listener of this.keyPressListeners) {
        listener(event);
      }
    }

    this.keysDown.add(event.code);
  }

  #handleKeyUp(event) {
    this.keysDown.delete(event.code);
  }

  #handlePointerMove(event) {
    const rect = this.pointerTarget.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
    this.pointer.active = true;
  }

  #handlePointerEnter(event) {
    this.#handlePointerMove(event);
  }

  #handlePointerLeave() {
    this.pointer.active = false;
    this.pointer.buttonsDown.clear();
    this.pointer.buttonsPressed.clear();
  }

  #handlePointerDown(event) {
    this.#handlePointerMove(event);
    this.pointer.buttonsPressed.add(event.button);
    this.pointer.buttonsDown.add(event.button);
  }

  #handlePointerUp(event) {
    this.pointer.buttonsDown.delete(event.button);
  }

  #buildActiveInputs() {
    const activeInputs = new Set(this.keysDown);
    for (const button of this.pointer.buttonsDown) {
      activeInputs.add(`Pointer${button}`);
    }

    return activeInputs;
  }

  #buildPressedInputs() {
    const pressedInputs = new Set(this.keysPressed);
    for (const button of this.pointer.buttonsPressed) {
      pressedInputs.add(`Pointer${button}`);
    }

    return pressedInputs;
  }

  isDown(action) {
    return this.isMappedActionDown(action, this.#buildActiveInputs());
  }

  wasPressed(action) {
    return this.isMappedActionPressed(action, this.#buildPressedInputs());
  }

  getMovementVector() {
    let x = 0;
    let y = 0;

    if (this.isDown("left")) {
      x -= 1;
    }
    if (this.isDown("right")) {
      x += 1;
    }
    if (this.isDown("jump")) {
      y -= 1;
    }
    if (this.isDown("dropPlatform")) {
      y += 1;
    }

    return { x: Math.sign(x), y: Math.sign(y) };
  }

  getPointerWorld(renderer) {
    if (!this.pointer.active) {
      return null;
    }

    return renderer.screenToWorld(this.pointer.x, this.pointer.y);
  }

  getValue(name, context = {}) {
    if (name === "movementVector") {
      return this.getMovementVector();
    }

    if (name === "pointerWorld") {
      return this.getPointerWorld(context.renderer);
    }

    if (name === "placementAimWorld") {
      const { player, renderer, maxRangeTiles } = context;
      if (!player || !renderer || !Number.isFinite(maxRangeTiles) || maxRangeTiles <= 0) {
        return null;
      }

      const pointerWorld = this.getPointerWorld(renderer);
      if (!pointerWorld) {
        return null;
      }

      const maxRange = maxRangeTiles * 32;
      const playerCenter = player.getCenter();
      const dx = pointerWorld.x - playerCenter.x;
      const dy = pointerWorld.y - playerCenter.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 4) {
        return null;
      }

      const clampedDistance = Math.min(distance, maxRange);
      return {
        x: playerCenter.x + (dx / distance) * clampedDistance,
        y: playerCenter.y + (dy / distance) * clampedDistance,
      };
    }

    return null;
  }

  endFrame() {
    this.keysPressed.clear();
    this.pointer.buttonsPressed.clear();
  }

  destroy() {
    this.keyboardTarget.removeEventListener("keydown", this.onKeyDown);
    this.keyboardTarget.removeEventListener("keyup", this.onKeyUp);
    this.pointerTarget.removeEventListener("pointermove", this.onPointerMove);
    this.pointerTarget.removeEventListener("pointerenter", this.onPointerEnter);
    this.pointerTarget.removeEventListener("pointerleave", this.onPointerLeave);
    this.pointerTarget.removeEventListener("pointerdown", this.onPointerDown);
    this.pointerTarget.removeEventListener("pointerup", this.onPointerUp);
    this.pointerTarget.removeEventListener("contextmenu", this.onContextMenu);
  }
}