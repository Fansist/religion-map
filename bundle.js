// renderer/rl.ts
var RL = window.RL;
var WYL = window.WYL;
var RLP = window.RLP;
var qp = new URLSearchParams(window.__query ?? location.search);
var SHORT_K = qp.get("short");
var IS_SHORT = SHORT_K !== null;
var W = Number(qp.get("w") || (IS_SHORT ? 1080 : 2560));
var H = Number(qp.get("h") || (IS_SHORT ? 1920 : 1440));
var LW = IS_SHORT ? 1080 : 2560;
var LH = IS_SHORT ? 1920 : 1440;
var KS = W / LW;
var US = Number(qp.get("us") || (IS_SHORT ? 1.3 : 1));
var FULL = qp.get("full") === "1";
var NOMIN = qp.get("nomin") === "1";
var NOLAB = qp.get("nolab") === "1";
var LX1 = Number(qp.get("lx1") || 1e9);
var FPS = RL.fps;
var HUD = qp.get("hud") !== "0";
var Q = 2e4;
var SEA = "#d6e2ee";
var LAND = "#f3f1ec";
var COAST = "#8f9cab";
var INK = "#16202c";
var INK_SOFT = "#6b7480";
var RULE = "#c3c8cf";
var PANEL_BG = "#efede9";
var PANEL_EDGE = "rgba(22,32,44,0.16)";
var ACCENT = "#8a6d1f";
var FONT = '"Inter", "DejaVu Sans", sans-serif';
var MAP_Y0 = IS_SHORT ? 330 : 0;
var MAP_H = IS_SHORT ? 1130 : FULL ? LH : 1140;
var BAND_Y = MAP_Y0 + MAP_H;
var KEYBAR = !IS_SHORT && !FULL && qp.get("nokey") !== "1";
var MAP_X0 = KEYBAR ? 440 : 0;
var MAP_W = LW - MAP_X0;
var MAP_CX = MAP_X0 + MAP_W / 2;
var canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
canvas.style.width = "100%";
canvas.style.height = "100%";
document.getElementById("stage").appendChild(canvas);
var ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
var setFont = (c, size, weight) => {
  c.font = `${weight} ${size}px ${FONT}`;
};
var smooth = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var A1 = 1.340264;
var A2 = -0.081106;
var A3 = 893e-6;
var A4 = 3796e-6;
var MM = Math.sqrt(3) / 2;
var LON0 = RL.lon0;
var CUT = LON0 - 180;
function ee(lon, lat) {
  if (lon < CUT) lon += 360;
  const lam = (lon - LON0) * Math.PI / 180;
  const th = Math.asin(MM * Math.sin(lat * Math.PI / 180));
  const t2 = th * th, t6 = t2 * t2 * t2;
  const x = lam * Math.cos(th) / (MM * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, -y];
}
var YEARS = RL.year;
var yearAt = (t) => YEARS[clamp(Math.round(t * FPS), 0, YEARS.length - 1)];
function yearLabel(a) {
  const yi = Math.floor(a);
  if (yi <= 0) return { num: String(1 - yi), era: "BC" };
  return { num: String(yi), era: "AD" };
}
var CK = RL.cam;
var camSegs = [];
{
  let cur = null;
  for (let i = 0; i < CK.length; i++) {
    const [t, lon, lat, span] = CK[i];
    if (!cur || t - cur.t[cur.t.length - 1] < 0.15) {
      cur = { t: [], x: [], y: [], z: [] };
      camSegs.push(cur);
    }
    const [x, y] = ee(lon, lat);
    cur.t.push(t);
    cur.x.push(x);
    cur.y.push(y);
    cur.z.push(Math.log(span));
  }
}
function pchip(ts, vs, t) {
  const n = ts.length;
  if (n === 1 || t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const h = (k) => ts[k + 1] - ts[k], d = (k) => (vs[k + 1] - vs[k]) / h(k);
  const slope = (k) => {
    if (k === 0 || k === n - 1) return k === 0 ? d(0) * 0 : d(n - 2) * 0;
    const a = d(k - 1), b = d(k);
    if (a * b <= 0) return 0;
    const w1 = 2 * h(k) + h(k - 1), w2 = h(k) + 2 * h(k - 1);
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const hh = h(i), u = (t - ts[i]) / hh, m0 = slope(i) * hh, m1 = slope(i + 1) * hh;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * m1;
}
function camAt(t) {
  const ov = window.__cam;
  if (ov) return ov;
  const fxy = qp.get("camxy");
  if (fxy) {
    const [x, y, span] = fxy.split(",").map(Number);
    return { cx: x, cy: y, S: MAP_W / span };
  }
  const fix = qp.get("cam");
  if (fix) {
    const [lon, lat, span] = fix.split(",").map(Number);
    const [x, y] = ee(lon, lat);
    return { cx: x, cy: y, S: MAP_W / span };
  }
  let sg = camSegs[0];
  for (const s of camSegs) if (t >= s.t[0]) sg = s;
  return { cx: pchip(sg.t, sg.x, t), cy: pchip(sg.t, sg.y, t), S: MAP_W / Math.exp(pchip(sg.t, sg.z, t)) };
}
var toScreen = (cam, x, y) => [MAP_CX + (x - cam.cx) * cam.S, MAP_Y0 + MAP_H / 2 + (y - cam.cy) * cam.S];
function setMapTransform(c, cam) {
  c.setTransform(KS * cam.S, 0, 0, KS * cam.S, KS * (MAP_CX - cam.cx * cam.S), KS * (MAP_Y0 + MAP_H / 2 - cam.cy * cam.S));
}
function addRings(p, rings) {
  for (const r of rings) {
    if (r.length < 6) continue;
    p.moveTo(r[0] / Q, r[1] / Q);
    for (let i = 2; i < r.length; i += 2) p.lineTo(r[i] / Q, r[i + 1] / Q);
    p.closePath();
  }
}
var landPath = new Path2D();
addRings(landPath, WYL.land);
var lakePath = new Path2D();
addRings(lakePath, WYL.lakes);
var RWID = RLP.RW;
var RHEI = RLP.RH;
var XR = RLP.XR;
var YR = RLP.YR;
var RAST = new Uint16Array(RWID * RHEI);
{
  const runs = RLP.runs, rows = RLP.rows;
  for (let y = 0; y < RHEI; y++) {
    let i = rows[y], x = 0, o = y * RWID;
    const end = y + 1 < RHEI ? rows[y + 1] : runs.length;
    for (; i < end; i += 2) {
      const v = runs[i], n = runs[i + 1];
      if (v) RAST.fill(v, o + x, o + x + n);
      x += n;
    }
  }
  RLP.runs = null;
  RLP.rows = null;
}
var RSX = RWID / (2 * XR);
var RSY = RHEI / (2 * YR);
var TW = 2048;
var TH = 1e3;
var TEX = new Float32Array(TW * TH * 4);
{
  const hash = (x, y, s) => {
    let h = x * 374761393 + y * 668265263 + s * 2147483647 | 0;
    h = (h ^ h >>> 13) * 1274126177 | 0;
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy;
  };
  const oct = [[1 / 26, 0.55], [1 / 10, 0.3], [1 / 4.2, 0.15]];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let wx = 0, wy = 0, n = 0;
    for (let k = 0; k < oct.length; k++) {
      const [f, w] = oct[k];
      wx += (vnoise(x * f, y * f, 11 + k) - 0.5) * 2 * w;
      wy += (vnoise(x * f, y * f, 37 + k) - 0.5) * 2 * w;
      n += vnoise(x * f * 1.3, y * f * 1.3, 71 + k) * w;
    }
    const o = (y * TW + x) * 4;
    TEX[o] = wx;
    TEX[o + 1] = wy;
    TEX[o + 2] = n;
  }
}
var TSX = TW / (2 * XR);
var TSY = TH / (2 * YR);
{
  const cv = document.createElement("canvas");
  cv.width = TW;
  cv.height = TH;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.setTransform(TSX, 0, 0, TSY, TW / 2, TH / 2);
  c.fillStyle = "#fff";
  c.fill(landPath, "evenodd");
  const px = c.getImageData(0, 0, TW, TH).data;
  const D = new Float32Array(TW * TH), INF = 1e9, R2 = Math.SQRT2;
  for (let i = 0; i < TW * TH; i++) D[i] = px[i * 4 + 3] > 127 ? INF : 0;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = y * TW + x;
    let d = D[i];
    if (d === 0) continue;
    if (x > 0) d = Math.min(d, D[i - 1] + 1);
    if (y > 0) {
      d = Math.min(d, D[i - TW] + 1);
      if (x > 0) d = Math.min(d, D[i - TW - 1] + R2);
      if (x < TW - 1) d = Math.min(d, D[i - TW + 1] + R2);
    }
    D[i] = d;
  }
  for (let y = TH - 1; y >= 0; y--) for (let x = TW - 1; x >= 0; x--) {
    const i = y * TW + x;
    let d = D[i];
    if (d === 0) continue;
    if (x < TW - 1) d = Math.min(d, D[i + 1] + 1);
    if (y < TH - 1) {
      d = Math.min(d, D[i + TW] + 1);
      if (x < TW - 1) d = Math.min(d, D[i + TW + 1] + R2);
      if (x > 0) d = Math.min(d, D[i + TW - 1] + R2);
    }
    D[i] = d;
  }
  const unit = 1 / TSX;
  for (let i = 0; i < TW * TH; i++) TEX[i * 4 + 3] = Math.max(0, Math.min(D[i], 400) - 1.5) * unit;
}
var WARP = Number(qp.get("warp") || 62e-4);
var WARP_L = Number(qp.get("warpl") || 0.06);
var AMP_A = Number(qp.get("ampa") || 80);
var AMP_B = Number(qp.get("ampb") || 450);
var LMIX = Number(qp.get("lmix") || 0.6);
var LMID = Number(qp.get("lmid") || 9);
var CW = RLP.SZW;
var CH = RLP.SZH;
var CTEX = new Float32Array(CW * CH * 4);
var CSX = CW / (2 * XR);
var CSY = CH / (2 * YR);
function rankNormalise(a, stride, off) {
  const n = a.length / stride, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((p, q) => a[p * stride + off] - a[q * stride + off]);
  for (let r = 0; r < n; r++) a[idx[r] * stride + off] = (r + 0.5) / n;
}
{
  const hash = (x, y, s) => {
    let h = x * 374761393 + y * 668265263 + s * 2147483647 | 0;
    h = (h ^ h >>> 13) * 1274126177 | 0;
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy;
  };
  const side = RLP.side;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const o = (y * CW + x) * 4;
    CTEX[o] = (vnoise(x / 30, y / 30, 5) - 0.5) * 2 * (1 - LMIX) + (vnoise(x / LMID, y / LMID, 6) - 0.5) * 2 * LMIX;
    CTEX[o + 1] = (vnoise(x / 30, y / 30, 9) - 0.5) * 2 * (1 - LMIX) + (vnoise(x / LMID, y / LMID, 10) - 0.5) * 2 * LMIX;
    CTEX[o + 2] = vnoise(x / 9, y / 9, 13) * 0.55 + vnoise(x / 3.5, y / 3.5, 14) * 0.3 + vnoise(x / 1.4, y / 1.4, 15) * 0.15;
    CTEX[o + 3] = clamp((side[y * CW + x] - AMP_A) / AMP_B, 0, 1);
  }
  rankNormalise(CTEX, 4, 2);
  rankNormalise(TEX, 4, 2);
  RLP.side = null;
}
var PAINTS = RL.paints;
var NP = PAINTS.length;
var hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
var pack = (r, g, b) => 255 << 24 | b << 16 | g << 8 | r;
var CA = new Uint32Array(NP);
var CB = new Uint32Array(NP);
var CAL = new Uint32Array(NP);
var CBL = new Uint32Array(NP);
var STRIPED = new Uint8Array(NP);
PAINTS.forEach((p, i) => {
  const a = hexRGB(p.cols[0]), b = hexRGB(p.cols[p.cols.length - 1]);
  CA[i] = pack(a[0], a[1], a[2]);
  CB[i] = pack(b[0], b[1], b[2]);
  const li = (c) => c.map((v) => Math.round(v + (255 - v) * 0.3));
  const al = li(a), bl = li(b);
  CAL[i] = pack(al[0], al[1], al[2]);
  CBL[i] = pack(bl[0], bl[1], bl[2]);
  STRIPED[i] = p.cols.length > 1 ? 1 : 0;
});
var TL = RL.tl;
var NI = TL.length;
var INST = new Int32Array(RL.instOf);
var P0 = new Int32Array(NI);
var P1 = new Int32Array(NI);
var MOV = new Uint8Array(NI);
var MODE = new Uint8Array(NI);
var PROG = new Float32Array(NI);
var OX = new Float32Array(NI);
var OY = new Float32Array(NI);
var K1 = new Float32Array(NI);
var K2 = new Float32Array(NI);
var BANDI = new Float32Array(NI);
var SEG = 11;
function instanceState(y, S) {
  for (let i = 0; i < NI; i++) {
    const r = TL[i];
    let p = r[0], moving = 0;
    for (let k = 1; k + SEG <= r.length; k += SEG) {
      const a0 = r[k], a1 = r[k + 1];
      if (y < a0) break;
      const to = y >= r[k + 4] ? r[k + 5] : r[k + 3];
      if (y >= a1) {
        p = to;
        continue;
      }
      P0[i] = r[k + 2];
      P1[i] = to;
      PROG[i] = (y - a0) / (a1 - a0);
      MODE[i] = r[k + 6];
      OX[i] = r[k + 7];
      OY[i] = r[k + 8];
      K1[i] = r[k + 9];
      K2[i] = r[k + 10];
      const kk = MODE[i] === 1 ? Math.hypot(K1[i], K2[i]) : MODE[i] === 2 ? K1[i] : 0;
      BANDI[i] = kk > 0 ? 2.5 / S * kk * 0.72 : 0.012;
      moving = 1;
      break;
    }
    MOV[i] = moving;
    if (!moving) {
      P0[i] = p;
      P1[i] = p;
    }
  }
}
var relCv = document.createElement("canvas");
var RW_PX = W;
var RH_PX = Math.ceil(MAP_H * KS);
relCv.width = RW_PX;
relCv.height = RH_PX;
var rctx = relCv.getContext("2d", { willReadFrequently: true });
var relImg = rctx.createImageData(RW_PX, RH_PX);
var RBUF = new Uint32Array(relImg.data.buffer);
var RBUF_MAIN = RBUF;
var colU = new Int32Array(RW_PX);
var colF = new Float32Array(RW_PX);
var colX = new Float64Array(RW_PX);
var cIU = new Int32Array(RW_PX);
var cFU = new Float32Array(RW_PX);
var ANT_Y = 1.0883;
var STRIPE_F = 1 / 46e-4;
function paintReligion(cam, y, X0 = 0, Y0 = 0, PW = RW_PX, PH = RH_PX, OUT = RBUF_MAIN) {
  instanceState(y, cam.S);
  const sPx = cam.S * KS;
  for (let px = 0; px < PW; px++) {
    const x = cam.cx + (X0 + px + 0.5 - MAP_CX * KS) / sPx;
    colX[px] = x;
    const u = (x + XR) * TSX - 0.5;
    const iu = Math.floor(u);
    colU[px] = iu < 0 ? 0 : iu > TW - 2 ? TW - 2 : iu;
    colF[px] = iu < 0 ? 0 : iu > TW - 2 ? 1 : u - iu;
  }
  const ccU = cIU, ccF = cFU;
  for (let px = 0; px < PW; px++) {
    const u = (colX[px] + XR) * CSX - 0.5;
    const iu = Math.floor(u);
    ccU[px] = iu < 0 ? 0 : iu > CW - 2 ? CW - 2 : iu;
    ccF[px] = iu < 0 ? 0 : iu > CW - 2 ? 1 : u - iu;
  }
  const RBUF2 = OUT;
  let o = 0;
  for (let py = 0; py < PH; py++) {
    const yy = cam.cy + (Y0 + py + 0.5 - MAP_H / 2 * KS) / sPx;
    if (yy > ANT_Y) {
      for (let px = 0; px < PW; px++, o++) RBUF2[o] = 0;
      continue;
    }
    const v = (yy + YR) * TSY - 0.5;
    let iv = Math.floor(v);
    let fv = v - iv;
    if (iv < 0) {
      iv = 0;
      fv = 0;
    } else if (iv > TH - 2) {
      iv = TH - 2;
      fv = 1;
    }
    const r0 = iv * TW * 4, r1 = r0 + TW * 4;
    const cv = (yy + YR) * CSY - 0.5;
    let civ = Math.floor(cv);
    let cfv = cv - civ;
    if (civ < 0) {
      civ = 0;
      cfv = 0;
    } else if (civ > CH - 2) {
      civ = CH - 2;
      cfv = 1;
    }
    const c0 = civ * CW * 4, c1 = c0 + CW * 4;
    for (let px = 0; px < PW; px++, o++) {
      const iu = colU[px], fu = colF[px];
      const i00 = r0 + iu * 4, i10 = i00 + 4, i01 = r1 + iu * 4, i11 = i01 + 4;
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
      const cu = ccU[px], cf = ccF[px];
      const j00 = c0 + cu * 4, j10 = j00 + 4, j01 = c1 + cu * 4, j11 = j01 + 4;
      const v00 = (1 - cf) * (1 - cfv), v10 = cf * (1 - cfv), v01 = (1 - cf) * cfv, v11 = cf * cfv;
      const amp = (CTEX[j00 + 3] * v00 + CTEX[j10 + 3] * v10 + CTEX[j01 + 3] * v01 + CTEX[j11 + 3] * v11) * WARP_L;
      const wx = (TEX[i00] * w00 + TEX[i10] * w10 + TEX[i01] * w01 + TEX[i11] * w11) * WARP + (CTEX[j00] * v00 + CTEX[j10] * v10 + CTEX[j01] * v01 + CTEX[j11] * v11) * amp;
      const wy = (TEX[i00 + 1] * w00 + TEX[i10 + 1] * w10 + TEX[i01 + 1] * w01 + TEX[i11 + 1] * w11) * WARP + (CTEX[j00 + 1] * v00 + CTEX[j10 + 1] * v10 + CTEX[j01 + 1] * v01 + CTEX[j11 + 1] * v11) * amp;
      const x = colX[px];
      const room = TEX[i00 + 3] * w00 + TEX[i10 + 3] * w10 + TEX[i01 + 3] * w01 + TEX[i11 + 3] * w11;
      const m2 = wx * wx + wy * wy;
      let xw = x + wx, yw = yy + wy;
      if (m2 > room * room) {
        const k = room / Math.sqrt(m2);
        xw = x + wx * k;
        yw = yy + wy * k;
      }
      const rx = (xw + XR) * RSX | 0, ry = (yw + YR) * RSY | 0;
      if (rx < 0 || ry < 0 || rx >= RWID || ry >= RHEI) {
        RBUF2[o] = 0;
        continue;
      }
      const id = RAST[ry * RWID + rx];
      if (id === 0) {
        RBUF2[o] = 0;
        continue;
      }
      const ins = INST[id];
      let p = P0[ins], lit = false;
      if (MOV[ins]) {
        const pr = PROG[ins];
        let thr;
        const md = MODE[ins];
        if (md === 3) {
          const pa = P0[ins], pb = P1[ins];
          const st = ((x - yy) * STRIPE_F + 1e5 | 0) & 1;
          const ca = STRIPED[pa] && st ? CB[pa] : CA[pa], cb = STRIPED[pb] && st ? CB[pb] : CA[pb];
          const r = (ca & 255) + ((cb & 255) - (ca & 255)) * pr, g = (ca >> 8 & 255) + ((cb >> 8 & 255) - (ca >> 8 & 255)) * pr;
          const b = (ca >> 16 & 255) + ((cb >> 16 & 255) - (ca >> 16 & 255)) * pr;
          RBUF2[o] = pack(r | 0, g | 0, b | 0);
          continue;
        }
        if (md === 0) {
          thr = CTEX[j00 + 2] * v00 + CTEX[j10 + 2] * v10 + CTEX[j01 + 2] * v01 + CTEX[j11 + 2] * v11;
        } else {
          const n = TEX[i00 + 2] * w00 + TEX[i10 + 2] * w10 + TEX[i01 + 2] * w01 + TEX[i11 + 2] * w11;
          const dx = xw - OX[ins], dy = yw - OY[ins];
          const g = md === 1 ? dx * K1[ins] + dy * K2[ins] : Math.sqrt(dx * dx + dy * dy) * K1[ins];
          thr = (g < 0 ? 0 : g) * 0.72 + n * 0.28;
        }
        if (pr > thr) {
          p = P1[ins];
          if (pr - thr < BANDI[ins]) lit = true;
        }
      }
      if (STRIPED[p] && ((x - yy) * STRIPE_F + 1e5 | 0) & 1) RBUF2[o] = lit ? CBL[p] : CB[p];
      else RBUF2[o] = lit ? CAL[p] : CA[p];
    }
  }
  if (OUT === RBUF_MAIN) rctx.putImageData(relImg, 0, 0);
}
var baseCv = document.createElement("canvas");
baseCv.width = W;
baseCv.height = H;
var bctx = baseCv.getContext("2d", { alpha: false, willReadFrequently: true });
var overCv = document.createElement("canvas");
overCv.width = W;
overCv.height = H;
var octx = overCv.getContext("2d", { willReadFrequently: true });
var landKey = "";
function landLayers(cam) {
  const k = cam.S.toFixed(4) + ":" + cam.cx.toFixed(7) + ":" + cam.cy.toFixed(7);
  if (k === landKey) return;
  landKey = k;
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.fillStyle = SEA;
  bctx.fillRect(0, 0, W, H);
  setMapTransform(bctx, cam);
  bctx.fillStyle = LAND;
  bctx.fill(landPath, "evenodd");
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, W, H);
  setMapTransform(octx, cam);
  octx.lineJoin = "round";
  octx.lineCap = "round";
  octx.fillStyle = SEA;
  octx.fill(lakePath, "evenodd");
  octx.strokeStyle = COAST;
  octx.lineWidth = 1.3 / cam.S;
  octx.stroke(landPath);
  octx.stroke(lakePath);
}
var REL = RL.rel;
var SHORT = RL.short;
var INSTZ = RL.instZone;
var TRACKS = RL.labels;
var LABEL_DT = 0.5;
function partName(code, inst, y, short) {
  const R = REL[code];
  for (const [a, b, txt, zones] of R.alt) {
    if (y >= a && y < b && (!zones || String(zones).split(" ").includes(INSTZ[inst]))) return txt === null ? "" : txt;
  }
  return short ? SHORT[code] : R.name;
}
function nameOf(paint, inst, y, short) {
  const parts = PAINTS[paint].code.split("/");
  if (parts.length > 1) return parts.map((c) => partName(c, inst, y, true)).filter((x) => x).join(" / ");
  return partName(parts[0], inst, y, short);
}
var PREVIEW = RL.preview;
var TOTAL = RL.total;
var sceneOf = (t) => t < PREVIEW ? 0 : 1;
var sceneStart = (sc) => sc === 0 ? 0 : PREVIEW;
var sceneEnd = (sc) => sc === 0 ? PREVIEW : TOTAL;
var HOOK = IS_SHORT ? 0 : Number(RL.hook || 0);
var HOOK_YEARS = RL.hookYear || [];
var HOOK_FADE = 0.6;
var mapYearAt = (t) => t < HOOK && HOOK_YEARS.length ? HOOK_YEARS[clamp(Math.round(t * FPS), 0, HOOK_YEARS.length - 1)] : yearAt(t);
var hookAlpha = (t) => !HOOK || t >= HOOK + HOOK_FADE ? 1 : t < HOOK ? 0 : smooth((t - HOOK) / HOOK_FADE);
function trackAt(tr, t) {
  const s = tr[1], sc = tr[2];
  if (sc !== sceneOf(t)) return null;
  const first = s[0][0], last = s[s.length - 1][0];
  if (t < first - 0.25 || t > last + LABEL_DT + 0.25) return null;
  let i = 0;
  while (i < s.length - 1 && s[i + 1][0] <= t) i++;
  const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
  const u = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
  const fin = first <= sceneStart(sc) + 1e-6 ? 1 : smooth((t - first + 0.25) / 0.5);
  const fout = last + LABEL_DT >= sceneEnd(sc) - 1e-6 ? 1 : smooth((last + LABEL_DT + 0.25 - t) / 0.5);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u, a[4], Math.min(fin, fout)];
}
function layoutLabels(c, t, cam, avoid = []) {
  const y = yearAt(t);
  const cand = [];
  TRACKS.forEach((tr, ti) => {
    const st = trackAt(tr, t);
    if (!st) return;
    const [x, yy, r, inst, fade] = st;
    const [sx, sy] = toScreen(cam, x, yy);
    const rs = r * cam.S;
    if (rs < 11 || sx < -50 || sx > LW + 50 || sy < MAP_Y0 - 30 || sy > MAP_Y0 + MAP_H + 30) return;
    for (const short of [false, true]) {
      const txt = nameOf(tr[0], inst, y, short);
      if (!txt) return;
      let fs = clamp(rs * 0.42 * US, 15 * US, 30 * US);
      setFont(c, fs, 800);
      let w = c.measureText(txt).width;
      while (w > rs * 2.7 * US && fs > 15 * US) {
        fs -= 0.5;
        setFont(c, fs, 800);
        w = c.measureText(txt).width;
      }
      if (w <= rs * 2.7 * US) {
        cand.push({ x: sx, y: sy, w, h: fs * 1.1, fs, txt, key: ti, a: fade * smooth((rs - 11) / 6) });
        return;
      }
    }
  });
  cand.sort((p, q) => q.fs * q.w - p.fs * p.w);
  const out = [];
  for (const L of cand) {
    const x0 = L.x - L.w / 2 - 4, x1 = L.x + L.w / 2 + 4, y0 = L.y - L.h / 2 - 3, y1 = L.y + L.h / 2 + 3;
    if (x0 < MAP_X0 + 4 || x1 > Math.min(LW - 4, LX1) || y0 < MAP_Y0 + 4 || y1 > MAP_Y0 + MAP_H - 4) continue;
    if (out.some((P) => !(x1 < P.x - P.w / 2 - 4 || x0 > P.x + P.w / 2 + 4 || y1 < P.y - P.h / 2 - 3 || y0 > P.y + P.h / 2 + 3))) continue;
    if (avoid.some((B) => !(x1 < B[0] || x0 > B[2] || y1 < B[1] || y0 > B[3]))) continue;
    out.push(L);
  }
  return out;
}
function drawLabels(c, t, cam, near, avoid = []) {
  const N = 5, DT = 0.12;
  const seen = /* @__PURE__ */ new Map();
  const sc = sceneOf(t);
  for (let k = 0; k < N; k++) {
    let tt, cj;
    if (near) [tt, cj] = near(k - (N - 1) / 2);
    else {
      tt = clamp(t + (k - (N - 1) / 2) * DT, sceneStart(sc), sceneEnd(sc) - 1e-3);
      cj = camAt(tt);
    }
    for (const L of layoutLabels(c, tt, cj, avoid.concat(uiBoxes(c, tt)))) seen.set(L.key, (seen.get(L.key) || 0) + 1);
  }
  const labs = layoutLabels(c, t, cam, avoid.concat(uiBoxes(c, t)));
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  const drawn = [];
  for (const L of labs) {
    const al = L.a * (seen.get(L.key) || 0) / N;
    if (al <= 0.02) continue;
    drawn.push({ ...L, a: al });
    c.globalAlpha = al;
    setFont(c, L.fs, 800);
    c.strokeStyle = "rgba(250,249,246,0.78)";
    c.lineWidth = Math.max(3, L.fs * 0.2);
    c.strokeText(L.txt, L.x, L.y);
    c.fillStyle = "#1b2430";
    c.fillText(L.txt, L.x, L.y);
  }
  c.restore();
  return drawn;
}
function fitSize(c, txt, maxW, size, weight, minSize) {
  let fs = size;
  setFont(c, fs, weight);
  while (fs > minSize && c.measureText(txt).width > maxW) {
    fs -= 1;
    setFont(c, fs, weight);
  }
  return fs;
}
function wrap(c, txt, maxW) {
  const words = txt.split(" "), lines = [];
  let cur = "";
  for (const w of words) {
    const tr = cur ? cur + " " + w : w;
    if (c.measureText(tr).width <= maxW || !cur) cur = tr;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function spacedW(c, txt, track) {
  let w = 0;
  for (const ch of txt) w += c.measureText(ch).width + track;
  return w - track;
}
function spaced(c, txt, x, y, track, align = "left") {
  const chars = [...txt];
  let w = 0;
  for (const ch of chars) w += c.measureText(ch).width + track;
  w -= track;
  let xx = align === "right" ? x - w : x;
  c.textAlign = "left";
  for (const ch of chars) {
    c.fillText(ch, xx, y);
    xx += c.measureText(ch).width + track;
  }
  return w;
}
var relCol = (code) => REL[code] ? REL[code].col : "#999999";
var F0 = Math.round(PREVIEW * FPS);
function tOfYear(a) {
  let lo = F0, hi = YEARS.length - 1;
  if (YEARS[hi] < a) return TOTAL;
  while (lo < hi) {
    const m = lo + hi >> 1;
    if (YEARS[m] >= a) hi = m;
    else lo = m + 1;
  }
  return lo / FPS;
}
var CLOCK_END = RL.clockEnd;
var RECAP_T0 = CLOCK_END + 6;
var WORDS = RL.words;
var TXT = RL.text;
var BX0 = 540;
var BX1 = 1594;
var PX0 = 1694;
var PX1 = 2504;
function wordAlpha(w, t) {
  if (t < w.t0 || t > w.t1) return 0;
  return Math.min(smooth((t - w.t0) / 0.35), smooth((w.t1 - t) / 0.35));
}
function drawCaption(c, kick, body, al, isEvent, dy = 0) {
  if (al <= 0.01) return;
  c.globalAlpha = al;
  setFont(c, 29, 800);
  c.fillStyle = isEvent ? "#7a3b2e" : ACCENT;
  c.textBaseline = "alphabetic";
  let kx = BX0;
  if (isEvent) {
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(BX0 + 12, BAND_Y + 86 + dy, 10, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(BX0 + 12, BAND_Y + 86 + dy, 3.5, 0, Math.PI * 2);
    c.fill();
    kx += 36;
  }
  spaced(c, kick.toUpperCase(), kx, BAND_Y + 96 + dy, 2.2);
  c.fillStyle = INK;
  let fs = 46, lines = [];
  for (; fs >= 36; fs -= 2) {
    setFont(c, fs, 650);
    lines = wrap(c, body, BX1 - BX0);
    if (lines.length <= 2) break;
  }
  c.textAlign = "left";
  lines.slice(0, 3).forEach((ln, i) => c.fillText(ln, BX0, BAND_Y + 158 + dy + i * fs * 1.22));
  c.globalAlpha = 1;
}
function drawWords(c, t) {
  if (t < PREVIEW) {
    c.fillStyle = INK;
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    const fs = fitSize(c, TXT.title, BX1 - BX0, 64, 900, 40);
    c.fillText(TXT.title, BX0, BAND_Y + 132);
    setFont(c, 34, 700);
    c.fillStyle = INK_SOFT;
    c.fillText(TXT.subtitle + " \xB7 " + TXT.tagline, BX0, BAND_Y + 196);
    return;
  }
  for (const w of WORDS) {
    const al = wordAlpha(w, t);
    if (al > 0) drawCaption(c, w.kick, w.txt, al, !!w.ev, (1 - smooth((t - w.t0) / 0.35)) * 10);
  }
  if (t >= CLOCK_END) {
    const tc = RECAP_T0;
    const a1 = Math.min(smooth((t - CLOCK_END) / 0.5), smooth((tc - t) / 0.4));
    if (a1 > 0.01) {
      c.globalAlpha = a1;
      setFont(c, 29, 800);
      c.fillStyle = ACCENT;
      c.textBaseline = "alphabetic";
      spaced(c, TXT.end[0].toUpperCase(), BX0, BAND_Y + 96, 2.2);
      c.fillStyle = INK;
      c.textAlign = "left";
      setFont(c, 44, 750);
      const items = TXT.end[1].split(" \xB7 "), lines = [];
      let cur = "";
      for (const it of items) {
        const tr = cur ? cur + " \xB7 " + it : it;
        if (c.measureText(tr).width <= BX1 - BX0 || !cur) cur = tr;
        else {
          lines.push(cur);
          cur = it;
        }
      }
      if (cur) lines.push(cur);
      lines.forEach((ln, i) => c.fillText(ln, BX0, BAND_Y + 152 + i * 52));
      setFont(c, 22, 500);
      c.fillStyle = INK_SOFT;
      fitSize(c, TXT.endSrc, BX1 - BX0, 22, 500, 16);
      c.fillText(TXT.endSrc, BX0, BAND_Y + 152 + lines.length * 52 + 4);
      c.globalAlpha = 1;
    }
    const a2 = smooth((t - tc - 0.2) / 0.5);
    if (a2 > 0.01) {
      c.globalAlpha = a2;
      setFont(c, 29, 800);
      c.fillStyle = ACCENT;
      spaced(c, "SOURCES AND CREDITS", BX0, BAND_Y + 82, 2.2);
      c.fillStyle = INK;
      c.textAlign = "left";
      const cr = TXT.credits, cp = cr.length > 4 ? 35 : 42;
      cr.forEach((ln, i) => {
        fitSize(c, ln, BX1 - BX0, cr.length > 4 ? 25 : 28, 600, 18);
        c.fillText(ln, BX0, BAND_Y + (cr.length > 4 ? 122 : 130) + i * cp);
      });
      c.globalAlpha = 1;
    }
  }
}
var STARK = RL.stark;
var CSG = RL.csgc;
var T_STARK0 = tOfYear(STARK[0][0]);
var T_STARK1 = tOfYear(400);
var T_CSGC0 = tOfYear(CSG.years[0]);
function starkAt(y) {
  if (y <= STARK[0][0]) return [STARK[0][1], STARK[0][2]];
  for (let i = 0; i < STARK.length - 1; i++) {
    const a = STARK[i], b = STARK[i + 1];
    if (y <= b[0]) {
      const u = (y - a[0]) / (b[0] - a[0]);
      return [a[1] * Math.pow(b[1] / a[1], u), a[2] * Math.pow(b[2] / a[2], u)];
    }
  }
  const l = STARK[STARK.length - 1];
  return [l[1], l[2]];
}
function csgcAt(vals, y) {
  const ys = CSG.years;
  if (y <= ys[0]) return vals[0];
  for (let i = 0; i < ys.length - 1; i++) if (y <= ys[i + 1]) return vals[i] + (vals[i + 1] - vals[i]) * (y - ys[i]) / (ys[i + 1] - ys[i]);
  return vals[vals.length - 1];
}
var sig = (v, n) => Number(v.toPrecision(n));
function fmtPeople(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + " bn";
  if (v >= 1e6) return (v >= 1e8 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1).replace(/\.0$/, "")) + " m";
  return sig(v, 2).toLocaleString("en-US");
}
function fmtStark(v) {
  if (v >= 1e6) return String(sig(v / 1e6, 2)) + " million";
  return sig(v, 2).toLocaleString("en-US");
}
function fmtPct(p) {
  return String(p >= 10 ? sig(p, 3) : sig(p, 2)) + "%";
}
function panelTitle(c, title, note) {
  setFont(c, 25, 800);
  c.fillStyle = INK_SOFT;
  c.textBaseline = "alphabetic";
  const w = spaced(c, title, PX0, BAND_Y + 62, 2);
  setFont(c, 23, 500);
  c.fillStyle = INK_SOFT;
  c.textAlign = "left";
  const room = PX1 - PX0 - w - 22;
  if (note && room > 120) {
    fitSize(c, note, room, 23, 500, 16);
    c.fillText(note, PX0 + w + 22, BAND_Y + 62);
  }
}
function drawStark(c, y) {
  const [n, pc] = starkAt(y);
  panelTitle(c, TXT.starkTitle, TXT.starkNote);
  setFont(c, 80, 900);
  c.fillStyle = INK;
  c.textAlign = "left";
  c.fillText(fmtStark(n), PX0, BAND_Y + 158);
  setFont(c, 30, 650);
  c.fillStyle = INK_SOFT;
  c.fillText(fmtPct(pc) + " of the empire's people", PX0, BAND_Y + 204);
  const bw = PX1 - PX0, by = BAND_Y + 226;
  c.fillStyle = "rgba(22,32,44,0.08)";
  c.fillRect(PX0, by, bw, 22);
  c.fillStyle = relCol("CHR");
  c.fillRect(PX0, by, Math.max(2, bw * pc / 100), 22);
  c.fillStyle = "rgba(22,32,44,0.35)";
  c.fillRect(PX0 + bw / 2 - 1, by - 6, 2, 34);
  setFont(c, 20, 600);
  c.fillStyle = INK_SOFT;
  c.textAlign = "center";
  c.fillText("half", PX0 + bw / 2, by + 52);
  c.textAlign = "left";
}
function drawCsgc(c, y) {
  const world = csgcAt(CSG.world, y);
  panelTitle(c, TXT.csgcTitle, "of " + (world / 1e9).toFixed(2) + " billion people \xB7 " + TXT.csgcSrc);
  const rows = CSG.rows;
  const colW = (PX1 - PX0 - 40) / 2, pitch = 40, vmax = 27e8;
  rows.forEach(([code, name, vals], i) => {
    const col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5;
    const x0 = PX0 + col * (colW + 40), yb = BAND_Y + 108 + row * pitch;
    const v = csgcAt(vals, y);
    setFont(c, 24, 700);
    c.fillStyle = INK;
    c.textAlign = "left";
    c.fillText(name, x0, yb);
    setFont(c, 24, 800);
    c.textAlign = "right";
    c.fillText(fmtPeople(v), x0 + colW, yb);
    c.fillStyle = "rgba(22,32,44,0.07)";
    c.fillRect(x0, yb + 8, colW, 8);
    c.fillStyle = relCol(code);
    c.fillRect(x0, yb + 8, Math.max(1.5, colW * v / vmax), 8);
  });
  c.textAlign = "left";
}
var PEOPLE = RL.people || [];
var KEY_DT = 0.5;
function keyNameOf(code, y) {
  if (code === "UNH" || !REL[code]) return null;
  for (const [a, b, txt, zones] of REL[code].alt) if (!zones && y >= a && y < b) return txt;
  return REL[code].name;
}
function peopleIx(t) {
  const i = clamp(Math.floor(t / KEY_DT), 0, PEOPLE.length - 1), j = Math.min(i + 1, PEOPLE.length - 1);
  return [i, j, j > i ? clamp((t - PEOPLE[i][0]) / (PEOPLE[j][0] - PEOPLE[i][0]), 0, 1) : 0];
}
function keySharesAt(t) {
  const m = /* @__PURE__ */ new Map();
  if (!PEOPLE.length) return m;
  const [i, j, u] = peopleIx(t);
  for (const [c, v] of PEOPLE[i][2]) m.set(c, (m.get(c) || 0) + v * (1 - u));
  for (const [c, v] of PEOPLE[j][2]) m.set(c, (m.get(c) || 0) + v * u);
  return m;
}
function peopleTotalAt(t) {
  if (!PEOPLE.length) return 0;
  const [i, j, u] = peopleIx(t), a = PEOPLE[i][1], b = PEOPLE[j][1];
  return a > 0 && b > 0 ? a * Math.pow(b / a, u) : a + (b - a) * u;
}
var fmtTotal = (v) => v >= 1e9 ? (v / 1e9).toFixed(2) + " billion" : Math.round(v / 1e6) + " million";
function fmtCount(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + " bn";
  if (v >= 1e7) return Math.round(v / 1e6) + " m";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " m";
  return (v / 1e6).toFixed(2) + " m";
}
var FAMS = { christian: ["Christianity", "CHR"], muslim: ["Islam", "SUN"], buddhist: ["Buddhism", "BUD"] };
var famOf = (code) => REL[code] && FAMS[REL[code].fam] ? "F:" + REL[code].fam : code;
var keyName = (k, y) => k.startsWith("F:") ? FAMS[k.slice(2)][0] : keyNameOf(k, y);
var keyCol = (k) => k.startsWith("F:") ? relCol(FAMS[k.slice(2)][1]) : relCol(k);
function keyAt(t, y) {
  const m = /* @__PURE__ */ new Map();
  for (const [c, v] of keySharesAt(t)) {
    if (c === "MIX" || keyNameOf(c, y) === null) continue;
    const f = famOf(c);
    m.set(f, (m.get(f) || 0) + v);
  }
  return [...m.entries()].sort((p, q) => q[1] - p[1]);
}
var panelCache = /* @__PURE__ */ new Map();
function panelList(tt) {
  const k = Math.round(tt * 1e3);
  let v = panelCache.get(k);
  if (!v) {
    v = keyAt(tt, yearAt(tt)).map((e) => e[0]);
    if (panelCache.size > 256) panelCache.clear();
    panelCache.set(k, v);
  }
  return v;
}
function drawKey(c, t, y) {
  const tot = peopleTotalAt(t);
  setFont(c, 25, 800);
  c.fillStyle = INK_SOFT;
  c.textBaseline = "alphabetic";
  const tw = spaced(c, TXT.popTitle, PX0, BAND_Y + 62, 2);
  fitSize(c, "of 888 million \xB7 " + TXT.popNote, PX1 - PX0 - tw - 22, 23, 500, 15);
  c.fillStyle = INK_SOFT;
  c.textAlign = "left";
  c.fillText("of " + fmtTotal(tot) + " \xB7 " + TXT.popNote, PX0 + tw + 22, BAND_Y + 62);
  const N = 5, pitch = 41;
  const sc = sceneOf(t);
  const ranks = /* @__PURE__ */ new Map(), cur = keyAt(t, y).slice(0, N);
  const G = 0.12, M = 3, gi = Math.floor(t / G + 1e-9), u = clamp(t / G - gi, 0, 1);
  const rankAt = (g, code) => {
    let sum = 0;
    for (let k = -M; k <= M; k++) {
      const tt = clamp((g + k) * G, sceneStart(sc), sceneEnd(sc) - 1e-3);
      const r = panelList(tt).indexOf(code);
      sum += r < 0 || r >= N ? N : r;
    }
    return sum / (2 * M + 1);
  };
  const g0 = sceneOf(gi * G) === sc ? gi : gi + 1, g1 = sceneOf((gi + 1) * G) === sc ? gi + 1 : gi;
  for (const [code] of cur) ranks.set(code, rankAt(g0, code) * (1 - u) + rankAt(g1, code) * u);
  const bw = 230, bx = PX1 - bw - 190;
  const order = cur.map((e, i) => [e, i]).sort((p, q) => q[1] - p[1]);
  for (const [[code, share], cr] of order) {
    const r = ranks.get(code) ?? 0;
    const yb = BAND_Y + 108 + r * pitch;
    const al = clamp(N - r, 0, 1);
    if (al <= 0.02) continue;
    c.globalAlpha = al;
    c.fillStyle = PANEL_BG;
    c.fillRect(PX0 - 6, yb - 30, PX1 - PX0 + 12, pitch - 1);
    if (Math.abs(r - cr) > 0.05) {
      c.fillStyle = "rgba(22,32,44,0.05)";
      c.fillRect(PX0 - 6, yb - 30, PX1 - PX0 + 12, pitch - 1);
    }
    c.fillStyle = keyCol(code);
    c.fillRect(PX0, yb - 22, 26, 26);
    c.strokeStyle = "rgba(22,32,44,0.25)";
    c.lineWidth = 1.5;
    c.strokeRect(PX0 + 0.75, yb - 21.25, 24.5, 24.5);
    const nm = keyName(code, y) || "";
    c.fillStyle = INK;
    c.textAlign = "left";
    fitSize(c, nm, bx - 18 - (PX0 + 40), 26, 700, 18);
    c.fillText(nm, PX0 + 40, yb);
    c.fillStyle = "rgba(22,32,44,0.07)";
    c.fillRect(bx, yb - 15, bw, 12);
    c.fillStyle = keyCol(code);
    c.fillRect(bx, yb - 15, Math.max(1.5, bw * share), 12);
    setFont(c, 25, 800);
    c.fillStyle = INK;
    c.textAlign = "right";
    c.fillText(fmtCount(share * tot), PX1 - 86, yb);
    setFont(c, 23, 700);
    c.fillStyle = INK_SOFT;
    c.fillText(share < 5e-3 ? "<1%" : Math.round(share * 100) + "%", PX1, yb);
    c.textAlign = "left";
  }
  c.globalAlpha = 1;
}
var SWITCHES = [[T_STARK0, "key", "stark"], [T_STARK1, "stark", "key"], [T_CSGC0, "key", "csgc"]];
function drawPanel(c, t) {
  const y = yearAt(t);
  if (t < PREVIEW) {
    const ha = hookAlpha(t);
    if (ha > 0.01) {
      c.globalAlpha = ha;
      drawCsgc(c, y);
      c.globalAlpha = 1;
    }
    return;
  }
  let mode = t >= T_CSGC0 ? "csgc" : t >= T_STARK0 && t < T_STARK1 ? "stark" : "key", al = 1;
  const F = 0.4;
  for (const [T, from, to] of SWITCHES) {
    if (t >= T - F && t < T) {
      mode = from;
      al = 1 - smooth((t - (T - F)) / F);
    } else if (t >= T && t < T + F) {
      mode = to;
      al = smooth((t - T) / F);
    }
  }
  if (al <= 0.01) return;
  c.globalAlpha = al;
  if (mode === "key") drawKey(c, t, y);
  else if (mode === "stark") drawStark(c, y);
  else drawCsgc(c, y);
  c.globalAlpha = 1;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
var LEG = RL.legend || { order: [], groups: {} };
var LGROUPS = LEG.groups;
var KEY_ON_FILM = RL.keyOn || {};
var KEY_ON_WORLD = RL.keyOnWorld || KEY_ON_FILM;
var KEY_ON = KEY_ON_FILM;
var LEG_Y0 = 100;
var LEG_Y1 = MAP_H - 22;
var LEG_P0 = 36;
var LEG_GAP = 9;
var LEG_X0 = 32;
var LEG_IND = 26;
var LEG_FADE = 0.6;
var LEG_COLW = (MAP_X0 - LEG_X0 - LEG_IND - 10) / 2;
function listed(c, t) {
  const iv = KEY_ON[c];
  if (!iv) return false;
  for (const [a, b] of iv) if (t >= a && t < b) return true;
  return false;
}
function listedW(c, t) {
  const iv = KEY_ON[c];
  if (!iv) return 0;
  const sc = sceneOf(t), s0 = sceneStart(sc), s1 = sceneEnd(sc);
  let w = 0;
  for (const [a, b] of iv) {
    if (t < a || t >= b) continue;
    const fin = a <= s0 + 1e-6 ? 1 : smooth((t - a) / LEG_FADE), fout = b >= s1 - 1e-6 ? 1 : smooth((b - t) / LEG_FADE);
    w = Math.max(w, Math.min(fin, fout));
  }
  return w;
}
function legendItems(t) {
  const y = yearAt(t);
  const on = (c) => listed(c, t) && keyNameOf(c, y) !== null;
  const items = [];
  let line = 0, gaps = 0;
  for (const fam of LEG.order) {
    let first = true;
    const gapNow = () => {
      const g = first && items.length > 0;
      if (g) gaps++;
      first = false;
      return g;
    };
    for (const code of fam) {
      const g = LGROUPS[code];
      const kids = g ? g[0].filter(on) : [];
      if (kids.length) {
        items.push({ key: "g:" + code, code, label: keyNameOf(code, y) || REL[code].name, kind: 1, line: line++, col: 0, gap: gapNow() });
        const cells = kids.map((k) => ({ key: "c:" + k, code: k, label: RL.short[k] || keyNameOf(k, y) || "" }));
        if (on(code)) cells.push({ key: "o:" + code, code, label: g[1] });
        cells.forEach((cl, i) => items.push({ ...cl, kind: 2, line: line + (i >> 1), col: i & 1, gap: false }));
        line += cells.length + 1 >> 1;
      } else if (on(code)) items.push({ key: (g ? "g:" : "c:") + code, code, label: keyNameOf(code, y) || "", kind: 0, line: line++, col: 0, gap: gapNow() });
    }
  }
  if (listed("MIX", t)) {
    gaps++;
    items.push({ key: "mix", code: "MIX", label: "Two side by side", kind: 0, line: line++, col: 0, gap: true });
  }
  if (commOn(t)) {
    const g = !listed("MIX", t);
    if (g) gaps++;
    items.push({ key: "comm", code: "COMM", label: TXT.commKey, kind: 0, line: line++, col: 0, gap: g });
  }
  return { items, lines: line, gaps };
}
function legendLayout(L) {
  const pitch = Math.min(LEG_P0, (LEG_Y1 - LEG_Y0 - L.gaps * LEG_GAP) / Math.max(1, L.lines));
  const pos = /* @__PURE__ */ new Map();
  let off = 0;
  for (const it of L.items) {
    if (it.gap) off += LEG_GAP;
    pos.set(it.key, [it.kind === 2 ? LEG_X0 + LEG_IND + it.col * LEG_COLW : LEG_X0, LEG_Y0 + off + it.line * pitch + pitch / 2]);
  }
  return { pos, pitch };
}
var LEG_G = 0.1;
var LEG_M = 6;
var legCache = /* @__PURE__ */ new Map();
function legendAvg(gi) {
  const hit = legCache.get(gi);
  if (hit) return hit;
  const tc = gi * LEG_G, sc = sceneOf(tc);
  const acc = /* @__PURE__ */ new Map();
  for (let k = -LEG_M; k <= LEG_M; k++) {
    const tt = clamp((gi + k) * LEG_G, sceneStart(sc), sceneEnd(sc) - 1e-3);
    const L = legendItems(tt), { pos, pitch } = legendLayout(L);
    for (const it of L.items) {
      const [x, y] = pos.get(it.key);
      const a = acc.get(it.key);
      if (a) {
        a.x += x;
        a.y += y;
        a.p += pitch;
        a.n += 1;
        if (k === 0) a.it = it;
      } else acc.set(it.key, { x, y, p: pitch, n: 1, it });
    }
  }
  if (legCache.size > 64) legCache.clear();
  legCache.set(gi, acc);
  return acc;
}
var LEG_FIRST = /* @__PURE__ */ new Map();
function buildLegFirst() {
  LEG_FIRST.clear();
  for (const [cd, iv] of Object.entries(KEY_ON)) {
    const first = iv.find(([a]) => a >= PREVIEW);
    if (first && first[0] > PREVIEW + 0.5) LEG_FIRST.set(cd, first[0]);
  }
}
buildLegFirst();
var commOn = (t) => MINS.some((_, i) => minorityState(i, t) !== null);
var T_COMM0 = -1;
var tComm0 = () => T_COMM0 >= 0 ? T_COMM0 : T_COMM0 = Math.min(...MIN_T.map((ts) => ts[0]));
function legendAlpha(it, t) {
  if (it.code === "COMM") return sceneOf(t) === 0 ? 1 : smooth((t - tComm0()) / LEG_FADE);
  if (!it.code || it.code === "MIX") return it.code === "MIX" ? listedW("MIX", t) : 0;
  const g = LGROUPS[it.code];
  if (it.key.startsWith("g:") && g) return Math.max(listedW(it.code, t), ...g[0].map((k) => listedW(k, t)));
  if (it.key.startsWith("o:") && g) return Math.min(listedW(it.code, t), Math.max(...g[0].map((k) => listedW(k, t))));
  return listedW(it.code, t);
}
function drawLegend(c, t) {
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.fillStyle = PANEL_BG;
  c.fillRect(0, MAP_Y0, MAP_X0, MAP_H);
  c.fillStyle = PANEL_EDGE;
  c.fillRect(MAP_X0 - 2, MAP_Y0, 2, MAP_H);
  setFont(c, 24, 800);
  c.fillStyle = INK_SOFT;
  c.textBaseline = "alphabetic";
  spaced(c, TXT.legendTitle, LEG_X0, MAP_Y0 + 60, 2.2);
  const gi = Math.floor(t / LEG_G + 1e-9), u = clamp(t / LEG_G - gi, 0, 1);
  const sc = sceneOf(t);
  let A = legendAvg(gi), B = legendAvg(gi + 1);
  if (sceneOf((gi + 1) * LEG_G) !== sc) B = A;
  if (sceneOf(gi * LEG_G) !== sc) A = B;
  const keys = /* @__PURE__ */ new Set([...A.keys(), ...B.keys()]);
  for (const key of keys) {
    const a = A.get(key), b = B.get(key);
    const it = (u < 0.5 ? a || b : b || a).it;
    const pa = a ? [a.x / a.n, a.y / a.n, a.p / a.n] : null, pb = b ? [b.x / b.n, b.y / b.n, b.p / b.n] : null;
    const P = pa && pb ? pa.map((v, i) => v + (pb[i] - v) * u) : pa || pb;
    const al = legendAlpha(it, t) * hookAlpha(t);
    if (al <= 0.02) continue;
    const x0 = P[0], yc = MAP_Y0 + P[1], pitch = P[2];
    const fs = Math.min(25, pitch * 0.76), sw = Math.min(26, pitch * 0.76);
    const right = it.kind === 2 ? x0 + LEG_COLW - 8 : MAP_X0 - 18;
    c.textBaseline = "middle";
    c.textAlign = "left";
    const f0 = it.code && it.key.startsWith("c:") ? LEG_FIRST.get(it.code) : void 0;
    if (f0 !== void 0 && t >= f0 && t < f0 + 4.5) {
      const gm = smooth((t - f0) / 0.5) * (1 - smooth((t - f0 - 2.5) / 2));
      c.globalAlpha = al * gm * 0.85;
      c.fillStyle = "#f2cf6b";
      roundRect(c, x0 - 7, yc - pitch / 2 + 2, right - x0 + 14, pitch - 4, 7);
      c.fill();
    }
    c.globalAlpha = al;
    if (it.kind === 1) {
      setFont(c, fs, 800);
      c.fillStyle = INK_SOFT;
      fitSize(c, it.label, right - x0, fs, 800, 14);
      c.fillText(it.label, x0, yc);
      continue;
    }
    if (it.code === "COMM") {
      hatchSwatch(c, x0, yc - sw / 2, sw, INK_SOFT);
    } else if (it.code === "MIX") {
      c.save();
      c.beginPath();
      c.rect(x0, yc - sw / 2, sw, sw);
      c.clip();
      c.fillStyle = "#d9dde2";
      c.fillRect(x0, yc - sw / 2, sw, sw);
      c.strokeStyle = "#8a939e";
      c.lineWidth = sw / 6;
      for (let d = -sw; d < sw * 2; d += sw / 3) {
        c.beginPath();
        c.moveTo(x0 + d, yc - sw / 2);
        c.lineTo(x0 + d - sw, yc + sw / 2);
        c.stroke();
      }
      c.restore();
    } else {
      c.fillStyle = relCol(it.code);
      c.fillRect(x0, yc - sw / 2, sw, sw);
    }
    c.strokeStyle = "rgba(22,32,44,0.28)";
    c.lineWidth = 1.5;
    c.strokeRect(x0 + 0.75, yc - sw / 2 + 0.75, sw - 1.5, sw - 1.5);
    const tx = x0 + sw + 10;
    setFont(c, fs, 700);
    c.fillStyle = INK;
    fitSize(c, it.label, right - tx, fs, 700, 14);
    c.fillText(it.label, tx, yc + 1);
  }
  c.globalAlpha = 1;
  c.restore();
}
function drawBand(c, t) {
  const y = yearAt(t);
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.fillStyle = PANEL_BG;
  c.fillRect(0, BAND_Y, LW, LH - BAND_Y);
  c.fillStyle = PANEL_EDGE;
  c.fillRect(0, BAND_Y, LW, 2);
  c.fillStyle = RULE;
  c.fillRect(494, BAND_Y + 44, 2, 212);
  c.fillRect(1644, BAND_Y + 44, 2, 212);
  const lb = yearLabel(mapYearAt(t));
  setFont(c, 124, 900);
  const cell = Math.max(..."0123456789".split("").map((d) => c.measureText(d).width));
  const base = BAND_Y + 196;
  const xr = 56 + cell * 4;
  c.fillStyle = INK;
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  lb.num.split("").reverse().forEach((d, i) => c.fillText(d, xr - (i + 0.5) * cell, base));
  setFont(c, 40, 900);
  c.fillStyle = INK_SOFT;
  c.textAlign = "left";
  c.fillText(lb.era, xr + 12, base);
  drawWords(c, t);
  drawPanel(c, t);
  c.restore();
}
function drawEvents(c, t, cam) {
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.beginPath();
  c.rect(MAP_X0, MAP_Y0, MAP_W, MAP_H);
  c.clip();
  for (const w of IS_SHORT ? SHORT_WORDS : WORDS) {
    const places = w.ev || w.at;
    if (!places || t < w.t0 || t > w.t1 + 0.4) continue;
    const col = w.ev ? "#7a3b2e" : ACCENT;
    const dt = t - w.t0;
    const dotA = Math.min(smooth(dt / 0.25), smooth((w.t1 + 0.4 - t) / 0.4));
    for (const [ex, ey] of places) {
      const [sx, sy] = toScreen(cam, ex, ey);
      for (let k = 0; k < 2; k++) {
        const u = (dt - k * 0.5) / 1.6;
        if (u <= 0 || u >= 1) continue;
        const r = 14 + 86 * (1 - Math.pow(1 - u, 2.2)), a = Math.pow(1 - u, 1.3);
        c.globalAlpha = a * 0.7;
        c.strokeStyle = "rgba(255,255,255,0.95)";
        c.lineWidth = 9;
        c.beginPath();
        c.arc(sx, sy, r, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = a;
        c.strokeStyle = col;
        c.lineWidth = 4.5;
        c.beginPath();
        c.arc(sx, sy, r, 0, Math.PI * 2);
        c.stroke();
      }
      if (dotA > 0.01) {
        c.globalAlpha = dotA;
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(sx, sy, 11, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.arc(sx, sy, 7, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  c.restore();
}
var MINS = RL.minorities || [];
var MIN_T = MINS.map((m) => m.steps.map(([a]) => tOfYear(a)));
var MIN_PATHS = MINS.map((m) => m.polys.map((pts) => {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  let cx = 0, cy = 0, n = pts.length / 2, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    cx += pts[i];
    cy += pts[i + 1];
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { p, cx: cx / n, cy: cy / n, ext: Math.max(x1 - x0, y1 - y0) };
}));
function minorityState(i, t) {
  const m = MINS[i], ts = MIN_T[i];
  if (t < PREVIEW) {
    const last = m.steps[m.steps.length - 1][1];
    return last ? { col: relCol(last), prev: null, u: 1, a: 1 } : null;
  }
  let k = -1;
  for (let j = 0; j < ts.length; j++) if (t >= ts[j]) k = j;
  if (k < 0) return null;
  const code = m.steps[k][1], dt = t - ts[k];
  if (code === null) {
    const before = k > 0 ? m.steps[k - 1][1] : null;
    const a = 1 - smooth(dt / 1);
    return a > 0.01 && before ? { col: relCol(before), prev: null, u: 1, a } : null;
  }
  const prev = k > 0 ? m.steps[k - 1][1] : null;
  return { col: relCol(code), prev: prev ? relCol(prev) : null, u: smooth(dt / 1), a: prev ? 1 : smooth(dt / 1) };
}
var CANDS = [];
for (const r of [62, 96, 136, 182]) for (let k = 0; k < 16; k++) CANDS.push([Math.cos(k * Math.PI / 8) * r, Math.sin(k * Math.PI / 8) * r]);
var CLUSTER_PX = 30;
function overlap(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}
var orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
function segCross(s, u) {
  return orient(s[0], s[1], s[2], s[3], u[0], u[1]) * orient(s[0], s[1], s[2], s[3], u[2], u[3]) < 0 && orient(u[0], u[1], u[2], u[3], s[0], s[1]) * orient(u[0], u[1], u[2], u[3], s[2], s[3]) < 0;
}
function segBox(s, B) {
  let t0 = 0, t1 = 1;
  const dx = s[2] - s[0], dy = s[3] - s[1];
  for (const [p, q] of [[-dx, s[0] - B[0]], [dx, B[2] - s[0]], [-dy, s[1] - B[1]], [dy, B[3] - s[1]]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 0.05;
}
function leaders(x, y, w, h, pts) {
  const out = [];
  for (const [px, py] of pts) {
    const ex = px < x - w / 2 ? x - w / 2 - 4 : px > x + w / 2 ? x + w / 2 + 4 : px;
    const ey = py < y ? y - h / 2 + 2 : y + h / 2 - 2;
    const ux = px - ex, uy = py - ey, d = Math.hypot(ux, uy);
    if (d < 10) continue;
    out.push([ex, ey, px - ux / d * 8, py - uy / d * 8]);
  }
  return out;
}
var ME_LL = [28, 10, 60, 40];
var ME_BOX = (() => {
  const cs = [ee(ME_LL[0], ME_LL[1]), ee(ME_LL[0], ME_LL[3]), ee(ME_LL[2], ME_LL[1]), ee(ME_LL[2], ME_LL[3])];
  return [Math.min(...cs.map((p) => p[0])), Math.min(...cs.map((p) => p[1])), Math.max(...cs.map((p) => p[0])), Math.max(...cs.map((p) => p[1]))];
})();
var ME_OF = MIN_PATHS.map((qs) => {
  const cx = qs.reduce((s, q) => s + q.cx, 0) / qs.length, cy = qs.reduce((s, q) => s + q.cy, 0) / qs.length;
  return cx >= ME_BOX[0] && cx <= ME_BOX[2] && cy >= ME_BOX[1] && cy <= ME_BOX[3];
});
var inME = (i) => ME_OF[i];
var listW = (cam) => 1 - smooth((cam.S - 500) / 60);
var LIST_NAME = { "Jews IRQ": "Jews (Iraq)", "Jews YEM": "Jews (Yemen)" };
var ME_ROWS_MAX = (() => {
  const keys = /* @__PURE__ */ new Set();
  MINS.forEach((m, i) => {
    if (!ME_OF[i]) return;
    const end = (m.steps.find(([, c]) => c === null) || [3e3])[0], start = m.steps[0][0];
    if (start < 2025 && end > 1590) keys.add(m.group || m.name);
  });
  return Math.max(1, keys.size);
})();
var LIST_ROW = 25;
var LIST_HEAD = 36;
var LIST_PAD = 12;
var meCache = /* @__PURE__ */ new Map();
function meList(c, cam, rows, obst, avoid) {
  rows.sort((p, q) => p.pts.reduce((s, z) => s + z[1], 0) / p.pts.length - q.pts.reduce((s, z) => s + z[1], 0) / q.pts.length);
  setFont(c, 20 * US, 800);
  let w = 0;
  for (const r of rows) w = Math.max(w, c.measureText(r.n).width + 26);
  setFont(c, 16, 800);
  w = Math.max(w, spacedW(c, TXT.commTitle, 1.8));
  w += 2 * LIST_PAD;
  let h = LIST_HEAD + LIST_PAD;
  for (const r of rows) h += LIST_ROW * smooth(r.a * 1.5);
  const hRef = LIST_HEAD + LIST_PAD + LIST_ROW * ME_ROWS_MAX;
  const [bx0, by0] = toScreen(cam, ME_BOX[0], ME_BOX[1]), [bx1, by1] = toScreen(cam, ME_BOX[2], ME_BOX[3]);
  const key = cam.S.toFixed(2) + ":" + cam.cx.toFixed(4) + ":" + cam.cy.toFixed(4);
  let pos = meCache.get(key);
  if (!pos) {
    const my = (by0 + by1) / 2;
    const cands = [
      [bx0 - w / 2 - 70, my - hRef / 2],
      [bx0 - w / 2 - 70, by1 - hRef],
      [bx0 - w / 2 - 70, by0 - 20],
      [bx1 + w / 2 + 70, my - hRef / 2],
      [(bx0 + bx1) / 2, by1 + 40],
      [bx0 - w / 2 - 140, my - hRef / 2],
      [(bx0 + bx1) / 2 + w * 0.35, by1 + 40],
      [bx1 + w / 2 + 30, by1 + 20],
      [bx0 - w / 2 - 260, my - hRef / 2],
      [(bx0 + bx1) / 2 + w * 0.8, by1 + 40],
      [(bx0 + bx1) / 2 + w * 1.2, by1 + 60]
    ];
    let best = 1e9;
    pos = cands[0];
    octx.save();
    setMapTransform(octx, cam);
    const landFrac = (b) => {
      let n = 0, k = 0;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) {
        const x2 = b[0] + (i + 0.5) / 6 * (b[2] - b[0]), y = b[1] + (j + 0.5) / 7 * (b[3] - b[1]);
        k++;
        if (octx.isPointInPath(landPath, x2 * KS, y * KS, "evenodd")) n++;
      }
      return n / k;
    };
    for (const [x2, top2] of cands) {
      const box = [x2 - w / 2 - 10, top2, x2 + w / 2 + 10, top2 + hRef];
      let cost = Math.hypot(x2 - (bx0 + bx1) / 2, top2 + hRef / 2 - (by0 + by1) / 2) / 600;
      for (const B of obst) cost += 3 * (B[4] ?? 1) * overlap(box, B) / ((w + 20) * hRef);
      for (const [px, py] of avoid) if (px > box[0] - 12 && px < box[2] + 12 && py > box[1] - 12 && py < box[3] + 12) cost += 0.8;
      cost += 1.2 * landFrac(box);
      if (box[0] < MAP_X0 + 8 || box[2] > LW - 8 || box[1] < MAP_Y0 + 8 || box[3] > MAP_Y0 + MAP_H - 8) cost += 5;
      if (cost < best) {
        best = cost;
        pos = [x2, top2];
      }
    }
    octx.restore();
    meCache.set(key, pos);
  }
  const [x, top] = pos;
  let yy = top + LIST_HEAD;
  for (const r of rows) {
    const rh = LIST_ROW * smooth(r.a * 1.5);
    r.y = yy + rh / 2;
    r.h = rh;
    yy += rh;
  }
  return {
    x,
    y: top + h / 2,
    w,
    h,
    names: rows.map((r) => ({ n: r.n, a: r.a })),
    a: Math.max(...rows.map((r) => r.a)),
    pts: rows.flatMap((r) => r.pts),
    i: -1,
    rows,
    top
  };
}
function rowLeaders(L, r, rows) {
  const out = [];
  for (const [px, py] of r.pts) {
    const right = px > L.x;
    const ex = right ? L.x + L.w / 2 + 10 : L.x - L.w / 2 - 10, ey = r.y;
    const ux = px - ex, uy = py - ey, d = Math.hypot(ux, uy);
    if (d < 12) continue;
    out.push([ex, ey, px - ux / d * 7, py - uy / d * 7]);
  }
  return out;
}
function hatchSwatch(c, x, y, sw, col) {
  c.save();
  c.beginPath();
  c.rect(x, y, sw, sw);
  c.clip();
  c.fillStyle = "#e9e6df";
  c.fillRect(x, y, sw, sw);
  c.strokeStyle = col;
  c.lineWidth = Math.max(2, sw / 7);
  for (let d = -sw; d < sw * 2; d += sw / 3) {
    c.beginPath();
    c.moveTo(x + d - sw, y + sw);
    c.lineTo(x + d, y);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = col;
  c.lineWidth = 2;
  c.strokeRect(x + 1, y + 1, sw - 2, sw - 2);
}
function drawMeList(c, L) {
  const rows = L.rows;
  for (const r of rows) {
    if (r.a <= 0.02) continue;
    c.globalAlpha = r.a;
    for (const s of rowLeaders(L, r, rows)) {
      c.strokeStyle = "rgba(250,249,246,0.85)";
      c.lineWidth = 4.5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(s[2], s[3]);
      c.stroke();
      c.strokeStyle = "rgba(22,32,44,0.8)";
      c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(s[2], s[3]);
      c.stroke();
    }
  }
  c.globalAlpha = L.a;
  card(c, L.x - L.w / 2 - 10, L.top, L.w + 20, L.h, 12);
  setFont(c, 16, 800);
  c.fillStyle = INK_SOFT;
  c.textBaseline = "alphabetic";
  spaced(c, TXT.commTitle, L.x - L.w / 2 + LIST_PAD - 10, L.top + 26, 1.8);
  for (const r of rows) {
    if (r.a <= 0.02 || r.h < 4) continue;
    c.globalAlpha = r.a;
    const x0 = L.x - L.w / 2 + LIST_PAD - 10;
    hatchSwatch(c, x0, r.y - 8, 16, r.col);
    setFont(c, 20 * US, 800);
    c.fillStyle = INK;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(r.n, x0 + 24, r.y + 1);
  }
  c.textBaseline = "alphabetic";
  c.globalAlpha = 1;
}
function layoutMinorities(c, t, cam, labs) {
  const groups = /* @__PURE__ */ new Map();
  const meRows = /* @__PURE__ */ new Map();
  MINS.forEach((m, i) => {
    const st = minorityState(i, t);
    if (!st) return;
    const pts = MIN_PATHS[i].map((q) => toScreen(cam, q.cx, q.cy));
    const ax = pts.reduce((s, p) => s + p[0], 0) / pts.length, ay = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (ax < MAP_X0 - 200 || ax > LW + 200 || ay < MAP_Y0 - 200 || ay > MAP_Y0 + MAP_H + 200) return;
    if (IS_SHORT && (SP.mins && !SP.mins.includes(m.name) || ax < 20 || ax > LW - 20 || ay < MAP_Y0 + 20 || ay > MAP_Y0 + MAP_H - 20)) return;
    const gk = m.group || m.name;
    const lw = !IS_SHORT && inME(i) ? listW(cam) : 0;
    if (lw > 0) {
      const r = meRows.get(gk);
      if (r) {
        r.pts.push(...pts);
        r.a = Math.max(r.a, st.a * lw);
      } else meRows.set(gk, { n: LIST_NAME[gk] || m.name, a: st.a * lw, col: st.u < 0.5 && st.prev ? st.prev : st.col, pts: pts.slice() });
      if (lw > 0.999) return;
    }
    const aI = st.a * (1 - lw);
    const g = groups.get(gk);
    if (g) {
      g.pts.push(...pts);
      g.a = Math.max(g.a, aI);
      g.ax = g.pts.reduce((s, p) => s + p[0], 0) / g.pts.length;
      g.ay = g.pts.reduce((s, p) => s + p[1], 0) / g.pts.length;
      return;
    }
    groups.set(gk, { name: m.name, a: aI, pts, ax, ay, pref: m.call, i });
  });
  const gs = [...groups.values()];
  const cl = gs.map((_, k) => k);
  const root = (k) => cl[k] === k ? k : cl[k] = root(cl[k]);
  for (let p = 0; p < gs.length; p++) for (let q = p + 1; q < gs.length; q++) {
    if (Math.hypot(gs[p].ax - gs[q].ax, gs[p].ay - gs[q].ay) < CLUSTER_PX * US) cl[root(p)] = root(q);
  }
  const clusters = /* @__PURE__ */ new Map();
  gs.forEach((g, k) => {
    const r = root(k);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(g);
  });
  const lh = 26 * US;
  setFont(c, 23 * US, 800);
  const items = [...clusters.values()].map((mem) => {
    mem.sort((p, q) => p.ay - q.ay);
    const pts = mem.flatMap((g) => g.pts);
    const first = mem.reduce((p, q) => q.i < p.i ? q : p);
    return {
      names: mem.map((g) => ({ n: g.name, a: g.a })),
      pts,
      a: Math.max(...mem.map((g) => g.a)),
      i: first.i,
      ax: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      ay: pts.reduce((s, p) => s + p[1], 0) / pts.length,
      pref: first.pref,
      w: Math.max(...mem.map((g) => c.measureText(g.name).width)),
      h: lh * mem.length
    };
  });
  items.sort((p, q) => q.names.length - p.names.length || p.i - q.i);
  const obst = labs.map((L) => [L.x - L.w / 2 - 6, L.y - L.h / 2 - 4, L.x + L.w / 2 + 6, L.y + L.h / 2 + 4, L.a]);
  for (const g of items) for (const [px, py] of g.pts) obst.push([px - 9, py - 9, px + 9, py + 9, 1]);
  const placed = [], placedLines = [];
  const out = [];
  if (meRows.size) {
    const L = meList(c, cam, [...meRows.values()], obst, items.flatMap((g) => g.pts));
    placed.push([L.x - L.w / 2 - 10, L.top, L.x + L.w / 2 + 10, L.top + L.h, 1]);
    for (const r of L.rows) placedLines.push(...rowLeaders(L, r, L.rows));
    out.push(L);
  }
  for (const g of items) {
    const cands = [[g.pref[0], g.pref[1], 0]];
    for (const [ux, uy] of CANDS) cands.push([ux * US, uy * US, 0.2 + Math.hypot(ux * US - g.pref[0], uy * US - g.pref[1]) / 1400]);
    let best = 1e9, bx = g.ax + g.pref[0], by = g.ay + g.pref[1];
    const area = (g.w + 12) * (g.h + 6);
    for (const [dx, dy, pen] of cands) {
      const x2 = g.ax + dx, y2 = g.ay + dy;
      const box = [x2 - g.w / 2 - 6, y2 - g.h / 2 - 3, x2 + g.w / 2 + 6, y2 + g.h / 2 + 3];
      let cost = pen;
      for (const B of obst) cost += 3 * B[4] * overlap(box, B) / area;
      for (const B of placed) cost += 6 * overlap(box, B) / area;
      if (box[0] < MAP_X0 + 6 || box[2] > LW - 6 || box[1] < MAP_Y0 + 6 || box[3] > MAP_Y0 + MAP_H - 6) cost += 4;
      for (const s of leaders(x2, y2, g.w, g.h, g.pts)) {
        cost += Math.hypot(s[2] - s[0], s[3] - s[1]) / 500;
        for (const u of placedLines) if (segCross(s, u)) cost += 1.5;
        for (const B of placed) if (segBox(s, B)) cost += 1.5;
        for (const L of labs) if (segBox(s, [L.x - L.w / 2, L.y - L.h / 2, L.x + L.w / 2, L.y + L.h / 2])) cost += 0.6 * L.a;
      }
      if (cost < best - 1e-6) {
        best = cost;
        bx = x2;
        by = y2;
      }
    }
    const x = clamp(bx, MAP_X0 + g.w / 2 + 8, LW - g.w / 2 - 8), y = clamp(by, MAP_Y0 + g.h / 2 + 8, MAP_Y0 + MAP_H - g.h / 2 - 8);
    placed.push([x - g.w / 2 - 6, y - g.h / 2 - 3, x + g.w / 2 + 6, y + g.h / 2 + 3, g.a]);
    placedLines.push(...leaders(x, y, g.w, g.h, g.pts));
    out.push({ x, y, w: g.w, h: g.h, names: g.names, a: g.a, pts: g.pts, i: g.i });
  }
  return out;
}
function drawMinorityShapes(c, t, cam) {
  c.save();
  MINS.forEach((m, i) => {
    const st = minorityState(i, t);
    if (!st || IS_SHORT && SP.mins && !SP.mins.includes(m.name)) return;
    for (const q of MIN_PATHS[i]) {
      const ext = q.ext * cam.S;
      const [sx, sy] = toScreen(cam, q.cx, q.cy);
      if (sx < -60 || sx > LW + 60 || sy < MAP_Y0 - 60 || sy > MAP_Y0 + MAP_H + 60) continue;
      const dotA = 1 - smooth((ext - 7) / 8);
      const hatch = (col, a) => {
        if (a <= 0.01) return;
        const e = ext + 6;
        c.save();
        setMapTransform(c, cam);
        c.clip(q.p);
        c.setTransform(KS, 0, 0, KS, 0, 0);
        c.globalAlpha = st.a * a;
        c.strokeStyle = col;
        c.lineWidth = 3.4;
        c.lineCap = "butt";
        c.beginPath();
        for (let d = -2 * e; d <= 2 * e; d += 8.5) {
          c.moveTo(sx + d - e, sy + e);
          c.lineTo(sx + d + e, sy - e);
        }
        c.stroke();
        c.restore();
        setMapTransform(c, cam);
        c.globalAlpha = st.a * a;
        c.strokeStyle = col;
        c.lineWidth = 2.8 / cam.S;
        c.lineJoin = "round";
        c.stroke(q.p);
      };
      if (st.prev && st.u < 1) {
        hatch(st.prev, 1 - st.u);
        hatch(st.col, st.u);
      } else hatch(st.col, 1);
      setMapTransform(c, cam);
      c.globalAlpha = st.a * 0.75;
      c.strokeStyle = INK;
      c.lineWidth = 1.1 / cam.S;
      c.lineJoin = "round";
      c.stroke(q.p);
      if (dotA > 0.01) {
        c.setTransform(KS, 0, 0, KS, 0, 0);
        c.globalAlpha = st.a * dotA;
        c.fillStyle = INK;
        c.beginPath();
        c.arc(sx, sy, 6.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = st.prev && st.u < 1 ? st.prev : st.col;
        c.beginPath();
        c.arc(sx, sy, 4.8, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
  c.restore();
}
var callBoxes = (calls) => calls.filter((L) => L.a > 0.05).map((L) => L.rows ? [L.x - L.w / 2 - 10, L.top, L.x + L.w / 2 + 10, L.top + L.h] : [L.x - L.w / 2 - 6, L.y - L.h / 2 - 3, L.x + L.w / 2 + 6, L.y + L.h / 2 + 3]);
function drawCallouts(c, calls) {
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.beginPath();
  c.rect(MAP_X0, MAP_Y0, MAP_W, MAP_H);
  c.clip();
  for (const L of calls) {
    if (L.rows) continue;
    c.globalAlpha = L.a;
    for (const s of leaders(L.x, L.y, L.w, L.h, L.pts)) {
      c.strokeStyle = "rgba(250,249,246,0.85)";
      c.lineWidth = 5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(s[2], s[3]);
      c.stroke();
      c.strokeStyle = "rgba(22,32,44,0.85)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(s[2], s[3]);
      c.stroke();
    }
  }
  for (const L of calls) if (L.rows) drawMeList(c, L);
  const lh = 26 * US;
  for (const L of calls) {
    if (L.rows) continue;
    setFont(c, 23 * US, 800);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    L.names.forEach((nm, k) => {
      const yy = L.y - L.h / 2 + lh * (k + 0.5);
      c.globalAlpha = nm.a;
      c.strokeStyle = "rgba(250,249,246,0.9)";
      c.lineWidth = 6;
      c.strokeText(nm.n, L.x, yy);
      c.fillStyle = "#1b2430";
      c.fillText(nm.n, L.x, yy);
    });
  }
  c.restore();
}
function softShadow(c, shape, blur, dy, a) {
  const n = 8, ga = c.globalAlpha;
  c.save();
  c.fillStyle = "rgb(22,32,44)";
  c.translate(0, dy);
  for (let i = n; i >= 1; i--) {
    c.globalAlpha = ga * a * 0.62 / n;
    shape(blur * 0.9 * i / n);
    c.fill();
  }
  c.restore();
}
function card(c, x0, y0, w, h, r) {
  softShadow(c, (e) => roundRect(c, x0 - e, y0 - e, w + 2 * e, h + 2 * e, r + e), 18, 4, 0.22);
  c.fillStyle = PANEL_BG;
  roundRect(c, x0, y0, w, h, r);
  c.fill();
  c.strokeStyle = PANEL_EDGE;
  c.lineWidth = 1.5;
  roundRect(c, x0, y0, w, h, r);
  c.stroke();
}
var CHAPS = IS_SHORT ? [] : RL.chapters || [];
var CH_IN = 0.45;
var CH_END = 3.9;
var CH_OUT = 0.6;
var chapterKick = (i) => TXT.chapter + " " + (i + 1) + " \xB7 " + CHAPS[i][1].toUpperCase();
function chapterAlpha(i, t) {
  const t0 = CHAPS[i][0];
  if (t < t0 || t > t0 + CH_END) return 0;
  return Math.min(smooth((t - t0) / CH_IN), smooth((t0 + CH_END - t) / CH_OUT));
}
function chapterBox(c, i) {
  setFont(c, 52, 850);
  const w1 = c.measureText(CHAPS[i][2]).width;
  setFont(c, 22, 800);
  const w2 = spacedW(c, chapterKick(i), 2.4);
  const w = Math.max(w1, w2) + 72;
  return [MAP_CX - w / 2, MAP_Y0 + 24, MAP_CX + w / 2, MAP_Y0 + 24 + 116];
}
function drawChapters(c, t) {
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  CHAPS.forEach((ch, i) => {
    const a = chapterAlpha(i, t);
    if (a <= 0.01) return;
    const [x0, y0, x1, y1] = chapterBox(c, i);
    const dy = -(1 - smooth((t - ch[0]) / CH_IN)) * 14;
    c.globalAlpha = a;
    card(c, x0, y0 + dy, x1 - x0, y1 - y0, 16);
    setFont(c, 22, 800);
    c.fillStyle = ACCENT;
    c.textBaseline = "alphabetic";
    const kw = spacedW(c, chapterKick(i), 2.4);
    spaced(c, chapterKick(i), MAP_CX - kw / 2, y0 + dy + 42, 2.4);
    setFont(c, 52, 850);
    c.fillStyle = INK;
    c.textAlign = "center";
    c.fillText(ch[2], MAP_CX, y0 + dy + 97);
    c.textAlign = "left";
  });
  c.globalAlpha = 1;
  c.restore();
}
var TREE_X0 = MAP_X0 + 24;
var TREE_Y1 = MAP_Y0 + MAP_H - 24;
var TREE_P = 34;
var TREE_IND = 30;
var TREE_SW = 22;
var treeBoxes = /* @__PURE__ */ new Map();
function treeBox(c, w) {
  let b = treeBoxes.get(w);
  if (b) return b;
  let wd = 0;
  for (const [d, code, name, nw] of w.tree) {
    setFont(c, 24, nw ? 800 : 650);
    let rw = 20 + d * TREE_IND + (code ? TREE_SW + 11 : 0) + c.measureText(name).width + 20;
    if (nw) {
      setFont(c, 16, 800);
      rw += 14 + spacedW(c, TXT.treeNew, 1.6) + 12;
    }
    wd = Math.max(wd, rw);
  }
  setFont(c, 20, 800);
  wd = Math.max(wd, spacedW(c, TXT.treeTitle, 2.2) + 40);
  const h = 52 + w.tree.length * TREE_P + 12;
  b = [TREE_X0, TREE_Y1 - h, TREE_X0 + wd, TREE_Y1];
  treeBoxes.set(w, b);
  return b;
}
function drawTrees(c, t) {
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  for (const w of WORDS) {
    if (!w.tree) continue;
    const a = wordAlpha(w, t);
    if (a <= 0.01) continue;
    const [x0, by0, x1, y1] = treeBox(c, w);
    const dy = (1 - smooth((t - w.t0) / 0.35)) * 12, y0 = by0 + dy;
    c.globalAlpha = a;
    card(c, x0, y0, x1 - x0, y1 - by0, 14);
    setFont(c, 20, 800);
    c.fillStyle = ACCENT;
    c.textBaseline = "alphabetic";
    spaced(c, TXT.treeTitle, x0 + 20, y0 + 36, 2.2);
    const rows = w.tree, yc = (i) => y0 + 52 + i * TREE_P + TREE_P / 2;
    const xs = (d) => x0 + 20 + d * TREE_IND;
    c.strokeStyle = "rgba(22,32,44,0.38)";
    c.lineWidth = 2;
    c.lineCap = "round";
    rows.forEach(([d], i) => {
      if (d === 0) return;
      let p = i - 1;
      while (p >= 0 && rows[p][0] !== d - 1) p--;
      if (p < 0) return;
      const px = xs(d - 1) + TREE_SW / 2;
      c.beginPath();
      c.moveTo(px, yc(p) + TREE_SW / 2 + 2);
      c.lineTo(px, yc(i));
      c.lineTo(xs(d) - 5, yc(i));
      c.stroke();
    });
    rows.forEach(([d, code, name, nw], i) => {
      const x = xs(d), y = yc(i);
      if (nw) {
        c.fillStyle = "rgba(242,207,107,0.85)";
        roundRect(c, x - 7, y - TREE_P / 2 + 2, x1 - 10 - (x - 7), TREE_P - 4, 7);
        c.fill();
      }
      let tx = x;
      if (code) {
        c.fillStyle = relCol(code);
        c.fillRect(x, y - TREE_SW / 2, TREE_SW, TREE_SW);
        c.strokeStyle = "rgba(22,32,44,0.28)";
        c.lineWidth = 1.5;
        c.strokeRect(x + 0.75, y - TREE_SW / 2 + 0.75, TREE_SW - 1.5, TREE_SW - 1.5);
        tx += TREE_SW + 11;
      }
      setFont(c, 24, nw ? 800 : 650);
      c.fillStyle = INK;
      c.textBaseline = "middle";
      c.textAlign = "left";
      c.fillText(name, tx, y + 1);
      if (nw) {
        setFont(c, 16, 800);
        c.fillStyle = "#5c4712";
        spaced(c, TXT.treeNew, x1 - 22, y + 1, 1.6, "right");
      }
      c.textBaseline = "alphabetic";
    });
  }
  c.globalAlpha = 1;
  c.restore();
}
function uiBoxes(c, t) {
  if (IS_SHORT || FULL || !HUD) return [];
  const out = [];
  CHAPS.forEach((ch, i) => {
    if (chapterAlpha(i, t) > 0.25) out.push(chapterBox(c, i));
  });
  for (const w of WORDS) if (w.tree && wordAlpha(w, t) > 0.25) out.push(treeBox(c, w));
  return out;
}
var INS_R = 150;
var INS_MAXS = 560;
var INS_GAP = 16;
var INS_D = Math.ceil((2 * INS_R + 8) * KS);
var insRelCv = document.createElement("canvas");
insRelCv.width = INS_D;
insRelCv.height = INS_D;
var insRctx = insRelCv.getContext("2d", { willReadFrequently: true });
var insImg = insRctx.createImageData(INS_D, INS_D);
var INS_BUF = new Uint32Array(insImg.data.buffer);
var insCv = document.createElement("canvas");
insCv.width = INS_D;
insCv.height = INS_D;
var ictx = insCv.getContext("2d", { willReadFrequently: true });
var insSpan = (w) => [w.t0 + 0.25, Math.min(w.t0 + 4.5, w.t1 + 0.25)];
var insPlace = /* @__PURE__ */ new Map();
function boxCircle(b, x, y, r) {
  const qx = clamp(x, b[0], b[2]), qy = clamp(y, b[1], b[3]);
  return (qx - x) ** 2 + (qy - y) ** 2 < r * r;
}
function placeInsets(c, w) {
  let pl = insPlace.get(w);
  if (pl) return pl;
  const places = w.ev || w.at, R = INS_R;
  const [ts, te] = insSpan(w);
  const cam = camAt(ts);
  const pts = places.map(([ex, ey]) => toScreen(cam, ex, ey));
  const labsP = layoutLabels(c, ts, cam, uiBoxes(c, ts));
  const callsP = layoutMinorities(c, ts, cam, labsP);
  const soft = callBoxes(callsP.filter((L) => !L.rows)).concat(
    labsP.map((L) => [L.x - L.w / 2, L.y - L.h / 2, L.x + L.w / 2, L.y + L.h / 2])
  );
  const hard = callsP.filter((L) => L.rows && L.a > 0.05).map((L) => [L.x - L.w / 2 - 10, L.top, L.x + L.w / 2 + 10, L.top + L.h]);
  for (const L of callsP) if (L.rows && L.a > 0.05) for (const [px, py] of L.pts) soft.push([px - 14, py - 14, px + 14, py + 14]);
  if (w.tree) hard.push(treeBox(c, w));
  CHAPS.forEach((ch, i) => {
    if (ch[0] < te && ch[0] + CH_END > ts) hard.push(chapterBox(c, i));
  });
  octx.save();
  setMapTransform(octx, cam);
  const landAt = (x, y) => octx.isPointInPath(landPath, x * KS, y * KS, "evenodd") ? 1 : 0;
  const out = [];
  pts.forEach(([sx, sy]) => {
    let best = null, bs = 1e9;
    for (const D of [R + 90, R + 140, R + 200, R + 270, R + 340]) {
      for (let k = 0; k < 16; k++) {
        const g = k / 16 * Math.PI * 2;
        const x = sx + Math.cos(g) * D, y = sy + Math.sin(g) * D;
        if (x - R < MAP_X0 + INS_GAP || x + R > LW - INS_GAP || y - R < MAP_Y0 + INS_GAP || y + R > MAP_Y0 + MAP_H - INS_GAP) continue;
        if (hard.some((b) => boxCircle([b[0] - 10, b[1] - 10, b[2] + 10, b[3] + 10], x, y, R + 6))) continue;
        if (pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < (R + 34) ** 2)) continue;
        if (out.some((o) => o.length && (sx + o[0] - x) ** 2 + (sy + o[1] - y) ** 2 < (2 * R + 24) ** 2)) continue;
        let land = 0, n = 0;
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          if (i * i + j * j > 10) continue;
          land += landAt(x + i * R / 3.2, y + j * R / 3.2);
          n++;
        }
        const hits = soft.filter((b) => boxCircle(b, x, y, R + 4)).length;
        const sc = land / n * 3 + hits * 0.6 + (D - R - 90) / 110;
        if (sc < bs) {
          bs = sc;
          best = [x - sx, y - sy];
        }
      }
    }
    out.push(best || []);
  });
  octx.restore();
  insPlace.set(w, out);
  return out;
}
function paintInset(t, y, cam, ex, ey, z, col) {
  const S2 = cam.S * z, D = INS_D / KS, h = D / 2;
  const camP = { cx: ex, cy: ey, S: S2 };
  paintReligion(camP, y, Math.round(MAP_CX * KS - INS_D / 2), Math.round(MAP_H / 2 * KS - INS_D / 2), INS_D, INS_D, INS_BUF);
  insRctx.putImageData(insImg, 0, 0);
  const c = ictx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, INS_D, INS_D);
  c.save();
  c.beginPath();
  c.arc(INS_D / 2, INS_D / 2, INS_R * KS, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = SEA;
  c.fillRect(0, 0, INS_D, INS_D);
  const T = (cc) => cc.setTransform(KS * S2, 0, 0, KS * S2, KS * (h - ex * S2), KS * (h - ey * S2));
  T(c);
  c.fillStyle = LAND;
  c.fill(landPath, "evenodd");
  c.save();
  c.clip(landPath, "evenodd");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(insRelCv, 0, 0);
  c.restore();
  T(c);
  c.lineJoin = "round";
  c.lineCap = "round";
  c.fillStyle = SEA;
  c.fill(lakePath, "evenodd");
  c.strokeStyle = COAST;
  c.lineWidth = 1.6 / S2;
  c.stroke(landPath);
  c.stroke(lakePath);
  if (!NOMIN) drawMinorityShapes(c, t, { cx: ex + (MAP_CX - h) / S2, cy: ey + (MAP_Y0 + MAP_H / 2 - h) / S2, S: S2 });
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.globalAlpha = 1;
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(h, h, 9, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = col;
  c.beginPath();
  c.arc(h, h, 6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
function drawInsets(c, t, cam) {
  if (IS_SHORT || cam.S > INS_MAXS) return;
  const y = yearAt(t);
  for (const w of WORDS) {
    if (!w.zoom) continue;
    const [ts, te] = insSpan(w);
    if (t < ts || t > te) continue;
    const pl = placeInsets(c, w);
    const e = smooth((t - ts) / 0.45), a = Math.min(smooth((t - ts) / 0.3), smooth((te - t) / 0.4));
    if (a <= 0.01) continue;
    const col = w.ev ? "#7a3b2e" : ACCENT, z = w.zoom;
    const places = w.ev || w.at;
    places.forEach(([ex, ey], k) => {
      if (!pl[k] || !pl[k].length) return;
      const [sx, sy] = toScreen(cam, ex, ey);
      const rf = Math.max(10, INS_R / z), r = rf + (INS_R - rf) * e;
      const cx = sx + pl[k][0] * e, cy = sy + pl[k][1] * e;
      paintInset(t, y, cam, ex, ey, z, col);
      c.save();
      c.setTransform(KS, 0, 0, KS, 0, 0);
      c.beginPath();
      c.rect(MAP_X0, MAP_Y0, MAP_W, MAP_H);
      c.clip();
      c.globalAlpha = a;
      const dx = cx - sx, dy = cy - sy, L = Math.hypot(dx, dy);
      if (L > r - rf + 2) {
        const phi = Math.atan2(dy, dx), al = Math.acos(clamp((rf - r) / L, -1, 1));
        const p = [phi + al, phi - al].map((g) => [sx + rf * Math.cos(g), sy + rf * Math.sin(g), cx + r * Math.cos(g), cy + r * Math.sin(g)]);
        c.fillStyle = "rgba(255,255,255,0.22)";
        c.beginPath();
        c.moveTo(p[0][0], p[0][1]);
        c.lineTo(p[0][2], p[0][3]);
        c.lineTo(p[1][2], p[1][3]);
        c.lineTo(p[1][0], p[1][1]);
        c.closePath();
        c.fill();
        for (const q of p) {
          c.strokeStyle = "rgba(255,255,255,0.9)";
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(q[0], q[1]);
          c.lineTo(q[2], q[3]);
          c.stroke();
          c.strokeStyle = "rgba(22,32,44,0.55)";
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(q[0], q[1]);
          c.lineTo(q[2], q[3]);
          c.stroke();
        }
      }
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(sx, sy, rf, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "rgba(22,32,44,0.6)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(sx, sy, rf, 0, Math.PI * 2);
      c.stroke();
      softShadow(c, (e2) => {
        c.beginPath();
        c.arc(cx, cy, r + 5 + e2, 0, Math.PI * 2);
      }, 22, 5, 0.35);
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(cx, cy, r + 5, 0, Math.PI * 2);
      c.fill();
      const k2 = r / INS_R;
      c.drawImage(insCv, cx - INS_D / KS / 2 * k2, cy - INS_D / KS / 2 * k2, INS_D / KS * k2, INS_D / KS * k2);
      c.strokeStyle = "rgba(22,32,44,0.55)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, r + 5, 0, Math.PI * 2);
      c.stroke();
      if (e > 0.98) {
        setFont(c, 19, 800);
        const lab = z + "\xD7", lw = c.measureText(lab).width + 18;
        const lx = cx + r * 0.62, ly = cy + r * 0.74;
        c.fillStyle = "rgba(255,255,255,0.95)";
        roundRect(c, lx - lw / 2, ly - 14, lw, 28, 14);
        c.fill();
        c.strokeStyle = "rgba(22,32,44,0.3)";
        c.lineWidth = 1.2;
        c.stroke();
        c.fillStyle = INK;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(lab, lx, ly + 1);
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
      }
      c.restore();
    });
  }
}
var RC_N = 5;
var RC_M = 48;
var RC_GAP = 28;
var RC_TOP = 132;
var RC_W = Math.floor((LW - 2 * RC_M - (RC_N - 1) * RC_GAP) / RC_N);
var RC_Y0 = -1.307;
var RC_Y1 = 1.033;
var RC_S = RC_W / (2 * XR);
var RC_H = Math.round((RC_Y1 - RC_Y0) * RC_S);
var recapCvs = null;
function recapMaps() {
  if (recapCvs) return recapCvs;
  const SS = 2, PW = Math.round(RC_W * KS * SS), PH = Math.round(RC_H * KS * SS);
  const tmp = document.createElement("canvas");
  tmp.width = PW;
  tmp.height = PH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  const img = tctx.createImageData(PW, PH), buf = new Uint32Array(img.data.buffer);
  const my = (RC_Y0 + RC_Y1) / 2;
  recapCvs = TXT.recap.map(([yr]) => {
    paintReligion({ cx: 0, cy: my, S: RC_S * SS }, yr, Math.round(MAP_CX * KS - PW / 2), Math.round(MAP_H / 2 * KS - PH / 2), PW, PH, buf);
    tctx.putImageData(img, 0, 0);
    const cv = document.createElement("canvas");
    cv.width = Math.round(RC_W * KS);
    cv.height = Math.round(RC_H * KS);
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.fillStyle = SEA;
    c.fillRect(0, 0, cv.width, cv.height);
    const T = () => c.setTransform(KS * RC_S, 0, 0, KS * RC_S, KS * RC_W / 2, KS * (RC_H / 2 - my * RC_S));
    T();
    c.fillStyle = LAND;
    c.fill(landPath, "evenodd");
    c.save();
    c.clip(landPath, "evenodd");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(tmp, 0, 0, PW, PH, 0, 0, cv.width, cv.height);
    c.restore();
    T();
    c.fillStyle = SEA;
    c.fill(lakePath, "evenodd");
    c.strokeStyle = COAST;
    c.lineWidth = 0.9 / RC_S;
    c.lineJoin = "round";
    c.stroke(landPath);
    return cv;
  });
  return recapCvs;
}
function drawRecap(c, t) {
  if (t < RECAP_T0 - 0.3) return;
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.globalAlpha = 0.93 * smooth((t - RECAP_T0 + 0.3) / 0.7);
  c.fillStyle = PANEL_BG;
  c.fillRect(0, 0, LW, BAND_Y);
  const maps = recapMaps(), labs = TXT.recap;
  c.globalAlpha = smooth((t - RECAP_T0) / 0.5);
  setFont(c, 25, 800);
  c.fillStyle = INK_SOFT;
  c.textBaseline = "alphabetic";
  spaced(c, TXT.recapTitle, (LW - spacedW(c, TXT.recapTitle, 2.2)) / 2, 50, 2.2);
  maps.forEach((cv, i) => {
    const a = smooth((t - RECAP_T0 - 0.1 - i * 0.16) / 0.5);
    if (a <= 0.01) return;
    const x = RC_M + i * (RC_W + RC_GAP), y0 = RC_TOP + (1 - a) * 14;
    c.globalAlpha = a;
    c.fillStyle = "#ffffff";
    roundRect(c, x - 4, y0 - 4, RC_W + 8, RC_H + 8, 10);
    c.fill();
    c.strokeStyle = PANEL_EDGE;
    c.lineWidth = 1.5;
    c.stroke();
    c.save();
    roundRect(c, x, y0, RC_W, RC_H, 7);
    c.clip();
    c.drawImage(cv, x, y0, RC_W, RC_H);
    c.restore();
    setFont(c, 34, 850);
    c.fillStyle = INK;
    c.textAlign = "center";
    c.fillText(labs[i][1], x + RC_W / 2, y0 - 18);
    c.textAlign = "left";
  });
  c.globalAlpha = 1;
  c.restore();
}
var fadeCv = null;
function fadeLayer() {
  if (!fadeCv) {
    fadeCv = document.createElement("canvas");
    fadeCv.width = W;
    fadeCv.height = H;
  }
  const c = fadeCv.getContext("2d", { willReadFrequently: true });
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  return c;
}
var PROFILE = !!window.__profile;
async function renderTime(t) {
  const y = yearAt(t);
  const cam = camAt(t);
  const t0 = performance.now();
  landLayers(cam);
  const t1 = performance.now();
  paintReligion(cam, mapYearAt(t));
  const t2 = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(baseCv, 0, 0);
  ctx.save();
  setMapTransform(ctx, cam);
  ctx.clip(landPath, "evenodd");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(relCv, 0, MAP_Y0 * KS);
  ctx.restore();
  ctx.drawImage(overCv, 0, 0);
  const ha = hookAlpha(t), lay = ha < 1 ? fadeLayer() : ctx;
  if (ha > 0 && !NOMIN) drawMinorityShapes(lay, t, cam);
  drawEvents(ctx, t, cam);
  const t3 = performance.now();
  const calls = NOMIN || ha <= 0 ? [] : layoutMinorities(ctx, t, cam, layoutLabels(ctx, t, cam));
  if (ha > 0) {
    if (!NOLAB) drawLabels(lay, t, cam, void 0, callBoxes(calls));
    if (!NOMIN) drawCallouts(lay, calls);
  }
  if (lay !== ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = ha;
    ctx.drawImage(fadeCv, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (HUD && !FULL) {
    drawInsets(ctx, t, cam);
    drawTrees(ctx, t);
    drawChapters(ctx, t);
  }
  const t4 = performance.now();
  if (HUD) drawBand(ctx, t);
  if (HUD && KEYBAR) drawLegend(ctx, t);
  if (HUD && !FULL && !IS_SHORT) drawRecap(ctx, t);
  const t5 = performance.now();
  const r = { t: +t.toFixed(3), year: +y.toFixed(2), S: +cam.S.toFixed(1) };
  if (PROFILE || qp.get("prof")) r.ms = [t1 - t0, t2 - t1, t3 - t2, t4 - t3, t5 - t4].map((v) => Math.round(v));
  return r;
}
var SHORTS = RL.shorts || [];
var SP = IS_SHORT && SHORTS.length ? SHORTS[clamp(Number(SHORT_K), 0, SHORTS.length - 1)] : null;
function shortYear(ts) {
  const K = SP.keys;
  const ast = (y) => y < 0 ? y + 1 : y;
  if (ts <= K[0][0]) return ast(K[0][1]);
  for (let i = 1; i < K.length; i++) if (ts <= K[i][0]) {
    const [ta, ya] = K[i - 1], [tb, yb] = K[i];
    return ast(ya) + (ast(yb) - ast(ya)) * (ts - ta) / (tb - ta);
  }
  return ast(K[K.length - 1][1]);
}
function tOfYearF(a) {
  let lo = F0, hi = YEARS.length - 1;
  if (YEARS[hi] <= a) return CLOCK_END;
  while (lo < hi) {
    const m = lo + hi >> 1;
    if (YEARS[m] >= a) hi = m;
    else lo = m + 1;
  }
  if (lo <= F0) return F0 / FPS;
  const y0 = YEARS[lo - 1], y1 = YEARS[lo];
  return (lo - 1 + (y1 > y0 ? (a - y0) / (y1 - y0) : 0)) / FPS;
}
var shortFilmTime = (ts) => tOfYearF(shortYear(ts));
var SCAM = null;
if (SP) {
  SCAM = { t: [], x: [], y: [], z: [] };
  for (const [t, lon, lat, span] of SP.cam) {
    const [x, y] = ee(lon, lat);
    SCAM.t.push(t);
    SCAM.x.push(x);
    SCAM.y.push(y);
    SCAM.z.push(Math.log(span));
  }
}
function camShort(ts) {
  const c = SCAM;
  return { cx: pchip(c.t, c.x, ts), cy: pchip(c.t, c.y, ts), S: LW / Math.exp(pchip(c.t, c.z, ts)) };
}
var SHORT_WORDS = [];
if (SP) {
  const pick = WORDS.filter((w) => SP.words.includes(w.y)).sort((a, b) => a.y - b.y);
  const ast = (y) => y < 0 ? y + 1 : y;
  const tOf = (y) => {
    let lo = 0, hi = SP.total;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (shortYear(m) >= ast(y)) hi = m;
      else lo = m;
    }
    return hi;
  };
  pick.forEach((w, i) => {
    const t0 = Math.max(0.15, tOf(w.y));
    SHORT_WORDS.push({ ...w, t0, t1: 0 });
  });
  SHORT_WORDS.forEach((w, i) => {
    w.t1 = Math.min(i + 1 < SHORT_WORDS.length ? SHORT_WORDS[i + 1].t0 : SP.total - 2.2, w.t0 + 4.2);
  });
}
function drawShortBand(c, ts, y) {
  const sp = SP;
  c.save();
  c.setTransform(KS, 0, 0, KS, 0, 0);
  c.fillStyle = PANEL_BG;
  c.fillRect(0, 0, LW, MAP_Y0);
  c.fillStyle = PANEL_EDGE;
  c.fillRect(0, MAP_Y0 - 2, LW, 2);
  setFont(c, 30, 800);
  c.fillStyle = ACCENT;
  c.textBaseline = "alphabetic";
  spaced(c, sp.kicker.toUpperCase(), 60, 104, 2.4);
  c.fillStyle = INK;
  c.textAlign = "left";
  sp.title.forEach((ln, i) => {
    fitSize(c, ln, LW - 120, 66, 900, 44);
    c.fillText(ln, 60, 186 + i * 76);
  });
  c.fillStyle = PANEL_BG;
  c.fillRect(0, BAND_Y, LW, LH - BAND_Y);
  c.fillStyle = PANEL_EDGE;
  c.fillRect(0, BAND_Y, LW, 2);
  const lb = yearLabel(y);
  setFont(c, 150, 900);
  const cell = Math.max(..."0123456789".split("").map((d) => c.measureText(d).width));
  const base = BAND_Y + 172, xr = 60 + cell * 4;
  c.fillStyle = INK;
  c.textAlign = "center";
  lb.num.split("").reverse().forEach((d, i) => c.fillText(d, xr - (i + 0.5) * cell, base));
  setFont(c, 48, 900);
  c.fillStyle = INK_SOFT;
  c.textAlign = "left";
  c.fillText(lb.era, xr + 14, base);
  for (const w of SHORT_WORDS) {
    const al = wordAlpha(w, ts);
    if (al <= 0.01) continue;
    c.globalAlpha = al;
    setFont(c, 30, 800);
    c.fillStyle = w.ev ? "#7a3b2e" : ACCENT;
    spaced(c, w.kick.toUpperCase(), 60, BAND_Y + 250, 2);
    c.fillStyle = INK;
    let fs = 44, lines = [];
    for (; fs >= 32; fs -= 2) {
      setFont(c, fs, 650);
      lines = wrap(c, w.txt, LW - 120);
      if (lines.length <= 2) break;
    }
    c.textAlign = "left";
    lines.slice(0, 3).forEach((ln, i) => c.fillText(ln, 60, BAND_Y + 312 + i * fs * 1.2));
    c.globalAlpha = 1;
  }
  const ae = smooth((ts - (sp.total - 2.2)) / 0.4);
  if (ae > 0.01) {
    c.globalAlpha = ae;
    setFont(c, 30, 800);
    c.fillStyle = ACCENT;
    spaced(c, "THE FULL FILM", 60, BAND_Y + 250, 2);
    c.fillStyle = INK;
    fitSize(c, sp.end, LW - 120, 46, 750, 30);
    c.textAlign = "left";
    c.fillText(sp.end, 60, BAND_Y + 316);
    c.globalAlpha = 1;
  }
  setFont(c, 20, 500);
  c.fillStyle = INK_SOFT;
  c.textAlign = "left";
  fitSize(c, sp.credit, LW - 120, 20, 500, 15);
  c.fillText(sp.credit, 60, LH - 30);
  c.restore();
}
async function renderShort(ts) {
  const tf = shortFilmTime(ts), y = shortYear(ts), cam = camShort(ts);
  landLayers(cam);
  paintReligion(cam, y);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(baseCv, 0, 0);
  ctx.save();
  setMapTransform(ctx, cam);
  ctx.clip(landPath, "evenodd");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(relCv, 0, MAP_Y0 * KS);
  ctx.restore();
  ctx.drawImage(overCv, 0, 0);
  drawMinorityShapes(ctx, tf, cam);
  drawEvents(ctx, ts, cam);
  const near = (k) => {
    const tt = clamp(ts + k * 0.12, 0, SP.total);
    return [shortFilmTime(tt), camShort(tt)];
  };
  const calls = layoutMinorities(ctx, tf, cam, layoutLabels(ctx, tf, cam));
  drawLabels(ctx, tf, cam, near, callBoxes(calls));
  drawCallouts(ctx, calls);
  drawShortBand(ctx, ts, y);
  return { ts: +ts.toFixed(3), tf: +tf.toFixed(2), year: +y.toFixed(1) };
}
window.renderFrame = async (f) => IS_SHORT ? renderShort(f / FPS) : renderTime(f / FPS);
window.__setView = (cam) => {
  window.__cam = cam;
  KEY_ON = cam ? KEY_ON_WORLD : KEY_ON_FILM;
  buildLegFirst();
  legCache.clear();
  panelCache.clear();
  meCache.clear();
  insPlace.clear();
  treeBoxes.clear();
  landKey = "";
};
window.__map = { MAP_W, MAP_X0, XR, YR, LW, LH, FPS, CLOCK_END, PREVIEW };
window.renderTime = renderTime;
window.buildInfo = { instances: NI, paints: NP, labels: TRACKS.length, frames: Math.round(RL.total * FPS) };
(async () => {
  await document.fonts.load(`900 40px Inter`);
  await document.fonts.load(`800 20px Inter`);
  await document.fonts.load(`700 20px Inter`);
  if (qp.get("t")) await renderTime(Number(qp.get("t")));
  window.ready = true;
})();
