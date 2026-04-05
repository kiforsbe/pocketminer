const SUMMARY_MUSIC_KEY = "__summary__";
const SUMMARY_TRACK_NAME = "Grand_Payout";
const INTRO_MUSIC_KEY = "__intro__";
const INTRO_TRACK_NAMES = Object.freeze(["Pocket Miner Theme", "Pocket Miner Theme 2"]);
const PAUSE_MUSIC_KEY = "__pause__";
const PAUSE_TRACK_NAMES = Object.freeze(["Pocket Miner Outro", "Pocket Miner Outro 2"]);
const GAMEOVER_GOOD_MUSIC_KEY = "__gameover_good__";
const GAMEOVER_BAD_MUSIC_KEY = "__gameover_bad__";
const GAMEOVER_GOOD_TRACK_NAME = "Pocket Miner Victory Fanfare";
const GAMEOVER_BAD_TRACK_NAMES = Object.freeze(["Pocket Miner Outro", "Pocket Miner Outro 2"]);
const MAX_CROSSFADE_TOTAL_MS = 5000;
const INTRO_LOOP_TO_OUTRO_CROSSFADE_MS = 1000;
const SUMMARY_TRANSITION_MAX_DELAY_MS = 1500;
export const SUMMARY_FADE_IN_MS = 1500;

function createMusicManifestEntries(trackName) {
  return [
    { id: `music-${trackName}-intro`, src: `./assets/loops/${trackName}-intro.mp3` },
    { id: `music-${trackName}-loop`, src: `./assets/loops/${trackName}-loop.mp3` },
    { id: `music-${trackName}-outro`, src: `./assets/loops/${trackName}-outro.mp3` },
  ];
}

function createMusicSet(trackName) {
  return Object.freeze({
    intro: `music-${trackName}-intro`,
    loop: `music-${trackName}-loop`,
    outro: `music-${trackName}-outro`,
  });
}

export function createMusicManifest(worldStrata) {
  const stratumTrackNames = [...new Set(worldStrata.map((stratum) => stratum.bgmTrack).filter(Boolean))];
  const musicTrackNames = [
    ...stratumTrackNames,
    SUMMARY_TRACK_NAME,
    ...INTRO_TRACK_NAMES,
    ...PAUSE_TRACK_NAMES,
    GAMEOVER_GOOD_TRACK_NAME,
    ...GAMEOVER_BAD_TRACK_NAMES,
  ];
  return musicTrackNames.flatMap(createMusicManifestEntries);
}

export function createMusicSystem({ audio, gameState, getWorld, getPlayer, worldStrata, isMusicActivePhase }) {
  const stratumTrackNames = [...new Set(worldStrata.map((stratum) => stratum.bgmTrack).filter(Boolean))];
  const musicTrackNames = [
    ...stratumTrackNames,
    SUMMARY_TRACK_NAME,
    ...INTRO_TRACK_NAMES,
    ...PAUSE_TRACK_NAMES,
    GAMEOVER_GOOD_TRACK_NAME,
    ...GAMEOVER_BAD_TRACK_NAMES,
  ];
  let introGameplayTimeoutId = null;
  let queuedMusicStartTimeoutId = null;
  let screenMusicStopTimeoutId = null;
  const stratumByName = Object.freeze(
    Object.fromEntries(worldStrata.map((stratum) => [stratum.name, stratum])),
  );
  const stratumMusicSets = Object.freeze(
    Object.fromEntries(musicTrackNames.map((trackName) => [trackName, createMusicSet(trackName)])),
  );

  function pickIntroTrackName() {
    const index = Math.floor(Math.random() * INTRO_TRACK_NAMES.length);
    return INTRO_TRACK_NAMES[index] ?? INTRO_TRACK_NAMES[0];
  }

  function pickPauseTrackName() {
    const index = Math.floor(Math.random() * PAUSE_TRACK_NAMES.length);
    return PAUSE_TRACK_NAMES[index] ?? PAUSE_TRACK_NAMES[0];
  }

  function pickGameoverBadTrackName() {
    const index = Math.floor(Math.random() * GAMEOVER_BAD_TRACK_NAMES.length);
    return GAMEOVER_BAD_TRACK_NAMES[index] ?? GAMEOVER_BAD_TRACK_NAMES[0];
  }

  function clearIntroGameplayTimeout() {
    if (introGameplayTimeoutId === null) {
      return;
    }

    window.clearTimeout(introGameplayTimeoutId);
    introGameplayTimeoutId = null;
  }

  function clearQueuedMusicStartTimeout() {
    if (queuedMusicStartTimeoutId === null) {
      return;
    }

    window.clearTimeout(queuedMusicStartTimeoutId);
    queuedMusicStartTimeoutId = null;
  }

  function clearScreenMusicStopTimeout() {
    if (screenMusicStopTimeoutId === null) {
      return;
    }

    window.clearTimeout(screenMusicStopTimeoutId);
    screenMusicStopTimeoutId = null;
  }

  function isMusicKeyActive(musicKey) {
    if (musicKey === INTRO_MUSIC_KEY) {
      return gameState.phase === "intro" && !gameState.introExiting;
    }

    if (musicKey === PAUSE_MUSIC_KEY) {
      return gameState.phase === "paused" && !gameState.pauseExiting;
    }

    if (musicKey === GAMEOVER_GOOD_MUSIC_KEY || musicKey === GAMEOVER_BAD_MUSIC_KEY) {
      return gameState.phase === "gameover";
    }

    return isMusicActivePhase() || gameState.introExiting || gameState.pauseExiting;
  }

  function getMusicTrackName(musicKey) {
    if (musicKey === INTRO_MUSIC_KEY) {
      return gameState.music.currentTrackName ?? INTRO_TRACK_NAMES[0];
    }

    if (musicKey === PAUSE_MUSIC_KEY) {
      return gameState.music.currentTrackName ?? PAUSE_TRACK_NAMES[0];
    }

    if (musicKey === GAMEOVER_GOOD_MUSIC_KEY) {
      return GAMEOVER_GOOD_TRACK_NAME;
    }

    if (musicKey === GAMEOVER_BAD_MUSIC_KEY) {
      return gameState.music.currentTrackName ?? GAMEOVER_BAD_TRACK_NAMES[0];
    }

    if (musicKey === SUMMARY_MUSIC_KEY) {
      return SUMMARY_TRACK_NAME;
    }

    return stratumByName[musicKey]?.bgmTrack ?? stratumTrackNames[0];
  }

  function getMusicSetForKey(musicKey) {
    const trackName = getMusicTrackName(musicKey);
    return stratumMusicSets[trackName] ?? stratumMusicSets[SUMMARY_TRACK_NAME];
  }

  function startMusicTrack(musicKey, {
    immediate = false,
    trackName,
    fadeInMs = 0,
    crossfadeOutMs = 0,
  } = {}) {
    const token = ++gameState.music.transitionToken;
    clearQueuedMusicStartTimeout();
    gameState.music.currentStratumName = musicKey;
    gameState.music.currentTrackName = trackName ?? getMusicTrackName(musicKey);
    gameState.music.pendingStratumName = null;
    const musicSet = getMusicSetForKey(musicKey);

    const startLoop = () => {
      if (token !== gameState.music.transitionToken || !isMusicKeyActive(musicKey)) {
        return;
      }
      audio.playMusicSegment(musicSet.loop, {
        layer: "main",
        loop: true,
      });
    };

    audio.playMusicSegment(musicSet.intro, {
      layer: "main",
      fadeInMs,
      crossfadeOutMs,
      onended: startLoop,
    });
  }

  function transitionMusicTrack(nextMusicKey, {
    crossfadeMs: requestedCrossfadeMs = MAX_CROSSFADE_TOTAL_MS,
    maxAudibleDelayMs = Number.POSITIVE_INFINITY,
    trackName,
  } = {}) {
    const currentStratumName = gameState.music.currentStratumName;
    if (!currentStratumName) {
      startMusicTrack(nextMusicKey, { trackName });
      return {
        fadeDelayMs: 0,
        fadeDurationMs: 0,
      };
    }

    const token = ++gameState.music.transitionToken;
    gameState.music.pendingStratumName = nextMusicKey;
    const currentMusicSet = getMusicSetForKey(currentStratumName);
    const outroDurationMs = Math.round(audio.getBufferDuration(currentMusicSet.outro) * 1000);
    const crossfadeMs = Math.min(
      requestedCrossfadeMs,
      MAX_CROSSFADE_TOTAL_MS,
      outroDurationMs || requestedCrossfadeMs,
    );
    const desiredDelayMs = Math.max(0, outroDurationMs - crossfadeMs);
    const nextTrackDelayMs = Math.min(
      desiredDelayMs,
      Math.max(0, maxAudibleDelayMs),
      Math.max(0, MAX_CROSSFADE_TOTAL_MS - crossfadeMs),
    );

    clearQueuedMusicStartTimeout();
    audio.playMusicSegment(currentMusicSet.outro, {
      layer: "main",
    });

    const queueNextTrack = () => {
      queuedMusicStartTimeoutId = null;
      if (token !== gameState.music.transitionToken || !isMusicKeyActive(nextMusicKey)) {
        return;
      }

      startMusicTrack(nextMusicKey, {
        trackName,
        fadeInMs: crossfadeMs,
        crossfadeOutMs: crossfadeMs,
      });
    };

    if (nextTrackDelayMs === 0) {
      queueNextTrack();
      return {
        fadeDelayMs: 0,
        fadeDurationMs: crossfadeMs,
      };
    }

    queuedMusicStartTimeoutId = window.setTimeout(queueNextTrack, nextTrackDelayMs);
    return {
      fadeDelayMs: nextTrackDelayMs,
      fadeDurationMs: crossfadeMs,
    };
  }

  function transitionScreenMusicToGameplay(screenMusicKey, {
    maxTransitionMs = MAX_CROSSFADE_TOTAL_MS,
  } = {}) {
    if (!gameState.audioReady || gameState.music.currentStratumName !== screenMusicKey) {
      return 0;
    }

    const world = getWorld();
    const player = getPlayer();
    const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
    const screenMusicSet = getMusicSetForKey(screenMusicKey);
    const outroDurationMs = Math.round(audio.getBufferDuration(screenMusicSet.outro) * 1000);
    const normalizedMaxTransitionMs = Math.min(MAX_CROSSFADE_TOTAL_MS, maxTransitionMs);
    const durationMs = Math.min(normalizedMaxTransitionMs, outroDurationMs || normalizedMaxTransitionMs);
    const crossfadeMs = Math.min(durationMs, normalizedMaxTransitionMs);
    const startDelayMs = Math.max(0, durationMs - crossfadeMs);
    const overlayFadeOutMs = Math.min(INTRO_LOOP_TO_OUTRO_CROSSFADE_MS, durationMs);
    const token = ++gameState.music.transitionToken;
    gameState.music.currentStratumName = stratumName;
    gameState.music.currentTrackName = getMusicTrackName(stratumName);
    gameState.music.pendingStratumName = null;
    clearIntroGameplayTimeout();
    clearScreenMusicStopTimeout();
    audio.fadeOutMusicLayer("main", INTRO_LOOP_TO_OUTRO_CROSSFADE_MS);

    audio.playMusicSegment(screenMusicSet.outro, {
      layer: "overlay",
      fadeInMs: Math.min(INTRO_LOOP_TO_OUTRO_CROSSFADE_MS, outroDurationMs || INTRO_LOOP_TO_OUTRO_CROSSFADE_MS),
      onended: () => {
        if (token !== gameState.music.transitionToken) {
          return;
        }

        audio.stopMusicLayer("overlay");
      },
    });

    if (durationMs === 0) {
      audio.stopMusicLayer("overlay");
    } else {
      screenMusicStopTimeoutId = window.setTimeout(() => {
        screenMusicStopTimeoutId = null;
        if (token !== gameState.music.transitionToken) {
          return;
        }

        audio.fadeOutMusicLayer("overlay", overlayFadeOutMs);
      }, Math.max(0, durationMs - overlayFadeOutMs));
    }

    const nextMusicSet = getMusicSetForKey(stratumName);

    const startGameplayIntro = () => {
      if (token !== gameState.music.transitionToken) {
        return;
      }

      introGameplayTimeoutId = null;
      audio.playMusicSegment(nextMusicSet.intro, {
        layer: "main",
        fadeInMs: crossfadeMs,
        onended: () => {
          if (token !== gameState.music.transitionToken || !isMusicKeyActive(stratumName)) {
            return;
          }

          audio.playMusicSegment(nextMusicSet.loop, { layer: "main", loop: true });
        },
      });
    };

    if (startDelayMs === 0) {
      startGameplayIntro();
    } else {
      introGameplayTimeoutId = window.setTimeout(startGameplayIntro, startDelayMs);
    }

    return durationMs;
  }

  return {
    startIntro({ immediate = true } = {}) {
      if (!gameState.audioReady || gameState.phase !== "intro") {
        return;
      }

      startMusicTrack(INTRO_MUSIC_KEY, {
        immediate,
        trackName: pickIntroTrackName(),
      });
    },

    transitionFromIntroToGameplay() {
      return transitionScreenMusicToGameplay(INTRO_MUSIC_KEY);
    },

    startPause({ immediate = false } = {}) {
      if (!gameState.audioReady || gameState.music.currentStratumName === PAUSE_MUSIC_KEY) {
        return {
          fadeDelayMs: 0,
          fadeDurationMs: 0,
        };
      }

      const trackName = pickPauseTrackName();
      if (gameState.music.currentStratumName) {
        return transitionMusicTrack(PAUSE_MUSIC_KEY, {
          crossfadeMs: MAX_CROSSFADE_TOTAL_MS,
          maxAudibleDelayMs: MAX_CROSSFADE_TOTAL_MS,
          trackName,
        });
      }

      startMusicTrack(PAUSE_MUSIC_KEY, {
        immediate,
        trackName,
        fadeInMs: immediate ? 0 : MAX_CROSSFADE_TOTAL_MS,
      });
      return {
        fadeDelayMs: 0,
        fadeDurationMs: immediate ? 0 : MAX_CROSSFADE_TOTAL_MS,
      };
    },

    transitionFromPauseToGameplay() {
      return transitionScreenMusicToGameplay(PAUSE_MUSIC_KEY, {
        maxTransitionMs: MAX_CROSSFADE_TOTAL_MS,
      });
    },

    sync({ immediate = false } = {}) {
      if (!gameState.audioReady || !isMusicActivePhase()) {
        return;
      }

      const world = getWorld();
      const player = getPlayer();
      const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
      if (!gameState.music.currentStratumName) {
        startMusicTrack(stratumName, { immediate });
        return;
      }

      if (stratumName === gameState.music.currentStratumName || stratumName === gameState.music.pendingStratumName) {
        return;
      }

      transitionMusicTrack(stratumName);
    },

    startSummary({ immediate = true } = {}) {
      if (!gameState.audioReady || gameState.music.currentStratumName === SUMMARY_MUSIC_KEY) {
        return {
          fadeDelayMs: 0,
          fadeDurationMs: 0,
        };
      }

      if (gameState.music.currentStratumName) {
        return transitionMusicTrack(SUMMARY_MUSIC_KEY, {
          crossfadeMs: SUMMARY_FADE_IN_MS,
          maxAudibleDelayMs: SUMMARY_TRANSITION_MAX_DELAY_MS,
        });
      }

      startMusicTrack(SUMMARY_MUSIC_KEY, {
        immediate,
        fadeInMs: SUMMARY_FADE_IN_MS,
      });
      return {
        fadeDelayMs: 0,
        fadeDurationMs: SUMMARY_FADE_IN_MS,
      };
    },

    startGameover({ endingType, immediate = false } = {}) {
      if (!gameState.audioReady) {
        return {
          fadeDelayMs: 0,
          fadeDurationMs: 0,
        };
      }

      const musicKey = endingType === "good" ? GAMEOVER_GOOD_MUSIC_KEY : GAMEOVER_BAD_MUSIC_KEY;
      const trackName = endingType === "good" ? GAMEOVER_GOOD_TRACK_NAME : pickGameoverBadTrackName();

      if (gameState.music.currentStratumName === musicKey && gameState.music.currentTrackName === trackName) {
        return {
          fadeDelayMs: 0,
          fadeDurationMs: 0,
        };
      }

      if (gameState.music.currentStratumName) {
        return transitionMusicTrack(musicKey, {
          crossfadeMs: MAX_CROSSFADE_TOTAL_MS,
          maxAudibleDelayMs: MAX_CROSSFADE_TOTAL_MS,
          trackName,
        });
      }

      startMusicTrack(musicKey, {
        immediate,
        trackName,
        fadeInMs: immediate ? 0 : MAX_CROSSFADE_TOTAL_MS,
      });
      return {
        fadeDelayMs: 0,
        fadeDurationMs: immediate ? 0 : MAX_CROSSFADE_TOTAL_MS,
      };
    },

    stop() {
      clearIntroGameplayTimeout();
      clearQueuedMusicStartTimeout();
      clearScreenMusicStopTimeout();
      gameState.music.currentStratumName = null;
      gameState.music.currentTrackName = null;
      gameState.music.pendingStratumName = null;
      gameState.music.transitionToken += 1;
      audio.stopMusic();
    },

    resetForIntro({ immediate = true } = {}) {
      this.stop();
      if (gameState.audioReady && gameState.phase === "intro") {
        this.startIntro({ immediate });
      }
    },

    resetForNextRound({ immediate = true } = {}) {
      clearIntroGameplayTimeout();
      clearQueuedMusicStartTimeout();
      clearScreenMusicStopTimeout();

      if (!gameState.audioReady) {
        gameState.music.currentStratumName = null;
        gameState.music.currentTrackName = null;
        gameState.music.pendingStratumName = null;
        gameState.music.transitionToken += 1;
        return;
      }

      if (gameState.music.currentStratumName === SUMMARY_MUSIC_KEY || gameState.music.currentStratumName === PAUSE_MUSIC_KEY) {
        const world = getWorld();
        const player = getPlayer();
        const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
        transitionMusicTrack(stratumName, {
          crossfadeMs: MAX_CROSSFADE_TOTAL_MS,
          maxAudibleDelayMs: MAX_CROSSFADE_TOTAL_MS,
        });
        return;
      }

      gameState.music.currentStratumName = null;
      gameState.music.currentTrackName = null;
      gameState.music.pendingStratumName = null;
      gameState.music.transitionToken += 1;

      audio.stopMusic();
      this.sync({ immediate });
    },
  };
}