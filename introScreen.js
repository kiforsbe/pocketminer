export function createIntroScreenController({ titleImageSrc = "", onStartAttempt } = {}) {
  const introOverlay = document.getElementById("intro-overlay");
  const introScreen = document.querySelector(".intro-screen");
  const introTitleImage = document.getElementById("intro-title-image");
  const introTitleText = document.getElementById("intro-title-text");
  const introStartButton = document.getElementById("intro-start-button");
  let exitTimeoutId = null;

  function clearBackgroundArt() {
    introScreen?.style.removeProperty("--intro-art");
    introScreen?.setAttribute("data-has-art", "false");
  }

  function setBackgroundArt(imageSrc) {
    introScreen?.style.setProperty("--intro-art", `url("${imageSrc}")`);
    introScreen?.setAttribute("data-has-art", "true");
  }

  function configureTitleImage() {
    return new Promise((resolve) => {
    if (!(introTitleImage instanceof HTMLImageElement)) {
        resolve();
        return;
    }

    if (!titleImageSrc) {
      introTitleImage.hidden = true;
      introTitleText?.removeAttribute("hidden");
      clearBackgroundArt();
        resolve();
        return;
    }

    introTitleImage.addEventListener("load", () => {
      introTitleImage.hidden = true;
      setBackgroundArt(titleImageSrc);
      introTitleText?.setAttribute("hidden", "true");
        resolve();
    }, { once: true });
    introTitleImage.addEventListener("error", () => {
      introTitleImage.hidden = true;
      clearBackgroundArt();
      introTitleText?.removeAttribute("hidden");
        resolve();
    }, { once: true });
    introTitleImage.src = titleImageSrc;
    });
  }

  function attachControls() {
    const handleIntroAdvance = () => {
      onStartAttempt?.();
    };

    window.addEventListener("keydown", handleIntroAdvance);
    introOverlay?.addEventListener("pointerdown", handleIntroAdvance);
    introStartButton?.addEventListener("click", handleIntroAdvance);
  }

  return {
    async init() {
      await configureTitleImage();
      attachControls();
      introStartButton?.removeAttribute("hidden");
      this.show();
    },

    hide() {
      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }
      introStartButton?.setAttribute("hidden", "true");
      introOverlay?.setAttribute("data-visible", "false");
      introOverlay?.setAttribute("hidden", "true");
    },

    startExit({ durationMs = 0, onComplete } = {}) {
      const normalizedDurationMs = Math.max(0, Math.round(durationMs));
      if (!introOverlay) {
        onComplete?.();
        return;
      }

      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }

      introStartButton?.setAttribute("hidden", "true");
      introOverlay.style.setProperty("--intro-fade-duration", `${normalizedDurationMs}ms`);
      introOverlay.setAttribute("data-visible", "false");

      if (normalizedDurationMs === 0) {
        introOverlay.setAttribute("hidden", "true");
        onComplete?.();
        return;
      }

      exitTimeoutId = window.setTimeout(() => {
        exitTimeoutId = null;
        introOverlay.setAttribute("hidden", "true");
        onComplete?.();
      }, normalizedDurationMs);
    },

    show() {
      if (exitTimeoutId !== null) {
        window.clearTimeout(exitTimeoutId);
        exitTimeoutId = null;
      }
      introStartButton?.removeAttribute("hidden");
      introOverlay?.style.removeProperty("--intro-fade-duration");
      introOverlay?.removeAttribute("hidden");
      introOverlay?.setAttribute("data-visible", "true");
    },
  };
}