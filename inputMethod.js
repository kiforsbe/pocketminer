export const TILE_SIZE = 32;
export const POINTER_AIM_DEADZONE_PX = 4;

export const DEFAULT_BINDINGS = Object.freeze({
  left: ["KeyA", "ArrowLeft", "GamepadMoveLeft"],
  right: ["KeyD", "ArrowRight", "GamepadMoveRight"],
  jump: ["KeyW", "ArrowUp", "GamepadBottom"],
  dropPlatform: ["KeyS", "ArrowDown", "GamepadMoveDown"],
  mine: ["Space", "Pointer0", "GamepadLeft"],
  placePlatform: ["KeyQ"],
  placeBomb: ["KeyE"],
  usePrimaryTool: ["Pointer2"],
  togglePrimaryTool: ["Tab", "GamepadTop"],
  pause: ["KeyP", "Pause", "Escape", "GamepadStart"],
  togglePerformance: ["KeyR", "GamepadBack"],
  rewardPrev: ["KeyA", "ArrowLeft", "KeyW", "ArrowUp", "GamepadMoveLeft", "GamepadMoveUp"],
  rewardNext: ["KeyD", "ArrowRight", "KeyS", "ArrowDown", "GamepadMoveRight", "GamepadMoveDown"],
  rewardConfirm: ["Enter", "Space", "KeyE", "GamepadBottom"],
  rewardChoice1: ["Digit1", "Numpad1"],
  rewardChoice2: ["Digit2", "Numpad2"],
  rewardChoice3: ["Digit3", "Numpad3"],
  menuAdvance: ["Enter", "Space", "GamepadBottom", "GamepadStart"],
  leftTool: ["GamepadLeftShoulder"],
  rightTool: ["GamepadRightShoulder"],
});

export function cloneBindings(bindings = DEFAULT_BINDINGS) {
  return Object.fromEntries(
    Object.entries(bindings).map(([action, inputs]) => [action, [...inputs]]),
  );
}

export class InputMethod {
  constructor({ id, bindings = DEFAULT_BINDINGS } = {}) {
    this.id = id;
    this.bindings = bindings;
  }

  setBindings(bindings) {
    this.bindings = bindings;
  }

  setActionBinding(action, inputs = []) {
    this.bindings[action] = [...inputs];
  }

  isMappedActionDown(action, activeInputs) {
    return this.bindings[action]?.some((code) => activeInputs.has(code)) ?? false;
  }

  isMappedActionPressed(action, pressedInputs) {
    return this.bindings[action]?.some((code) => pressedInputs.has(code)) ?? false;
  }

  isMappedActionReleased(action, releasedInputs) {
    return this.bindings[action]?.some((code) => releasedInputs.has(code)) ?? false;
  }

  isDown() {
    return false;
  }

  wasPressed() {
    return false;
  }

  wasReleased() {
    return false;
  }

  getValue() {
    return null;
  }

  update() {}

  endFrame() {}

  destroy() {}
}