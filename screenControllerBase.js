const DEFAULT_IGNORED_ADVANCE_KEYS = Object.freeze([
  "Alt",
  "AltGraph",
  "CapsLock",
  "Control",
  "Fn",
  "FnLock",
  "Hyper",
  "Meta",
  "NumLock",
  "ScrollLock",
  "Shift",
  "Super",
  "Symbol",
  "SymbolLock",
  "Tab",
  "OS",
]);

export class PanelScreenController {
  constructor({
    overlayId,
    screenSelector,
    titleImageId,
    titleTextId,
    actionButtonId,
    titleImageSrc = "",
    ignoredAdvanceKeys = DEFAULT_IGNORED_ADVANCE_KEYS,
    showInputDelayMs = 0,
    onAdvanceAttempt,
  } = {}) {
    this.overlay = document.getElementById(overlayId);
    this.screen = document.querySelector(screenSelector);
    this.titleImage = document.getElementById(titleImageId);
    this.titleText = document.getElementById(titleTextId);
    this.actionButton = document.getElementById(actionButtonId);
    this.titleImageSrc = titleImageSrc;
    this.ignoredAdvanceKeys = new Set(ignoredAdvanceKeys);
    this.showInputDelayMs = showInputDelayMs;
    this.onAdvanceAttempt = onAdvanceAttempt;
    this.exitTimeoutId = null;
    this.suppressInputUntil = 0;
    this.advanceBlocked = false;
    this.controlsAttached = false;
    this.handleKeydown = (event) => {
      if (this.ignoredAdvanceKeys.has(event.key)) {
        return;
      }

      this.handleAdvanceAttempt(event);
    };
    this.handlePointerdown = (event) => this.handleAdvanceAttempt(event);
    this.handleButtonClick = (event) => this.handleAdvanceAttempt(event);
  }

  shouldIgnoreAdvanceEvent(event) {
    const target = event?.target;
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest('[data-screen-ignore-advance="true"]'));
  }

  isVisible() {
    return this.overlay?.getAttribute("data-visible") === "true"
      && !this.overlay?.hasAttribute("hidden");
  }

  clearBackgroundArt() {
    this.screen?.style.removeProperty("--intro-art");
    this.screen?.setAttribute("data-has-art", "false");
  }

  setBackgroundArt(imageSrc) {
    this.screen?.style.setProperty("--intro-art", `url("${imageSrc}")`);
    this.screen?.setAttribute("data-has-art", "true");
  }

  setActionButtonVisible(visible) {
    if (visible) {
      this.actionButton?.removeAttribute("hidden");
      return;
    }

    this.actionButton?.setAttribute("hidden", "true");
  }

  setTitleText(text) {
    if (!this.titleText) {
      return;
    }

    this.titleText.textContent = text;
    this.titleText.removeAttribute("hidden");
  }

  setTitleArt(imageSrc = "") {
    this.titleImageSrc = imageSrc;

    return new Promise((resolve) => {
      if (!(this.titleImage instanceof HTMLImageElement)) {
        resolve();
        return;
      }

      if (!imageSrc) {
        this.titleImage.hidden = true;
        this.titleText?.removeAttribute("hidden");
        this.clearBackgroundArt();
        resolve();
        return;
      }

      const handleLoad = () => {
        this.titleImage.hidden = true;
        this.setBackgroundArt(imageSrc);
        this.titleText?.setAttribute("hidden", "true");
        resolve();
      };

      const handleError = () => {
        this.titleImage.hidden = true;
        this.clearBackgroundArt();
        this.titleText?.removeAttribute("hidden");
        resolve();
      };

      this.titleImage.addEventListener("load", handleLoad, { once: true });
      this.titleImage.addEventListener("error", handleError, { once: true });
      this.titleImage.src = imageSrc;
    });
  }

  attachControls() {
    if (this.controlsAttached) {
      return;
    }

    window.addEventListener("keydown", this.handleKeydown);
    this.overlay?.addEventListener("pointerdown", this.handlePointerdown);
    this.actionButton?.addEventListener("click", this.handleButtonClick);
    this.controlsAttached = true;
  }

  handleAdvanceAttempt(event) {
    if (!this.isVisible()) {
      return;
    }

    if (this.advanceBlocked || this.shouldIgnoreAdvanceEvent(event)) {
      return;
    }

    if (performance.now() < this.suppressInputUntil) {
      return;
    }

    this.onAdvanceAttempt?.(event);
  }

  async init() {
    await this.setTitleArt(this.titleImageSrc);
    this.attachControls();
    this.setActionButtonVisible(false);
    this.hide();
  }

  hide() {
    if (this.exitTimeoutId !== null) {
      window.clearTimeout(this.exitTimeoutId);
      this.exitTimeoutId = null;
    }

    this.setActionButtonVisible(false);
    this.overlay?.setAttribute("data-visible", "false");
    this.overlay?.setAttribute("hidden", "true");
    this.advanceBlocked = false;
  }

  setAdvanceBlocked(blocked) {
    this.advanceBlocked = Boolean(blocked);
  }

  startExit({ durationMs = 0, onComplete } = {}) {
    const normalizedDurationMs = Math.max(0, Math.round(durationMs));
    if (!this.overlay) {
      onComplete?.();
      return;
    }

    if (this.exitTimeoutId !== null) {
      window.clearTimeout(this.exitTimeoutId);
      this.exitTimeoutId = null;
    }

    this.setActionButtonVisible(false);
    this.overlay.style.setProperty("--intro-fade-duration", `${normalizedDurationMs}ms`);
    this.overlay.setAttribute("data-visible", "false");

    if (normalizedDurationMs === 0) {
      this.overlay.setAttribute("hidden", "true");
      onComplete?.();
      return;
    }

    this.exitTimeoutId = window.setTimeout(() => {
      this.exitTimeoutId = null;
      this.overlay.setAttribute("hidden", "true");
      onComplete?.();
    }, normalizedDurationMs);
  }

  show({ showActionButton = true, suppressInputDelayMs = this.showInputDelayMs } = {}) {
    if (this.exitTimeoutId !== null) {
      window.clearTimeout(this.exitTimeoutId);
      this.exitTimeoutId = null;
    }

    this.suppressInputUntil = performance.now() + Math.max(0, suppressInputDelayMs);
    this.advanceBlocked = false;
    this.setActionButtonVisible(showActionButton);
    this.overlay?.style.removeProperty("--intro-fade-duration");
    this.overlay?.removeAttribute("hidden");
    this.overlay?.setAttribute("data-visible", "true");
  }
}