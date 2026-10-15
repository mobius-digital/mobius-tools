/* Locus Studio: real product, the browser half (2026-10-15, the fidelity bench).
 *
 * The model paints a scene AROUND a real cut-out of the product (/api/studio/make-real). It repaints the whole picture,
 * product included, and nudges the product a few pixels or a few percent in size. So:
 *   fit()   finds where the model left the product: translation + uniform scale, masked zero-mean correlation of the
 *           cut-out's brightness against the picture, coarse to fine. The score is the gate: a low score means the model
 *           moved, resized or redrew the product too much (or dropped it), and the ad is made again.
 *   lock()  puts the REAL cut-out back over that spot and multiplies it by the model's smooth light (a blur about 1/45 of
 *           the width, mostly brightness, a little colour, clamped), so shading and warmth follow the scene while every
 *           edge, letter, medallion and colour stays the photo's. A 2px rim keeps a touch of the model's contact edge.
 * Bench (Lucky, 100% crops beside the Shopify photos): 12 of 12 club ads exact and grounded; the gate rejected every
 * multi-product apparel scene where the model moved or dropped an item. Plain arrays only, so Node can run it too.
 */
(function (root) {
  const lumOf = (d, n) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return o; };

  /* Box-average down-sample of a single-channel array. */
  function shrink(src, w, h, f) {
    const W = Math.max(1, Math.floor(w / f)), H = Math.max(1, Math.floor(h / f)), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let yy = y * f; yy < Math.min(h, (y + 1) * f); yy++) for (let xx = x * f; xx < Math.min(w, (x + 1) * f); xx++) { s += src[yy * w + xx]; n++; }
      o[y * W + x] = n ? s / n : 0;
    }
    return { a: o, w: W, h: H };
  }
  /* The cut-out (lum + alpha) resampled to tw x th, bilinear. */
  function sample(cut, tw, th) {
    const L = new Float32Array(tw * th), A = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const sx = (x + 0.5) * cut.w / tw - 0.5, sy = (y + 0.5) * cut.h / th - 0.5;
      const x0 = Math.max(0, Math.min(cut.w - 1, Math.floor(sx))), y0 = Math.max(0, Math.min(cut.h - 1, Math.floor(sy)));
      const x1 = Math.min(cut.w - 1, x0 + 1), y1 = Math.min(cut.h - 1, y0 + 1), fx = Math.max(0, sx - x0), fy = Math.max(0, sy - y0);
      const g = (xx, yy, arr) => arr[yy * cut.w + xx];
      const bl = arr => (g(x0, y0, arr) * (1 - fx) + g(x1, y0, arr) * fx) * (1 - fy) + (g(x0, y1, arr) * (1 - fx) + g(x1, y1, arr) * fx) * fy;
      L[y * tw + x] = bl(cut.lum); A[y * tw + x] = bl(cut.alpha);
    }
    return { L, A };
  }
  /* Masked zero-mean normalised correlation of template T (with weights M) placed at (ox, oy) on image I. */
  function zncc(I, iw, ih, T, M, tw, th, ox, oy, step = 1) {
    let n = 0, si = 0, st = 0;
    for (let y = 0; y < th; y += step) { const iy = y + oy; if (iy < 0 || iy >= ih) continue;
      for (let x = 0; x < tw; x += step) { const ix = x + ox; if (ix < 0 || ix >= iw) continue; const m = M[y * tw + x]; if (m < 0.5) continue; n++; si += I[iy * iw + ix]; st += T[y * tw + x]; } }
    if (n < 30) return -1;
    const mi = si / n, mt = st / n; let num = 0, di = 0, dt = 0;
    for (let y = 0; y < th; y += step) { const iy = y + oy; if (iy < 0 || iy >= ih) continue;
      for (let x = 0; x < tw; x += step) { const ix = x + ox; if (ix < 0 || ix >= iw) continue; if (M[y * tw + x] < 0.5) continue;
        const a = I[iy * iw + ix] - mi, b = T[y * tw + x] - mt; num += a * b; di += a * a; dt += b * b; } }
    return di > 0 && dt > 0 ? num / Math.sqrt(di * dt) : -1;
  }

  /* ai: {data: RGBA, w, h}; cut: {data: RGBA, w, h}; rect: where the cut-out was placed {x, y, w, h} on the same frame.
     Returns {x, y, w, h, score}: where the real cut-out should go now. */
  function fit(ai, cut, rect) {
    const aiL = lumOf(ai.data, ai.w * ai.h);
    const c = { w: cut.w, h: cut.h, lum: lumOf(cut.data, cut.w * cut.h), alpha: new Float32Array(cut.w * cut.h) };
    for (let i = 0; i < cut.w * cut.h; i++) c.alpha[i] = cut.data[i * 4 + 3] / 255;
    let best = { s: 1, x: rect.x, y: rect.y, score: -1 };
    /* coarse: the whole frame at 1/16 (the model can move a product a long way), keeping the 6 best separate spots
       (a busy texture can out-score the real spot at that size); each is refined at 1/8, 1/4 and 1/2 and the best wins.
       A spot far from where the product was placed pays a small penalty, so ties go to the likely one. */
    const coarse = [];
    {
      const f = 16, I = shrink(aiL, ai.w, ai.h, f);
      for (const s of [0.82, 0.88, 0.94, 1, 1.06, 1.12, 1.18]) {
        const tw = Math.max(4, Math.round(rect.w * s / f)), th = Math.max(4, Math.round(rect.h * s / f)), T = sample(c, tw, th);
        for (let oy = -Math.round(th / 2); oy <= I.h - Math.round(th / 2); oy++) for (let ox = -Math.round(tw / 2); ox <= I.w - Math.round(tw / 2); ox++) {
          const v = zncc(I.a, I.w, I.h, T.L, T.A, tw, th, ox, oy);
          if (v > -1) coarse.push({ s, x: ox * f, y: oy * f, score: v });
        }
      }
    }
    coarse.sort((p, q) => q.score - p.score);
    const seeds = [];
    for (const k of coarse) { if (seeds.every(p => Math.hypot(p.x - k.x, p.y - k.y) > Math.max(rect.w, rect.h) * 0.15)) seeds.push(k); if (seeds.length === 6) break; }
    seeds.push({ s: 1, x: rect.x, y: rect.y, score: -1 });
    const diag = Math.hypot(ai.w, ai.h);
    for (const seed of seeds) {
      let cur = seed;
      for (const st of [{ f: 8, ds: [-0.03, 0, 0.03], r: 2 }, { f: 4, ds: [-0.015, 0, 0.015], r: 2 }, { f: 2, ds: [-0.006, 0, 0.006], r: 2 }]) {
        const I = shrink(aiL, ai.w, ai.h, st.f), cx = cur.x + rect.w * cur.s / 2, cy = cur.y + rect.h * cur.s / 2; let sb = { ...cur, score: -2 };
        for (const s of st.ds.map(d => cur.s + d)) {
          const tw = Math.max(4, Math.round(rect.w * s / st.f)), th = Math.max(4, Math.round(rect.h * s / st.f)), T = sample(c, tw, th);
          const bx = Math.round((cx - rect.w * s / 2) / st.f), by = Math.round((cy - rect.h * s / 2) / st.f);
          for (let oy = by - st.r; oy <= by + st.r; oy++) for (let ox = bx - st.r; ox <= bx + st.r; ox++) {
            const v = zncc(I.a, I.w, I.h, T.L, T.A, tw, th, ox, oy);
            if (v > sb.score) sb = { s, x: ox * st.f, y: oy * st.f, score: v };
          }
        }
        cur = sb;
      }
      const away = Math.hypot(cur.x - rect.x, cur.y - rect.y) / diag;
      cur.rank = cur.score - 0.1 * away;
      if (best.score < -0.5 || cur.rank > best.rank) best = cur;
    }
    return { x: Math.round(best.x), y: Math.round(best.y), w: Math.round(rect.w * best.s), h: Math.round(rect.h * best.s), score: +best.score.toFixed(3), scale: +best.s.toFixed(3) };
  }

  /* Separable box blur, 3 passes (close to a Gaussian), on a single channel. */
  function blur(src, w, h, r) {
    const a = Float32Array.from(src), b = new Float32Array(w * h), k = 2 * r + 1;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; const o = y * w;
        for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) { b[o + x] = s / k; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0;
        for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s / k; s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
    }
    return a;
  }

  /* ai: {data, w, h} the model's picture; layer: {data} RGBA of the same size holding the real cut-out already drawn at
     its fitted spot (transparent elsewhere). Returns a new RGBA Uint8ClampedArray. */
  function lock(ai, layer) {
    const { w, h } = ai, n = w * h, A = ai.data, R = layer.data, out = new Uint8ClampedArray(A);
    const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = R[i * 4 + 3] > 127 ? 1 : 0;
    const r = Math.max(3, Math.round(w / 45 / 1.7));
    const bm = blur(m, w, h, r), ga = [], gr = [];
    for (let ch = 0; ch < 3; ch++) {
      const a = new Float32Array(n), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { a[i] = A[i * 4 + ch] * m[i]; b[i] = R[i * 4 + ch] * m[i]; }
      ga.push(blur(a, w, h, r)); gr.push(blur(b, w, h, r));
    }
    /* inner = well inside the product (the rim keeps a touch of the model's own edge and contact) */
    const inner = blur(m, w, h, 2);
    for (let i = 0; i < n; i++) {
      const al = R[i * 4 + 3] / 255; if (al <= 0) continue;
      const g = [0, 1, 2].map(ch => { const den = Math.max(1e-3, bm[i]); const am = ga[ch][i] / den, rm = gr[ch][i] / den; return Math.min(1.7, Math.max(0.45, am / Math.max(1, rm))); });
      const gl = (g[0] + g[1] + g[2]) / 3;
      const aa = al * (inner[i] > 0.98 ? 1 : 0.75);
      for (let ch = 0; ch < 3; ch++) {
        const p = Math.min(255, R[i * 4 + ch] * (gl + 0.35 * (g[ch] - gl)));
        out[i * 4 + ch] = A[i * 4 + ch] * (1 - aa) + p * aa;
      }
    }
    return out;
  }

  /* Which sides of its source photo the product touched (a shaft cut by the photo's frame): those sides must run off
     the ad's edge too, or the ad shows a sawn-off shaft. A side counts when 3%+ of it is product. */
  function cutEdges(alpha, w, h) {
    const e = [], run = (get, len) => { let n = 0; for (let i = 0; i < len; i++) n += get(i) > 127; return n > len * 0.03 || n > 24; };
    if (run(i => alpha[i], w)) e.push('top');
    if (run(i => alpha[(h - 1) * w + i], w)) e.push('bottom');
    if (run(i => alpha[i * w], h)) e.push('left');
    if (run(i => alpha[i * w + w - 1], h)) e.push('right');
    return e;
  }

  const api = { fit, lock, cutEdges, GATE: 0.78 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RealFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
