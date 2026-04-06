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
      Object.freeze({ role: "Director", name: "Kim Forsberg" }),
      Object.freeze({ role: "Producer", name: "Kim Forsberg" }),
      Object.freeze({ role: "Executive Producer", name: "Kim Forsberg" }),
    ]),
  }),
  Object.freeze({
    heading: "Design And Development",
    style: "paired",
    lines: Object.freeze([
      Object.freeze({ role: "Game Design", name: "Kim Forsberg" }),
      Object.freeze({ role: "Implementation", name: "GitHub Copilot" }),
      Object.freeze({ role: "Tester", name: ["GitHub Copilot", "Kim Forsberg"] }),
      Object.freeze({ role: "Technical Support", name: "Microsoft Copilot" }),
      Object.freeze({ role: "Art Design", name: ["GitHub Copilot", "Google Gemini"] }),
    ]),
  }),
  Object.freeze({
    heading: "Creative Credits",
    style: "paired",
    lines: Object.freeze([
      Object.freeze({ role: "Creative Director", name: "Kim Forsberg" }),
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
    heading: "Songs",
    style: "music",
    tracks: Object.freeze([
      Object.freeze({
        title: "Crucible of the Deep",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Grand Payout",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Iron Throat",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Morning Shift at the Quarry",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Pickaxe Waltz",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Pocket Miner Outro 2",
        entries: Object.freeze([
          "Written by Suno",
          "Produced by Kim Forsberg",
          "Performed by Suno",
        ]),
      }),
      Object.freeze({
        title: "Pocket Miner Outro",
        entries: Object.freeze([
          "Written by Suno",
          "Produced by Kim Forsberg",
          "Performed by Suno",
        ]),
      }),
      Object.freeze({
        title: "Pocket Miner Theme 2",
        entries: Object.freeze([
          "Written by Suno",
          "Produced by Kim Forsberg",
          "Performed by Suno",
        ]),
      }),
      Object.freeze({
        title: "Pocket Miner Theme",
        entries: Object.freeze([
          "Written by Suno",
          "Produced by Kim Forsberg",
          "Performed by Suno",
        ]),
      }),
      Object.freeze({
        title: "Pocket Miner Victory Fanfare",
        entries: Object.freeze([
          "Written by Suno",
          "Produced by Kim Forsberg",
          "Performed by Suno",
        ]),
      }),
      Object.freeze({
        title: "Underground Hearth",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
      Object.freeze({
        title: "Vein of Obsidian",
        entries: Object.freeze([
          "Written by Google Gemini",
          "Produced by Kim Forsberg",
          "Performed by Google Gemini",
        ]),
      }),
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

  if (section?.style === "music") {
    return "music";
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
      const name = line.slice(separatorIndex + 1).trim();
      return {
        role: line.slice(0, separatorIndex).trim(),
        names: name ? [name] : [],
      };
    }

    return {
      role: line,
      names: [],
    };
  }

  const normalizedNames = Array.isArray(line?.names)
    ? line.names
    : Array.isArray(line?.name)
      ? line.name
      : [line?.name];

  return {
    role: line?.role ?? "",
    names: normalizedNames
      .map((name) => {
        if (typeof name === "string") {
          return name.trim();
        }

        if (name == null) {
          return "";
        }

        return String(name).trim();
      })
      .filter(Boolean),
  };
}

function normalizeSpacerLineCount(section) {
  const lineCount = Number(section?.lineCount);
  if (!Number.isFinite(lineCount) || lineCount <= 0) {
    return 1;
  }

  return lineCount;
}

function normalizeMusicTrack(track) {
  const title = typeof track?.title === "string"
    ? track.title.trim()
    : "";
  const entries = Array.isArray(track?.entries)
    ? track.entries
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }

        if (entry == null) {
          return "";
        }

        return String(entry).trim();
      })
      .filter(Boolean)
    : [];

  return {
    title,
    entries,
  };
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

      if (sectionStyle === "music") {
        for (const track of section.tracks || []) {
          const normalizedTrack = normalizeMusicTrack(track);
          if (!normalizedTrack.title && normalizedTrack.entries.length === 0) {
            continue;
          }

          const trackEl = document.createElement("article");
          trackEl.className = "gameover-credits-music-track";

          if (normalizedTrack.title) {
            const trackTitleEl = document.createElement("h4");
            trackTitleEl.className = "gameover-credits-music-title";
            trackTitleEl.textContent = `"${normalizedTrack.title}"`;
            trackEl.append(trackTitleEl);
          }

          for (const entry of normalizedTrack.entries) {
            const entryEl = document.createElement("p");
            entryEl.className = "gameover-credits-music-entry";
            entryEl.textContent = entry;
            trackEl.append(entryEl);
          }

          sectionEl.append(trackEl);
        }

        this.creditsTrack.append(sectionEl);
        continue;
      }

      for (const line of section.lines) {
        if (sectionStyle === "simple") {
          const lineEl = document.createElement("p");
          lineEl.className = "gameover-credits-pure-line";
          lineEl.textContent = typeof line === "string" ? line : (line?.name || line?.role || "");
          sectionEl.append(lineEl);
          continue;
        }

        const normalizedLine = normalizeCreditLine(line);
        const lineNames = normalizedLine.names.length > 0
          ? normalizedLine.names
          : [""];

        for (const [nameIndex, name] of lineNames.entries()) {
          const lineEl = document.createElement("div");
          lineEl.className = "gameover-credits-line";
          if (nameIndex > 0) {
            lineEl.setAttribute("data-continuation", "true");
          }

          const roleEl = document.createElement("span");
          roleEl.className = "gameover-credits-role";
          roleEl.textContent = nameIndex === 0 ? normalizedLine.role : "";

          const leaderEl = document.createElement("span");
          leaderEl.className = "gameover-credits-leader";
          leaderEl.setAttribute("aria-hidden", "true");

          const nameEl = document.createElement("span");
          nameEl.className = "gameover-credits-name";
          nameEl.textContent = name;

          lineEl.append(roleEl, leaderEl, nameEl);
          sectionEl.append(lineEl);
        }
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