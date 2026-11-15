// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. The context is created lazily on the first
// user gesture; in screenshot mode it is never created at all.
export function createAudio(options = {}) {
  if (options.silent) {
    const noop = () => {};
    return {
      unlock: noop, shot: noop, enemyShot: noop, dryFire: noop, reload: noop,
      hit: noop, hurt: noop, explosion: noop, plantBeep: noop, roundWin: noop,
      roundLose: noop, buy: noop, denied: noop, click: noop,
    };
  }
  let context = null;
  let master = null;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return null;
    }
    return context;
  }

  function noiseBuffer(seconds) {
    const ctx = ensure();
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.12, frequency = 1800, gain = 0.5, type = 'lowpass', sweepTo = null }) {
    const ctx = ensure();
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, now);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), now + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  function tone({ frequency = 440, duration = 0.1, gain = 0.25, type = 'sine', slideTo = null, delay = 0 }) {
    const ctx = ensure();
    if (!ctx || !master) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  const WEAPON_TONE = { pistol: 1500, smg: 1900, rifle: 1200, sniper: 900 };

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      burst({ duration: 0.1, frequency: WEAPON_TONE[kind] ?? 1400, gain: 0.55, sweepTo: 220 });
      tone({ frequency: 150, duration: 0.08, gain: 0.3, type: 'square', slideTo: 70 });
    },
    enemyShot(distance) {
      const gain = Math.max(0.08, 0.4 - distance * 0.012);
      burst({ duration: 0.09, frequency: 1100, gain, sweepTo: 200 });
    },
    dryFire() {
      tone({ frequency: 2200, duration: 0.03, gain: 0.12, type: 'square' });
    },
    reload() {
      tone({ frequency: 900, duration: 0.05, gain: 0.15, type: 'square' });
      tone({ frequency: 600, duration: 0.05, gain: 0.15, type: 'square', delay: 0.18 });
      tone({ frequency: 1200, duration: 0.05, gain: 0.15, type: 'square', delay: 0.55 });
    },
    hit(headshot) {
      tone({ frequency: headshot ? 1900 : 1300, duration: 0.06, gain: 0.22, type: 'sine' });
    },
    hurt() {
      tone({ frequency: 180, duration: 0.16, gain: 0.3, type: 'sawtooth', slideTo: 90 });
    },
    explosion() {
      burst({ duration: 0.7, frequency: 900, gain: 0.9, sweepTo: 60 });
      tone({ frequency: 90, duration: 0.6, gain: 0.5, type: 'sine', slideTo: 35 });
    },
    plantBeep(final) {
      tone({ frequency: final ? 1500 : 950, duration: final ? 0.3 : 0.09, gain: 0.2, type: 'sine' });
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ frequency: f, duration: 0.22, gain: 0.2, delay: i * 0.13 }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ frequency: f, duration: 0.26, gain: 0.2, delay: i * 0.15 }));
    },
    buy() {
      tone({ frequency: 880, duration: 0.07, gain: 0.18, type: 'sine' });
      tone({ frequency: 1320, duration: 0.09, gain: 0.15, type: 'sine', delay: 0.07 });
    },
    denied() {
      tone({ frequency: 220, duration: 0.12, gain: 0.2, type: 'square' });
    },
    click() {
      tone({ frequency: 1000, duration: 0.04, gain: 0.12, type: 'sine' });
    },
  };
}
