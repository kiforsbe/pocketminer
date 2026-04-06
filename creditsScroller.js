export class CreditsScroller {
  static #normalizeSectionStyle(section) {
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

  static #normalizeCreditLine(line) {
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

  static #normalizeSpacerLineCount(section) {
    const lineCount = Number(section?.lineCount);
    if (!Number.isFinite(lineCount) || lineCount <= 0) {
      return 1;
    }

    return lineCount;
  }

  static #normalizeMusicTrack(track) {
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

  constructor({
    creditsWindow,
    creditsTrack,
    credits = [],
    onComplete,
  } = {}) {
    this.creditsWindow = creditsWindow;
    this.creditsTrack = creditsTrack;
    this.credits = credits;
    this.onComplete = onComplete;
    this.pendingAnimationFrameId = null;
    this.isScrolling = false;
    this.handleAnimationEnd = () => {
      if (!this.isScrolling) {
        return;
      }

      this.isScrolling = false;
      this.onComplete?.();
    };
  }

  init() {
    this.render();
    this.creditsTrack?.addEventListener("animationend", this.handleAnimationEnd);
  }

  render() {
    if (!this.creditsTrack) {
      return;
    }

    this.creditsTrack.replaceChildren();

    for (const section of this.credits) {
      const sectionEl = document.createElement("section");
      sectionEl.className = "gameover-credits-section";
      const sectionStyle = CreditsScroller.#normalizeSectionStyle(section);
      sectionEl.setAttribute("data-style", sectionStyle);

      if (sectionStyle === "spacer") {
        sectionEl.setAttribute("aria-hidden", "true");
        sectionEl.style.setProperty("--gameover-spacer-lines", String(CreditsScroller.#normalizeSpacerLineCount(section)));
        this.creditsTrack.append(sectionEl);
        continue;
      }

      const headingEl = document.createElement("h3");
      headingEl.className = "gameover-credits-heading";
      headingEl.textContent = section.heading;
      sectionEl.append(headingEl);

      if (sectionStyle === "music") {
        for (const track of section.tracks || []) {
          const normalizedTrack = CreditsScroller.#normalizeMusicTrack(track);
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

        const normalizedLine = CreditsScroller.#normalizeCreditLine(line);
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

  stop() {
    this.isScrolling = false;
    this.cancelPendingAnimationFrame();
    this.creditsTrack?.removeAttribute("data-animate");
  }

  start({
    creditsScrollSpeedPxPerSecond,
    minCreditsScrollDurationMs,
  } = {}) {
    if (!this.creditsWindow || !this.creditsTrack) {
      this.isScrolling = false;
      this.onComplete?.();
      return;
    }

    this.stop();
    this.creditsTrack.style.removeProperty("--gameover-credits-duration");
    this.creditsTrack.style.removeProperty("--gameover-credits-start-offset");
    this.creditsTrack.style.removeProperty("--gameover-credits-end-offset");

    const beginAnimation = () => {
      this.pendingAnimationFrameId = null;
      const viewportHeight = this.creditsWindow.clientHeight;
      const trackHeight = this.creditsTrack.scrollHeight;
      if (viewportHeight <= 0 || trackHeight <= 0) {
        this.isScrolling = false;
        this.onComplete?.();
        return;
      }

      const distancePx = viewportHeight + trackHeight;
      const durationMs = Math.max(
        minCreditsScrollDurationMs,
        Math.round((distancePx / creditsScrollSpeedPxPerSecond) * 1000),
      );
      this.creditsTrack.style.setProperty("--gameover-credits-duration", `${durationMs}ms`);
      this.creditsTrack.style.setProperty("--gameover-credits-start-offset", `${viewportHeight}px`);
      this.creditsTrack.style.setProperty("--gameover-credits-end-offset", `${trackHeight}px`);
      this.isScrolling = true;
      this.creditsTrack.setAttribute("data-animate", "true");
    };

    this.pendingAnimationFrameId = window.requestAnimationFrame(() => {
      this.pendingAnimationFrameId = window.requestAnimationFrame(beginAnimation);
    });
  }
}