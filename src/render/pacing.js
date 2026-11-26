// User-selected 30/60/120 FPS deadlines, independent of simulation steps and visual detail.
function makePacer() {
  return { next: 0, last: null, limit: 0, dtEma: 0 };
}

function paceFrame(pacer, now, requested = 60) {
  const limit = requested === 30 || requested === 60 || requested === 120 ? requested : 60;
  const period = 1000 / limit;
  const prev = pacer.last;
  const reset = prev == null || pacer.limit !== limit || now - prev > 250 || now < prev;
  if (reset) {
    pacer.next = now;
    pacer.dtEma = period;
  } else {
    const rawDt = now - prev;
    if (rawDt > 1 && rawDt < 100) {
      pacer.dtEma += (rawDt - pacer.dtEma) * 0.18;
    }
  }
  pacer.last = now;
  pacer.limit = limit;
  // When the display's own vsync rate is at or below the FPS limit (e.g. 60.2 Hz or jittered
  // mobile 60 Hz with 60 FPS limit, or 120 Hz ProMotion with 120 FPS limit), lock 1:1 to vsync
  // so clock drift never causes periodic half-rate frame drops.
  if (!reset && pacer.dtEma >= period * 0.92 && now - prev >= period * 0.65) {
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
