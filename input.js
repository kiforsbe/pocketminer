export class Input {
  constructor({ keyboardTarget = window, pointerTarget = window } = {}) {
    this.keyboardTarget = keyboardTarget;
    this.pointerTarget = pointerTarget;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keyPressListeners = new Set();
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
    this.bindings = {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      jump: ["KeyW", "ArrowUp"],
      dropPlatform: ["KeyS", "ArrowDown"],
      mine: ["Space"],
      placePlatform: ["KeyQ"],
      placeBomb: ["KeyE"],
      togglePrimaryTool: ["Tab"],
      rewardPrev: ["KeyA", "ArrowLeft", "KeyW", "ArrowUp"],
      rewardNext: ["KeyD", "ArrowRight", "KeyS", "ArrowDown"],
      rewardConfirm: ["Enter", "Space", "KeyE"],
      rewardChoice1: ["Digit1", "Numpad1"],
      rewardChoice2: ["Digit2", "Numpad2"],
      rewardChoice3: ["Digit3", "Numpad3"],
    };

    this.keyboardTarget.addEventListener("keydown", this.onKeyDown);
    this.keyboardTarget.addEventListener("keyup", this.onKeyUp);
    this.pointerTarget.addEventListener("pointermove", this.onPointerMove);
    this.pointerTarget.addEventListener("pointerenter", this.onPointerEnter);
    this.pointerTarget.addEventListener("pointerleave", this.onPointerLeave);
    this.pointerTarget.addEventListener("pointerdown", this.onPointerDown);
    this.pointerTarget.addEventListener("pointerup", this.onPointerUp);
    this.pointerTarget.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  #handleKeyDown(event) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Tab"].includes(event.code)) {
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

  isDown(action) {
    const keyboardMatch = this.bindings[action]?.some((code) => this.keysDown.has(code)) ?? false;
    if (action === "mine") {
      return keyboardMatch || this.pointer.buttonsDown.has(0);
    }

    if (action === "usePrimaryTool") {
      return keyboardMatch || this.pointer.buttonsDown.has(2);
    }

    return keyboardMatch;
  }

  wasPressed(action) {
    if (action === "usePrimaryTool") {
      const keyboardMatch = this.bindings[action]?.some((code) => this.keysPressed.has(code)) ?? false;
      return keyboardMatch || this.pointer.buttonsPressed.has(2);
    }

    return this.bindings[action]?.some((code) => this.keysPressed.has(code)) ?? false;
  }

  endFrame() {
    this.keysPressed.clear();
    this.pointer.buttonsPressed.clear();
  }

  getPointerWorld(renderer) {
    if (!this.pointer.active) {
      return null;
    }

    return renderer.screenToWorld(this.pointer.x, this.pointer.y);
  }

  addKeyPressListener(listener) {
    this.keyPressListeners.add(listener);
  }

  removeKeyPressListener(listener) {
    this.keyPressListeners.delete(listener);
  }

  destroy() {
    this.keyboardTarget.removeEventListener("keydown", this.onKeyDown);
    this.keyboardTarget.removeEventListener("keyup", this.onKeyUp);
    this.pointerTarget.removeEventListener("pointermove", this.onPointerMove);
    this.pointerTarget.removeEventListener("pointerenter", this.onPointerEnter);
    this.pointerTarget.removeEventListener("pointerleave", this.onPointerLeave);
    this.pointerTarget.removeEventListener("pointerdown", this.onPointerDown);
    this.pointerTarget.removeEventListener("pointerup", this.onPointerUp);
  }
}