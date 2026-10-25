// Moving on to the next word only once the word being said has finished, so it isn't cut off or talked over.

// Longest extra wait for speech past a step's own delay: a slow lookup or a stuck voice never holds the game long.
const MAX_SPEECH_WAIT_MS = 5000;
const POLL_MS = 100;

// Calls `next` after at least `ms`, and once `speech` (a promise from voice.say) has settled. Uses the
// scene's own clock, so nothing fires after the scene has shut down or restarted.
export function afterSpeech(scene, speech, ms, next) {
  let spoken = false;
  Promise.resolve(speech).finally(() => (spoken = true));
  let waited = 0;
  const check = () => {
    if (spoken || waited >= MAX_SPEECH_WAIT_MS) next();
    else {
      waited += POLL_MS;
      scene.time.delayedCall(POLL_MS, check);
    }
  };
  scene.time.delayedCall(ms, check);
}
