// Tiny Web Audio synth so the game needs no audio files.
let ctx;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ type = 'sine', from, to, duration, volume = 0.2 }) {
  const ac = audio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t = ac.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function noise(duration, volume, cutoff) {
  const ac = audio();
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  src.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
}

export const sfx = {
  shoot: () => tone({ type: 'triangle', from: 420, to: 90, duration: 0.18, volume: 0.25 }),
  pop: () => {
    noise(0.15, 0.6, 3500);
    tone({ type: 'square', from: 900, to: 200, duration: 0.08, volume: 0.08 });
  },
  thud: () => noise(0.08, 0.35, 600),
  correct: () => {
    tone({ type: 'sine', from: 660, to: 680, duration: 0.12, volume: 0.12 });
    setTimeout(() => tone({ type: 'sine', from: 990, to: 1010, duration: 0.18, volume: 0.12 }), 90);
  },
  wrong: () => tone({ type: 'sawtooth', from: 220, to: 110, duration: 0.3, volume: 0.1 }),
  tick: () => tone({ type: 'sine', from: 880, to: 880, duration: 0.05, volume: 0.08 }),
};
