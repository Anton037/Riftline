// User-selected 30/60/120 FPS deadlines, independent of simulation steps and visual detail.
function makePacer() {
  // Use a conservative 30 Hz budget until raw callbacks establish a faster cadence.
  return { next: 0, last: null, limit: 0, dtEma: 0, refreshMs: 1000 / 30, refreshSum: 0, refreshSamples: 0 };
}

function paceFrame(pacer, now, requested = 60) {
  const limit = requested === 30 || requested === 120 ? requested : 60;
  const period = 1000 / limit;
  const interval = pacer.last == null ? 0 : now - pacer.last;
  // Measure raw display callbacks, including those the game's FPS cap skips.
  // Keep the fastest sustained cadence so a busy scene can't lower the resolution target.
  if (interval >= 2 && interval < 120) {
    pacer.refreshSum += interval;
    if (++pacer.refreshSamples === 8) {
      pacer.refreshMs = Math.min(pacer.refreshMs, pacer.refreshSum / pacer.refreshSamples);
      pacer.refreshSum = pacer.refreshSamples = 0;
    }
  } else {
    pacer.refreshSum = pacer.refreshSamples = 0;
  }
  const reset = pacer.last == null || pacer.limit !== limit || interval > 250 || interval < 0;
  if (reset) {
    pacer.next = now;
    pacer.dtEma = period;
  } else if (interval > 1 && interval < 100) {
    pacer.dtEma += (interval - pacer.dtEma) * 0.18;
  }
  pacer.last = now;
  pacer.limit = limit;
  // When the display's own vsync rate is at or below the FPS limit (e.g. 60.2 Hz or jittered
  // mobile 60 Hz with 60 FPS limit, or 120 Hz ProMotion with 120 FPS limit), lock 1:1 to vsync
  // so clock drift never causes periodic half-rate frame drops.
  if (!reset && pacer.dtEma >= period * 0.92 && interval >= period * 0.65) {
    pacer.next = now + period;
    return true;
  }
  // Allow modest early-arrival slack for mobile rAF timestamp jitter without losing cap accuracy.
  const slack = Math.min(1.6, period * 0.11);
  if (now + slack < pacer.next) return false;
  const missed = Math.floor(Math.max(0, now - pacer.next) / period);
  pacer.next += (missed + 1) * period;
  return true;
}

export { makePacer, paceFrame };
