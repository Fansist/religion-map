// The Spread of Religion, Every Year - the interactive map. The film's own renderer (bundle.js) draws every picture;
// this page only chooses the moment, the camera and the size.
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const sharp = params.get("q") === "sharp";
  const names = params.get("names") !== "0";
  // read by bundle.js when it loads (it runs after this script): the picture's size, and the names on or off
  window.__query = "w=" + (sharp ? 2560 : 1600) + "&h=" + (sharp ? 1440 : 900) + (names ? "" : "&nolab=1");

  const R = window.RL, FPS = R.fps, Y = R.year;
  const F0 = Math.round(R.clockStart * FPS), T0 = F0 / FPS, T1 = R.clockEnd;
  const YMIN = -1499, YMAX = 2025;                // astronomical years: -1499 is 1500 BC
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // the film's clock: the film time at which it shows a year, and the year it shows at a film time
  function tOfYear(a) {
    if (a <= Y[F0]) return T0;
    let lo = F0, hi = Y.length - 1;
    if (Y[hi] <= a) return T1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (Y[m] >= a) hi = m; else lo = m + 1; }
    const y0 = Y[lo - 1], y1 = Y[lo];
    return Math.min(T1, (lo - 1 + (y1 > y0 ? (a - y0) / (y1 - y0) : 0)) / FPS);
  }
  function yearOfT(t) {
    const f = clamp(t * FPS, F0, Y.length - 1), i = Math.floor(f), j = Math.min(i + 1, Y.length - 1);
    return Y[i] + (Y[j] - Y[i]) * (f - i);
  }
  const label = (a) => (a <= 0 ? 1 - a + " BC" : a < 1000 ? "AD " + a : String(a));

  // the state, from the address: #y=1200&v=world
  const hp = new URLSearchParams(location.hash.slice(1));
  let t = tOfYear(clamp(Math.round(Number(hp.get("y")) || YMAX), YMIN, YMAX));
  let view = hp.get("v") === "world" ? "world" : "film";
  let playing = false, busy = false, dirty = true, last = 0;

  const slider = $("year"), ylab = $("ylab"), play = $("play"), speedSel = $("speed"), viewSel = $("view");
  $("names").value = names ? "1" : "0";
  $("detail").value = sharp ? "sharp" : "std";
  viewSel.value = view;

  function show() {
    const a = Math.round(yearOfT(t));
    slider.value = String(a);
    ylab.textContent = label(a);
    history.replaceState(null, "", "#y=" + a + (view === "world" ? "&v=world" : ""));
  }
  async function draw() {
    if (busy || !dirty || !window.ready) return;
    busy = true;
    dirty = false;
    try {
      await window.renderTime(t);
    } catch (e) {
      console.error(e);
    }
    busy = false;
    $("loading").hidden = true;
    if (dirty) requestAnimationFrame(draw);
  }
  function go(nt) {
    t = clamp(nt, T0, T1);
    show();
    dirty = true;
    draw();
  }
  function setView(v) {
    view = v;
    const m = window.__map;
    // the whole world: as wide as the map's area allows, from the Arctic to 60 S
    window.__setView(v === "world" ? { cx: 0, cy: -0.11, S: m.MAP_W / 5.44 } : null);
    show();
    dirty = true;
    draw();
  }

  function tick(now) {
    if (!playing) return;
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    const sp = speedSel.value;
    const nt = sp === "film" ? t + dt : tOfYear(yearOfT(t) + Number(sp) * dt);
    if (nt >= T1) { go(T1); stop(); return; }
    go(nt);
    requestAnimationFrame(tick);
  }
  function start() {
    if (t >= T1 - 1e-6) t = T0;                   // from the beginning again
    playing = true;
    last = 0;
    play.textContent = "Pause";
    requestAnimationFrame(tick);
  }
  function stop() {
    playing = false;
    play.textContent = "Play";
  }

  play.addEventListener("click", () => (playing ? stop() : start()));
  slider.addEventListener("input", () => go(tOfYear(Number(slider.value))));
  viewSel.addEventListener("change", () => setView(viewSel.value));
  function reloadWith(key, val, dflt) {
    const p = new URLSearchParams(location.search);
    if (val === dflt) p.delete(key); else p.set(key, val);
    const q = p.toString();
    location.href = location.pathname + (q ? "?" + q : "") + location.hash;
  }
  $("names").addEventListener("change", (e) => reloadWith("names", e.target.value, "1"));
  $("detail").addEventListener("change", (e) => reloadWith("q", e.target.value, "std"));
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); playing ? stop() : start(); }
    else if (e.target !== slider && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      e.preventDefault();
      go(tOfYear(Math.round(yearOfT(t)) + (e.code === "ArrowRight" ? 1 : -1)));
    }
  });

  // wait for the renderer (its fonts and data), then draw the first picture
  show();
  (function wait() {
    if (window.ready && window.__setView) { setView(view); return; }
    setTimeout(wait, 50);
  })();
})();
