// User-selected 30/60/120 FPS deadlines, independent of simulation steps and visual detail.
function makePacer() {
  return { next: 0, last: null, limit: 0 };
}

function paceFrame(pacer, now, requested = 60) {
  const limit = [30, 60, 120].includes(requested) ? requested : 60;
  const period = 1000 / limit;
  if (pacer.last == null || pacer.limit !== limit || now - pacer.last > 250 || now < pacer.last) pacer.next = now;
  pacer.last = now;
  pacer.limit = limit;
  if (now + 0.25 < pacer.next) return false;
  const missed = Math.floor(Math.max(0, now - pacer.next) / period);
  pacer.next += (missed + 1) * period;
  return true;
}

export { makePacer, paceFrame };
