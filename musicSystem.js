const SUMMARY_MUSIC_KEY = "__summary__";
const SUMMARY_TRACK_NAME = "Grand_Payout";

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
  const musicTrackNames = [...stratumTrackNames, SUMMARY_TRACK_NAME];
  return musicTrackNames.flatMap(createMusicManifestEntries);
}

export function createMusicSystem({ audio, gameState, getWorld, getPlayer, worldStrata, isMusicActivePhase }) {
  const stratumTrackNames = [...new Set(worldStrata.map((stratum) => stratum.bgmTrack).filter(Boolean))];
  const musicTrackNames = [...stratumTrackNames, SUMMARY_TRACK_NAME];
  const stratumByName = Object.freeze(
    Object.fromEntries(worldStrata.map((stratum) => [stratum.name, stratum])),
  );
  const stratumMusicSets = Object.freeze(
    Object.fromEntries(musicTrackNames.map((trackName) => [trackName, createMusicSet(trackName)])),
  );

  function getMusicTrackName(musicKey) {
    if (musicKey === SUMMARY_MUSIC_KEY) {
      return SUMMARY_TRACK_NAME;
    }

    return stratumByName[musicKey]?.bgmTrack ?? stratumTrackNames[0];
  }

  function getMusicSetForKey(musicKey) {
    const trackName = getMusicTrackName(musicKey);
    return stratumMusicSets[trackName] ?? stratumMusicSets[SUMMARY_TRACK_NAME];
  }

  function startMusicTrack(musicKey, { immediate = false } = {}) {
    const token = ++gameState.music.transitionToken;
    gameState.music.currentStratumName = musicKey;
    gameState.music.pendingStratumName = null;
    const musicSet = getMusicSetForKey(musicKey);

    const startLoop = () => {
      if (token !== gameState.music.transitionToken || !isMusicActivePhase()) {
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
        if (token !== gameState.music.transitionToken || !isMusicActivePhase()) {
          return;
        }
        startMusicTrack(nextMusicKey);
      },
    });
  }

  return {
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
      gameState.music.currentStratumName = null;
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