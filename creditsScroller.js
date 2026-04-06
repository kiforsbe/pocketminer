export class CreditsScroller {
  static #FAST_SCROLL_MULTIPLIER = 4;

  static #SPEED_EASING_PER_SECOND = 10;

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
    this.currentScrollMultiplier = 1;
    this.targetScrollMultiplier = 1;
    this.elapsedScrollMs = 0;
    this.totalScrollDurationMs = 0;
    this.scrollDistancePx = 0;
    this.scrollStartOffsetPx = 0;
    this.lastAnimationTimestampMs = null;
    this.activePointerId = null;
    this.creditsWindow?.setAttribute("data-screen-ignore-advance", "true");
    this.handlePointerDown = (event) => {
      if (event.button !== 0 || this.activePointerId !== null) {
        return;
      }

      this.activePointerId = event.pointerId;
      this.targetScrollMultiplier = CreditsScroller.#FAST_SCROLL_MULTIPLIER;
      this.creditsWindow?.setPointerCapture?.(event.pointerId);
    };
    this.handlePointerUp = (event) => {
      if (event.pointerId !== this.activePointerId) {
        return;
      }

      this.activePointerId = null;
      this.targetScrollMultiplier = 1;
      this.creditsWindow?.releasePointerCapture?.(event.pointerId);
    };
    this.handlePointerCancel = (event) => {
      if (event.pointerId !== this.activePointerId) {
        return;
      }

      this.activePointerId = null;
      this.targetScrollMultiplier = 1;
    };
    this.stepScroll = (timestampMs) => {
      if (!this.isScrolling) {
        this.pendingAnimationFrameId = null;
        return;
      }

      if (this.lastAnimationTimestampMs === null) {
        this.lastAnimationTimestampMs = timestampMs;
      }

      const deltaMs = Math.max(0, timestampMs - this.lastAnimationTimestampMs);
      this.lastAnimationTimestampMs = timestampMs;

      const easingFactor = 1 - Math.exp((-deltaMs / 1000) * CreditsScroller.#SPEED_EASING_PER_SECOND);
      this.currentScrollMultiplier += (this.targetScrollMultiplier - this.currentScrollMultiplier) * easingFactor;
      this.elapsedScrollMs += deltaMs * this.currentScrollMultiplier;

      const progress = this.totalScrollDurationMs > 0
        ? Math.min(1, this.elapsedScrollMs / this.totalScrollDurationMs)
        : 1;
      const currentOffsetPx = this.scrollStartOffsetPx - (this.scrollDistancePx * progress);
      if (this.creditsTrack) {
        this.creditsTrack.style.transform = `translateY(${currentOffsetPx}px)`;
      }

      if (progress >= 1) {
        this.isScrolling = false;
        this.pendingAnimationFrameId = null;
        this.onComplete?.();
        return;
      }

      this.pendingAnimationFrameId = window.requestAnimationFrame(this.stepScroll);
    };
  }

  init() {
    this.render();
    this.creditsWindow?.addEventListener("pointerdown", this.handlePointerDown);
    this.creditsWindow?.addEventListener("pointerup", this.handlePointerUp);
    this.creditsWindow?.addEventListener("pointercancel", this.handlePointerCancel);
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
    this.activePointerId = null;
    this.targetScrollMultiplier = 1;
    this.currentScrollMultiplier = 1;
    this.elapsedScrollMs = 0;
    this.totalScrollDurationMs = 0;
    this.scrollDistancePx = 0;
    this.scrollStartOffsetPx = 0;
    this.lastAnimationTimestampMs = null;
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
    const viewportHeight = this.creditsWindow.clientHeight;
    const trackHeight = this.creditsTrack.scrollHeight;
    if (viewportHeight <= 0 || trackHeight <= 0) {
      this.isScrolling = false;
      this.onComplete?.();
      return;
    }

    this.scrollStartOffsetPx = viewportHeight;
    this.scrollDistancePx = viewportHeight + trackHeight;
    this.totalScrollDurationMs = Math.max(
      minCreditsScrollDurationMs,
      Math.round((this.scrollDistancePx / creditsScrollSpeedPxPerSecond) * 1000),
    );
    this.currentScrollMultiplier = 1;
    this.targetScrollMultiplier = 1;
    this.elapsedScrollMs = 0;
    this.lastAnimationTimestampMs = null;
    if (this.creditsTrack) {
      this.creditsTrack.style.transform = `translateY(${this.scrollStartOffsetPx}px)`;
    }
    this.isScrolling = true;
    this.pendingAnimationFrameId = window.requestAnimationFrame(this.stepScroll);
  }
}