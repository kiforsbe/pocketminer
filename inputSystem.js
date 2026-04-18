import { DEFAULT_BINDINGS, InputMethod, cloneBindings } from "./inputMethod.js";
import { GamepadInputMethod } from "./gamepadInputMethod.js";
import { KeyboardMouseInputMethod } from "./keyboardMouseInputMethod.js";

export class InputSystem extends InputMethod {
  constructor({ keyboardTarget = window, pointerTarget = window, bindings = DEFAULT_BINDINGS } = {}) {
    const bindingMap = cloneBindings(bindings);
    super({ id: "system", bindings: bindingMap });
    this.keyPressListeners = new Set();
    this.methods = [
      new GamepadInputMethod(this.bindings),
      new KeyboardMouseInputMethod({
      keyboardTarget,
      pointerTarget,
      bindings: this.bindings,
      keyPressListeners: this.keyPressListeners,
      }),
    ];
  }

  #someMethod(predicate) {
    return this.methods.some(predicate);
  }

  #sumVectorValue(name) {
    const total = this.methods.reduce((vector, method) => {
      const value = method.getValue(name) ?? { x: 0, y: 0 };
      return {
        x: vector.x + (value.x ?? 0),
        y: vector.y + (value.y ?? 0),
      };
    }, { x: 0, y: 0 });

    return {
      x: Math.sign(total.x),
      y: Math.sign(total.y),
    };
  }

  #firstValue(name, context = {}) {
    for (const method of this.methods) {
      const value = method.getValue(name, context);
      if (value) {
        return value;
      }
    }

    return null;
  }

  setBindings(bindings) {
    this.bindings = cloneBindings(bindings);
    this.methods.forEach((method) => method.setBindings(this.bindings));
  }

  setActionBinding(action, inputs = []) {
    super.setActionBinding(action, inputs);
    this.methods.forEach((method) => method.setActionBinding(action, inputs));
  }

  update() {
    this.methods.forEach((method) => method.update());
  }

  getPlacementAimWorld({ player, renderer, maxRangeTiles }) {
    return this.#firstValue("placementAimWorld", { player, renderer, maxRangeTiles });
  }

  getMovementVector() {
    return this.#sumVectorValue("movementVector");
  }

  isDown(action) {
    return this.#someMethod((method) => method.isDown(action));
  }

  wasPressed(action) {
    return this.#someMethod((method) => method.wasPressed(action));
  }

  wasReleased(action) {
    return this.#someMethod((method) => method.wasReleased(action));
  }

  endFrame() {
    this.methods.forEach((method) => method.endFrame());
  }

  getPointerWorld(renderer) {
    return this.#firstValue("pointerWorld", { renderer });
  }

  addKeyPressListener(listener) {
    this.keyPressListeners.add(listener);
  }

  removeKeyPressListener(listener) {
    this.keyPressListeners.delete(listener);
  }

  destroy() {
    this.methods.forEach((method) => method.destroy());
  }
}

export { InputSystem as Input };