import { DEFAULT_GAME_CREDITS } from "./credits.js";
import { CreditsScroller } from "./creditsScroller.js";
import { PanelScreenController } from "./screenControllerBase.js";

const CREDITS_SCROLL_SPEED_PX_PER_SECOND = 24; // slower for movie feel
const MIN_CREDITS_SCROLL_DURATION_MS = 18000;

class GameoverScreenController extends PanelScreenController {
  constructor({
    goodEndImageSrc = "",
    badEndImageSrc = "",
    credits = DEFAULT_GAME_CREDITS,
    onContinueAttempt,
  } = {}) {
    super({
      overlayId: "gameover-overlay",
      screenSelector: ".gameover-screen",
      titleImageId: "gameover-title-image",
      titleTextId: "gameover-title-text",
      actionButtonId: "gameover-continue-button",
      showInputDelayMs: 220,
      onAdvanceAttempt: () => this.handleStageAdvance(),
    });

    this.goodEndImageSrc = goodEndImageSrc;
    this.badEndImageSrc = badEndImageSrc;
    this.credits = credits;
    this.onContinueAttempt = onContinueAttempt;
    this.endingCopy = document.getElementById("gameover-ending-copy");
    this.stage = "credits";
    this.endingType = "bad";
    this.creditsScroller = new CreditsScroller({
      creditsWindow: document.getElementById("gameover-credits-window"),
      creditsTrack: document.getElementById("gameover-credits-track"),
      credits,
      onComplete: () => {
        if (this.stage !== "credits") {
          return;
        }

        this.revealContinuePrompt();
      },
    });
  }

  async init() {
    await super.init();
    this.creditsScroller.init();
  }

  revealContinuePrompt() {
    if (this.stage === "ready") {
      return;
    }

    this.stage = "ready";
    this.stopCreditsScroll();
    this.setActionButtonVisible(true);
  }

  handleStageAdvance() {
    if (this.stage === "credits") {
      this.revealContinuePrompt();
      return;
    }

    this.onContinueAttempt?.({ endingType: this.endingType });
  }

  showEnding({ endingType = "bad", titleText = "Game Over", copyText = "" } = {}) {
    this.endingType = endingType;
    this.stage = "credits";
    this.screen?.setAttribute("data-ending", endingType);
    this.setTitleText(titleText);
    if (this.endingCopy) {
      this.endingCopy.textContent = copyText;
    }
    this.setBackgroundArt(endingType === "good" ? this.goodEndImageSrc : this.badEndImageSrc);
    super.show({ showActionButton: false, suppressInputDelayMs: this.showInputDelayMs });
    this.creditsScroller.start({
      creditsScrollSpeedPxPerSecond: CREDITS_SCROLL_SPEED_PX_PER_SECOND,
      minCreditsScrollDurationMs: MIN_CREDITS_SCROLL_DURATION_MS,
    });
  }

  hide() {
    this.creditsScroller.stop();
    this.stage = "credits";
    super.hide();
  }
}

export function createGameoverScreenController(options = {}) {
  return new GameoverScreenController(options);
}