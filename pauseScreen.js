export function createPauseScreenController({ titleImageSrc = "", onResumeAttempt } = {}) {
  const pauseOverlay = document.getElementById("pause-overlay");
  const pauseScreen = document.querySelector(".pause-screen");
  const pauseTitleImage = document.getElementById("pause-title-image");
  const pauseTitleText = document.getElementById("pause-title-text");
  const pauseContinueButton = document.getElementById("pause-continue-button");
  let exitTimeoutId = null;
  let suppressInputUntil = 0;
  const ignoredAdvanceKeys = new Set([
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

  function clearBackgroundArt() {
    pauseScreen?.style.removeProperty("--intro-art");
    pauseScreen?.setAttribute("data-has-art", "false");
  }

  function setBackgroundArt(imageSrc) {
    pauseScreen?.style.setProperty("--intro-art", `url("${imageSrc}")`);
    pauseScreen?.setAttribute("data-has-art", "true");
  }

  function configureTitleImage() {
    return new Promise((resolve) => {
      if (!(pauseTitleImage instanceof HTMLImageElement)) {
        resolve();
        return;
      }

      if (!titleImageSrc) {
        pauseTitleImage.hidden = true;
        pauseTitleText?.removeAttribute("hidden");
        clearBackgroundArt();
        resolve();
        return;
      }

      pauseTitleImage.addEventListener("load", () => {
        pauseTitleImage.hidden = true;
        setBackgroundArt(titleImageSrc);
        pauseTitleText?.setAttribute("hidden", "true");
        resolve();
      }, { once: true });

      pauseTitleImage.addEventListener("error", () => {
        pauseTitleImage.hidden = true;
        clearBackgroundArt();
        pauseTitleText?.removeAttribute("hidden");
        resolve();
      }, { once: true });

      pauseTitleImage.src = titleImageSrc;
    });
  }

  function handleResumeAttempt() {
    if (performance.now() < suppressInputUntil) {
      return;
    }

    onResumeAttempt?.();
  }

  function attachControls() {
    const handleResumeKeydown = (event) => {
      if (ignoredAdvanceKeys.has(event.key)) {
        return;
      }

      handleResumeAttempt();
    };

    window.addEventListener("keydown", handleResumeKeydown);
    pauseOverlay?.addEventListener("pointerdown", handleResumeAttempt);
    pauseContinueButton?.addEventListener("click", handleResumeAttempt);
  }

  return {
    async init() {
      await configureTitleImage();
      attachControls();
      pauseContinueButton?.setAttribute("hidden", "true");
      this.hide();
    },

    hide() {
      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }

      pauseContinueButton?.setAttribute("hidden", "true");
      pauseOverlay?.setAttribute("data-visible", "false");
      pauseOverlay?.setAttribute("hidden", "true");
    },

    startExit({ durationMs = 0, onComplete } = {}) {
      const normalizedDurationMs = Math.max(0, Math.round(durationMs));
      if (!pauseOverlay) {
        onComplete?.();
        return;
      }

      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }

      pauseContinueButton?.setAttribute("hidden", "true");
      pauseOverlay.style.setProperty("--intro-fade-duration", `${normalizedDurationMs}ms`);
      pauseOverlay.setAttribute("data-visible", "false");

      if (normalizedDurationMs === 0) {
        pauseOverlay.setAttribute("hidden", "true");
        onComplete?.();
        return;
      }

      exitTimeoutId = window.setTimeout(() => {
        exitTimeoutId = null;
        pauseOverlay.setAttribute("hidden", "true");
        onComplete?.();
      }, normalizedDurationMs);
    },

    show() {
      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }

      suppressInputUntil = performance.now() + 140;
      pauseContinueButton?.removeAttribute("hidden");
      pauseOverlay?.style.removeProperty("--intro-fade-duration");
      pauseOverlay?.removeAttribute("hidden");
      pauseOverlay?.setAttribute("data-visible", "true");
    },
  };
}