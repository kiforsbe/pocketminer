import { PanelScreenController } from "./screenControllerBase.js";

export function createPauseScreenController({ titleImageSrc = "", onResumeAttempt } = {}) {
  return new PanelScreenController({
    overlayId: "pause-overlay",
    screenSelector: ".pause-screen",
    titleImageId: "pause-title-image",
    titleTextId: "pause-title-text",
    actionButtonId: "pause-continue-button",
    titleImageSrc,
    showInputDelayMs: 140,
    onAdvanceAttempt: onResumeAttempt,
  });
}