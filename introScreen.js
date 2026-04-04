export function createIntroScreenController({ titleImageSrc = "", onStartAttempt } = {}) {
  const introOverlay = document.getElementById("intro-overlay");
  const introScreen = document.querySelector(".intro-screen");
  const introTitleImage = document.getElementById("intro-title-image");
  const introTitleText = document.getElementById("intro-title-text");
  const introStartButton = document.getElementById("intro-start-button");

  function clearBackgroundArt() {
    introScreen?.style.removeProperty("--intro-art");
    introScreen?.setAttribute("data-has-art", "false");
  }

  function setBackgroundArt(imageSrc) {
    introScreen?.style.setProperty("--intro-art", `url("${imageSrc}")`);
    introScreen?.setAttribute("data-has-art", "true");
  }

  function configureTitleImage() {
    if (!(introTitleImage instanceof HTMLImageElement)) {
      return;
    }

    if (!titleImageSrc) {
      introTitleImage.hidden = true;
      introTitleText?.removeAttribute("hidden");
      clearBackgroundArt();
      return;
    }

    introTitleImage.addEventListener("load", () => {
      introTitleImage.hidden = true;
      setBackgroundArt(titleImageSrc);
      introTitleText?.setAttribute("hidden", "true");
    }, { once: true });
    introTitleImage.addEventListener("error", () => {
      introTitleImage.hidden = true;
      clearBackgroundArt();
      introTitleText?.removeAttribute("hidden");
    }, { once: true });
    introTitleImage.src = titleImageSrc;
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
    init() {
      configureTitleImage();
      attachControls();
    },

    hide() {
      introOverlay?.setAttribute("data-visible", "false");
      introOverlay?.setAttribute("hidden", "true");
    },

    show() {
      introOverlay?.removeAttribute("hidden");
      introOverlay?.setAttribute("data-visible", "true");
    },
  };
}