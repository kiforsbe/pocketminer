const SUMMARY_MUSIC_KEY = "__summary__";
const SUMMARY_TRACK_NAME = "Grand_Payout";
const INTRO_MUSIC_KEY = "__intro__";
const INTRO_TRACK_NAMES = Object.freeze(["Pocket Miner Theme", "Pocket Miner Theme 2"]);
export const INTRO_GAMEPLAY_CROSSFADE_MS = 10000;
const INTRO_LOOP_TO_OUTRO_CROSSFADE_MS = 1000;

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
  const musicTrackNames = [...stratumTrackNames, SUMMARY_TRACK_NAME, ...INTRO_TRACK_NAMES];
  return musicTrackNames.flatMap(createMusicManifestEntries);
}

export function createMusicSystem({ audio, gameState, getWorld, getPlayer, worldStrata, isMusicActivePhase }) {
  const stratumTrackNames = [...new Set(worldStrata.map((stratum) => stratum.bgmTrack).filter(Boolean))];
  const musicTrackNames = [...stratumTrackNames, SUMMARY_TRACK_NAME, ...INTRO_TRACK_NAMES];
  let introGameplayTimeoutId = null;
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

  function clearIntroGameplayTimeout() {
    if (introGameplayTimeoutId === null) {
      return;
    }

    window.clearTimeout(introGameplayTimeoutId);
    introGameplayTimeoutId = null;
  }

  function isMusicKeyActive(musicKey) {
    if (musicKey === INTRO_MUSIC_KEY) {
      return gameState.phase === "intro" && !gameState.introExiting;
    }

    return isMusicActivePhase() || gameState.introExiting;
  }

  function getMusicTrackName(musicKey) {
    if (musicKey === INTRO_MUSIC_KEY) {
      return gameState.music.currentTrackName ?? INTRO_TRACK_NAMES[0];
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

  function startMusicTrack(musicKey, { immediate = false, trackName } = {}) {
    const token = ++gameState.music.transitionToken;
    gameState.music.currentStratumName = musicKey;
    gameState.music.currentTrackName = trackName ?? getMusicTrackName(musicKey);
    gameState.music.pendingStratumName = null;
    const musicSet = getMusicSetForKey(musicKey);

    const startLoop = () => {
      if (token !== gameState.music.transitionToken || !isMusicKeyActive(musicKey)) {
        return;
      }
      audio.playMusicSegment(musicSet.loop, { loop: true });
    };

    if (immediate) {
      audio.playMusicSegment(musicSet.intro, { onended: startLoop });
      return;
    }

    audio.playMusicSegment(musicSet.intro, { onended: startLoop });
  }

  function transitionMusicTrack(nextMusicKey) {
    const currentStratumName = gameState.music.currentStratumName;
    if (!currentStratumName) {
      startMusicTrack(nextMusicKey);
      return;
    }

    const token = ++gameState.music.transitionToken;
    gameState.music.pendingStratumName = nextMusicKey;
    const currentMusicSet = getMusicSetForKey(currentStratumName);

    audio.playMusicSegment(currentMusicSet.outro, {
      onended: () => {
        if (token !== gameState.music.transitionToken || !isMusicKeyActive(currentStratumName)) {
          return;
        }
        startMusicTrack(nextMusicKey);
      },
    });
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
      if (!gameState.audioReady || gameState.music.currentStratumName !== INTRO_MUSIC_KEY) {
        return 0;
      }

      const world = getWorld();
      const player = getPlayer();
      const stratumName = world.getStratumAtPixel(player.getCenter().y).name;
      const introMusicSet = getMusicSetForKey(INTRO_MUSIC_KEY);
      const durationMs = Math.round(audio.getBufferDuration(introMusicSet.outro) * 1000);
      const crossfadeMs = Math.min(INTRO_GAMEPLAY_CROSSFADE_MS, durationMs || INTRO_GAMEPLAY_CROSSFADE_MS);
      const startDelayMs = Math.max(0, durationMs - crossfadeMs);
      const token = ++gameState.music.transitionToken;
      gameState.music.currentStratumName = stratumName;
      gameState.music.currentTrackName = getMusicTrackName(stratumName);
      gameState.music.pendingStratumName = null;
      clearIntroGameplayTimeout();
      audio.fadeOutMusicLayer("main", INTRO_LOOP_TO_OUTRO_CROSSFADE_MS);

      audio.playMusicSegment(introMusicSet.outro, {
        layer: "overlay",
        fadeInMs: Math.min(INTRO_LOOP_TO_OUTRO_CROSSFADE_MS, durationMs || INTRO_LOOP_TO_OUTRO_CROSSFADE_MS),
        onended: () => {
          if (token !== gameState.music.transitionToken) {
            return;
          }

          audio.stopMusicLayer("overlay");
        },
      });

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
        return;
      }

      startMusicTrack(SUMMARY_MUSIC_KEY, { immediate });
    },

    resetForNextRound({ immediate = true } = {}) {
      clearIntroGameplayTimeout();
      gameState.music.currentStratumName = null;
      gameState.music.currentTrackName = null;
      gameState.music.pendingStratumName = null;
      gameState.music.transitionToken += 1;

      if (!gameState.audioReady) {
        return;
      }

      audio.stopMusic();
      this.sync({ immediate });
    },
  };
}