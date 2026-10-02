// Background music for the product video, synthesized from scratch so it's
// ours to use anywhere (no stock-music licence to track).
//
// A warm, unhurried loop — Cmaj7 · Am7 · Fmaj7 · G6 at 92 BPM — that builds
// with the video: soft pads under the hook, a piano-like arpeggio and bass
// from bar 3, light kick and hats from bar 5, then the drums drop out and it
// resolves on C for the call to action. Pads and keys go through a small
// Schroeder reverb; drums and bass stay dry.
//
//   import { renderMusic } from "./video-music.mjs";
//   await writeFile("music.wav", renderMusic(49));   // 48 kHz stereo WAV

const SR = 48000;
const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// MIDI notes. Bass in octave 2–3 so it carries on phone speakers.
const PROGRESSION = [
  { bass: 48, chord: [52, 55, 59, 60] }, // Cmaj7  (E G B C)
  { bass: 45, chord: [52, 55, 57, 60] }, // Am7    (E G A C)
  { bass: 41, chord: [53, 57, 60, 64] }, // Fmaj7  (F A C E)
  { bass: 43, chord: [55, 59, 62, 64] }, // G6     (G B D E)
];
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 3, 2]; // chord-tone order, in eighth notes

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = 2 * Math.PI;

export function renderMusic(seconds) {
  const n = Math.ceil(seconds * SR);
  const dry = [new Float32Array(n), new Float32Array(n)];
  const wet = [new Float32Array(n), new Float32Array(n)]; // sent to the reverb

  // Adds `fn(t)` (t = seconds since `start`) to a stereo buffer for `dur`.
  const add = (buf, start, dur, pan, gain, fn) => {
    const s0 = Math.max(0, Math.round(start * SR));
    const s1 = Math.min(n, Math.round((start + dur) * SR));
    const l = gain * Math.cos((pan * Math.PI) / 2);
    const r = gain * Math.sin((pan * Math.PI) / 2);
    for (let i = s0; i < s1; i++) {
      const v = fn(i / SR - start);
      buf[0][i] += v * l;
      buf[1][i] += v * r;
    }
  };

  // Deterministic noise, so every render sounds the same.
  let seed = 1234567;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const bars = Math.ceil(seconds / BAR);
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR;
    const last = b === bars - 1;
    const { bass, chord } = last ? PROGRESSION[0] : PROGRESSION[b % PROGRESSION.length];
    const outro = t0 > seconds - BAR * 2.2; // the final couple of bars: no drums
    const hold = last ? seconds - t0 : BAR;

    // Pad: three slightly detuned voices per note, slow swell, long release.
    for (const m of chord) {
      for (const detune of [-0.0035, 0, 0.0035]) {
        const f = mtof(m) * (1 + detune);
        add(wet, t0, hold + 1.6, 0.5 + detune * 90, 0.022, (t) => {
          const env = Math.min(1, t / 0.9) * (t > hold ? Math.exp(-(t - hold) / 0.45) : 1);
          return env * (Math.sin(TAU * f * t) + 0.18 * Math.sin(2 * TAU * f * t));
        });
      }
    }

    // Keys: a soft, piano-like pluck in eighth notes, an octave up.
    if (b >= 2 && !last) {
      for (let k = 0; k < 8; k++) {
        const m = chord[ARPEGGIO[k]] + 12;
        const f = mtof(m);
        const velocity = k % 2 === 0 ? 1 : 0.72;
        add(wet, t0 + (k * BEAT) / 2, 1.8, k % 2 ? 0.62 : 0.38, 0.085 * velocity, (t) => {
          const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.5);
          return env * (Math.sin(TAU * f * t) + 0.32 * Math.exp(-t / 0.22) * Math.sin(2 * TAU * f * t) + 0.08 * Math.exp(-t / 0.1) * Math.sin(3 * TAU * f * t));
        });
      }
    }
    if (last) {
      // Final chord, struck once and left to ring.
      for (const m of [...chord, chord[0] + 12, chord[2] + 12]) {
        const f = mtof(m + 12);
        add(wet, t0, hold, 0.5, 0.06, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 1.4) * (Math.sin(TAU * f * t) + 0.25 * Math.exp(-t / 0.3) * Math.sin(2 * TAU * f * t)));
      }
    }

    // Bass: half notes.
    if (b >= 2) {
      const f = mtof(bass);
      for (const beat of last ? [0] : [0, 2]) {
        add(dry, t0 + beat * BEAT, last ? hold : BEAT * 2, 0.5, 0.2, (t) => {
          const env = Math.min(1, t / 0.012) * Math.exp(-t / (last ? 1.6 : 0.9));
          return env * (Math.sin(TAU * f * t) + 0.22 * Math.sin(2 * TAU * f * t));
        });
      }
    }

    // Drums: a round kick on 1 and 3, closed hats on the off-beats, and a
    // soft clap on 2 and 4 once the groove has settled.
    if (b >= 4 && !outro) {
      for (const beat of [0, 2]) {
        add(dry, t0 + beat * BEAT, 0.5, 0.5, 0.32, (t) => {
          const phase = TAU * (46 * t + 80 * 0.035 * (1 - Math.exp(-t / 0.035)));
          return Math.exp(-t / 0.2) * Math.sin(phase);
        });
      }
      for (let k = 0; k < 4; k++) {
        let prev = 0;
        add(dry, t0 + (k + 0.5) * BEAT, 0.12, 0.62, 0.05, (t) => {
          const x = noise();
          const hp = x - prev; // crude high-pass: keeps the sizzle, drops the thump
          prev = x;
          return Math.exp(-t / 0.022) * hp;
        });
      }
      if (b >= 6) {
        for (const beat of [1, 3]) {
          add(wet, t0 + beat * BEAT, 0.3, 0.45, 0.05, (t) => Math.exp(-t / 0.05) * noise());
        }
      }
    }
  }

  // Reverb on the send: four damped combs into two allpasses, per channel
  // (the right channel's delays are offset for width).
  const scale = SR / 44100;
  for (let c = 0; c < 2; c++) {
    const input = wet[c];
    const out = new Float32Array(n);
    for (const d of [1557, 1617, 1491, 1422]) {
      const len = Math.round((d + c * 23) * scale);
      const buf = new Float32Array(len);
      let idx = 0;
      let low = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        low = y * 0.75 + low * 0.25;
        buf[idx] = input[i] + low * 0.8;
        out[i] += y * 0.25;
        idx = (idx + 1) % len;
      }
    }
    for (const d of [556, 441]) {
      const len = Math.round((d + c * 23) * scale);
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const y = -out[i] + b;
        buf[idx] = out[i] + b * 0.5;
        out[i] = y;
        idx = (idx + 1) % len;
      }
    }
    for (let i = 0; i < n; i++) dry[c][i] += input[i] + out[i] * 0.35;
  }

  // Fade in and out, then normalise to -1 dBFS.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.6, (seconds - t) / 2.5);
    for (let c = 0; c < 2; c++) {
      dry[c][i] *= Math.max(0, fade);
      peak = Math.max(peak, Math.abs(dry[c][i]));
    }
  }
  const gain = peak > 0 ? 0.89 / peak : 1;

  // 16-bit PCM WAV.
  const wav = Buffer.alloc(44 + n * 4);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + n * 4, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(SR * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, dry[0][i] * gain)) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, dry[1][i] * gain)) * 32767), 46 + i * 4);
  }
  return wav;
}
