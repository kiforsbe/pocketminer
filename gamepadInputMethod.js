import { InputMethod } from "./inputMethod.js";

const GAMEPAD_LEFT_STICK_X_AXIS = 0;
const GAMEPAD_LEFT_STICK_Y_AXIS = 1;
const GAMEPAD_RIGHT_STICK_X_AXIS = 2;
const GAMEPAD_RIGHT_STICK_Y_AXIS = 3;
const GAMEPAD_AXIS_DEADZONE = 0.35;
const GAMEPAD_TRIGGER_THRESHOLD = 0.45;
const GAMEPAD_AIM_DEADZONE = 0.2;
const GAMEPAD_BUTTONS = Object.freeze({
  bottom: 0,
  left: 2,
  top: 3,
  leftShoulder: 4,
  rightShoulder: 5,
  back: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
});

export class GamepadInputMethod extends InputMethod {
  constructor(bindings) {
    super({ id: "gamepad", bindings });
    this.index = null;
    this.connected = false;
    this.actionsDown = new Set();
    this.actionsPressed = new Set();
    this.actionsReleased = new Set();
    this.movement = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0, magnitude: 0 };
  }

  #getActiveGamepad() {
    if (typeof navigator?.getGamepads !== "function") {
      return null;
    }

    const connectedGamepads = Array.from(navigator.getGamepads()).filter((gamepad) => gamepad?.connected);
    if (connectedGamepads.length === 0) {
      this.index = null;
      return null;
    }

    const previousGamepad = connectedGamepads.find((gamepad) => gamepad.index === this.index);
    const nextGamepad = previousGamepad ?? connectedGamepads[0];
    this.index = nextGamepad?.index ?? null;
    return nextGamepad ?? null;
  }

  #isButtonDown(gamepad, buttonIndex) {
    const button = gamepad?.buttons?.[buttonIndex];
    if (!button) {
      return false;
    }

    if (typeof button === "number") {
      return button >= GAMEPAD_TRIGGER_THRESHOLD;
    }

    return button.pressed || button.value >= GAMEPAD_TRIGGER_THRESHOLD;
  }

  #getAxisDirection(value, deadzone = GAMEPAD_AXIS_DEADZONE) {
    if (!Number.isFinite(value) || Math.abs(value) < deadzone) {
      return 0;
    }

    return Math.sign(value);
  }

  #getAim(gamepad) {
    const axisX = gamepad?.axes?.[GAMEPAD_RIGHT_STICK_X_AXIS] ?? 0;
    const axisY = gamepad?.axes?.[GAMEPAD_RIGHT_STICK_Y_AXIS] ?? 0;
    const magnitude = Math.min(1, Math.hypot(axisX, axisY));
    if (magnitude < GAMEPAD_AIM_DEADZONE) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    const normalizedMagnitude = (magnitude - GAMEPAD_AIM_DEADZONE) / (1 - GAMEPAD_AIM_DEADZONE);
    return {
      x: axisX / magnitude,
      y: axisY / magnitude,
      magnitude: Math.max(0, Math.min(1, normalizedMagnitude)),
    };
  }

  #getMovement(gamepad) {
    let x = this.#getAxisDirection(gamepad?.axes?.[GAMEPAD_LEFT_STICK_X_AXIS] ?? 0);
    let y = this.#getAxisDirection(gamepad?.axes?.[GAMEPAD_LEFT_STICK_Y_AXIS] ?? 0);

    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.dpadLeft)) {
      x -= 1;
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.dpadRight)) {
      x += 1;
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.dpadUp)) {
      y -= 1;
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.dpadDown)) {
      y += 1;
    }

    return { x: Math.sign(x), y: Math.sign(y) };
  }

  #buildActiveInputs(gamepad, movement) {
    const activeInputs = new Set();

    if (movement.x < 0) {
      activeInputs.add("GamepadMoveLeft");
    }
    if (movement.x > 0) {
      activeInputs.add("GamepadMoveRight");
    }
    if (movement.y < 0) {
      activeInputs.add("GamepadMoveUp");
    }
    if (movement.y > 0) {
      activeInputs.add("GamepadMoveDown");
    }

    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.bottom)) {
      activeInputs.add("GamepadBottom");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.left)) {
      activeInputs.add("GamepadLeft");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.top)) {
      activeInputs.add("GamepadTop");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.leftShoulder)) {
      activeInputs.add("GamepadLeftShoulder");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.rightShoulder)) {
      activeInputs.add("GamepadRightShoulder");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.start)) {
      activeInputs.add("GamepadStart");
    }
    if (this.#isButtonDown(gamepad, GAMEPAD_BUTTONS.back)) {
      activeInputs.add("GamepadBack");
    }

    return activeInputs;
  }

  update() {
    const gamepad = this.#getActiveGamepad();
    if (!gamepad) {
      this.connected = false;
      this.movement = { x: 0, y: 0 };
      this.aim = { x: 0, y: 0, magnitude: 0 };
      this.actionsPressed = new Set();
      this.actionsReleased = new Set(this.actionsDown);
      this.actionsDown = new Set();
      return;
    }

    this.connected = true;
    const nextMovement = this.#getMovement(gamepad);
    const nextAim = this.#getAim(gamepad);
    const nextInputsDown = this.#buildActiveInputs(gamepad, nextMovement);
    const nextActionsPressed = new Set();
    const nextActionsReleased = new Set();

    for (const input of nextInputsDown) {
      if (!this.actionsDown.has(input)) {
        nextActionsPressed.add(input);
      }
    }

    for (const input of this.actionsDown) {
      if (!nextInputsDown.has(input)) {
        nextActionsReleased.add(input);
      }
    }

    this.movement = nextMovement;
    this.aim = nextAim;
    this.actionsDown = nextInputsDown;
    this.actionsPressed = nextActionsPressed;
    this.actionsReleased = nextActionsReleased;
  }

  isDown(action) {
    return this.isMappedActionDown(action, this.actionsDown);
  }

  wasPressed(action) {
    return this.isMappedActionPressed(action, this.actionsPressed);
  }

  wasReleased(action) {
    return this.isMappedActionReleased(action, this.actionsReleased);
  }

  getMovementVector() {
    return this.movement;
  }

  getAim() {
    return this.aim;
  }

  getValue(name, context = {}) {
    if (name === "movementVector") {
      return this.getMovementVector();
    }

    if (name === "placementAimWorld") {
      const { player, maxRangeTiles } = context;
      if (!player || !Number.isFinite(maxRangeTiles) || maxRangeTiles <= 0 || this.aim.magnitude <= 0) {
        return null;
      }

      const maxRange = maxRangeTiles * 32;
      const playerCenter = player.getCenter();
      return {
        x: playerCenter.x + this.aim.x * maxRange * this.aim.magnitude,
        y: playerCenter.y + this.aim.y * maxRange * this.aim.magnitude,
      };
    }

    return null;
  }

  endFrame() {
    this.actionsPressed.clear();
    this.actionsReleased.clear();
  }
}