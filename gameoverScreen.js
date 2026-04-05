import { PanelScreenController } from "./screenControllerBase.js";

const CREDITS_SCROLL_SPEED_PX_PER_SECOND = 24; // slower for movie feel
const MIN_CREDITS_SCROLL_DURATION_MS = 18000;
const DEFAULT_GAME_CREDITS = Object.freeze([
  Object.freeze({
    heading: "Pocket Miner",
    style: "simple",
    lines: Object.freeze([
      "A game by Kim Forsberg",
    ]),
  }),
  Object.freeze({
    heading: "Leadership",
    style: "paired",
    lines: Object.freeze([
      Object.freeze({ role: "Lead Director", name: "Kim Forsberg" }),
      Object.freeze({ role: "Producer", name: "Kim Forsberg" }),
      Object.freeze({ role: "Executive Producer", name: "Kim Forsberg" }),
    ]),
  }),
  Object.freeze({
    heading: "Design And Development",
    style: "paired",
    lines: Object.freeze([
      Object.freeze({ role: "Game Design, Implementation And Production", name: "Kim Forsberg" }),
    ]),
  }),
  Object.freeze({
    heading: "Creative Credits",
    style: "paired",
    lines: Object.freeze([
      Object.freeze({ role: "Lead Creative Director", name: "Kim Forsberg" }),
      Object.freeze({ role: "Prompt Engineer", name: "Kim Forsberg" }),
    ]),
  }),
  Object.freeze({
    heading: "Supporting Tools",
    style: "simple",
    lines: Object.freeze([
      "Suno",
      "Google Gemini",
      "Microsoft Copilot",
      "GitHub Copilot",
    ]),
  }),
  Object.freeze({
    style: "spacer",
    lineCount: 10,
  }),
  Object.freeze({
    heading: "Thanks For Playing",
    style: "simple",
    lines: Object.freeze([
      "Pocket Miner",
    ]),
  }),
]);

function normalizeSectionStyle(section) {
  if (section?.style === "simple") {
    return "simple";
  }

  if (section?.style === "spacer") {
    return "spacer";
  }

  return "paired";
}

function normalizeCreditLine(line) {
  if (typeof line === "string") {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex >= 0) {
      return {
        role: line.slice(0, separatorIndex).trim(),
        name: line.slice(separatorIndex + 1).trim(),
      };
    }

    return {
      role: line,
      name: "",
    };
  }

  return {
    role: line?.role ?? "",
    name: line?.name ?? "",
  };
}

function normalizeSpacerLineCount(section) {
  const lineCount = Number(section?.lineCount);
  if (!Number.isFinite(lineCount) || lineCount <= 0) {
    return 1;
  }

  return lineCount;
}

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
    this.creditsWindow = document.getElementById("gameover-credits-window");
    this.creditsTrack = document.getElementById("gameover-credits-track");
    this.stage = "credits";
    this.endingType = "bad";
    this.pendingAnimationFrameId = null;
    this.handleCreditsAnimationEnd = () => {
      if (this.stage !== "credits") {
        return;
      }

      this.revealContinuePrompt();
    };
  }

  async init() {
    await super.init();
    this.populateCredits();
    this.creditsTrack?.addEventListener("animationend", this.handleCreditsAnimationEnd);
  }

  populateCredits() {
    if (!this.creditsTrack) {
      return;
    }

    this.creditsTrack.replaceChildren();

    for (const section of this.credits) {
      const sectionEl = document.createElement("section");
      sectionEl.className = "gameover-credits-section";
      const sectionStyle = normalizeSectionStyle(section);
      sectionEl.setAttribute("data-style", sectionStyle);

      if (sectionStyle === "spacer") {
        sectionEl.setAttribute("aria-hidden", "true");
        sectionEl.style.setProperty("--gameover-spacer-lines", String(normalizeSpacerLineCount(section)));
        this.creditsTrack.append(sectionEl);
        continue;
      }

      const headingEl = document.createElement("h3");
      headingEl.className = "gameover-credits-heading";
      headingEl.textContent = section.heading;
      sectionEl.append(headingEl);

      for (const line of section.lines) {
        if (sectionStyle === "simple") {
          const lineEl = document.createElement("p");
          lineEl.className = "gameover-credits-pure-line";
          lineEl.textContent = typeof line === "string" ? line : (line?.name || line?.role || "");
          sectionEl.append(lineEl);
          continue;
        }

        const normalizedLine = normalizeCreditLine(line);
        const lineEl = document.createElement("div");
        lineEl.className = "gameover-credits-line";

        const roleEl = document.createElement("span");
        roleEl.className = "gameover-credits-role";
        roleEl.textContent = normalizedLine.role;

        const leaderEl = document.createElement("span");
        leaderEl.className = "gameover-credits-leader";
        leaderEl.setAttribute("aria-hidden", "true");

        const nameEl = document.createElement("span");
        nameEl.className = "gameover-credits-name";
        nameEl.textContent = normalizedLine.name;

        lineEl.append(roleEl, leaderEl, nameEl);
        sectionEl.append(lineEl);
      }

      this.creditsTrack.append(sectionEl);
    }
  }

  cancelPendingAnimationFrame() {
    if (this.pendingAnimationFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.pendingAnimationFrameId);
    this.pendingAnimationFrameId = null;
  }

  stopCreditsScroll() {
    this.cancelPendingAnimationFrame();
    this.creditsTrack?.removeAttribute("data-animate");
  }

  startCreditsScroll() {
    if (!this.creditsWindow || !this.creditsTrack) {
      this.revealContinuePrompt();
      return;
    }

    this.stopCreditsScroll();
    this.creditsTrack.style.removeProperty("--gameover-credits-duration");
    this.creditsTrack.style.removeProperty("--gameover-credits-start-offset");
    this.creditsTrack.style.removeProperty("--gameover-credits-end-offset");

    const beginAnimation = () => {
      this.pendingAnimationFrameId = null;
      const viewportHeight = this.creditsWindow.clientHeight;
      const trackHeight = this.creditsTrack.scrollHeight;
      if (viewportHeight <= 0 || trackHeight <= 0) {
        this.revealContinuePrompt();
        return;
      }

      const distancePx = viewportHeight + trackHeight;
      const durationMs = Math.max(
        MIN_CREDITS_SCROLL_DURATION_MS,
        Math.round((distancePx / CREDITS_SCROLL_SPEED_PX_PER_SECOND) * 1000),
      );
      this.creditsTrack.style.setProperty("--gameover-credits-duration", `${durationMs}ms`);
      this.creditsTrack.style.setProperty("--gameover-credits-start-offset", `${viewportHeight}px`);
      this.creditsTrack.style.setProperty("--gameover-credits-end-offset", `${trackHeight}px`);
      this.creditsTrack.setAttribute("data-animate", "true");
    };

    this.pendingAnimationFrameId = window.requestAnimationFrame(() => {
      this.pendingAnimationFrameId = window.requestAnimationFrame(beginAnimation);
    });
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
    this.startCreditsScroll();
  }

  hide() {
    this.stopCreditsScroll();
    this.stage = "credits";
    super.hide();
  }
}

export function createGameoverScreenController(options = {}) {
  return new GameoverScreenController(options);
}