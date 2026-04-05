import { PanelScreenController } from "./screenControllerBase.js";

export function createIntroScreenController({ titleImageSrc = "", onStartAttempt } = {}) {
  const controller = new PanelScreenController({
    overlayId: "intro-overlay",
    screenSelector: ".intro-screen",
    titleImageId: "intro-title-image",
    titleTextId: "intro-title-text",
    actionButtonId: "intro-start-button",
    titleImageSrc,
    onAdvanceAttempt: onStartAttempt,
  });

  controller.init = async () => {
    await PanelScreenController.prototype.init.call(controller);
    controller.show();
  };

  return controller;
}