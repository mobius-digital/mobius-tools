/* <mobius-loader>: the Mobius strip (profit/DESIGN.md section 7).
     <mobius-loader mode="load"></mobius-loader>              the intro: a pre-rendered 3D film (assets/intro/) of the
                                                              strip forming the logo, on a fresh page load at most once per 10 minutes (?intro=1 forces it)
     <mobius-loader mode="working" size="20"></mobius-loader> small, turning and breathing (the Strategist working)
   load: a full-screen layer on the theme canvas colour with the video centred. The app renders underneath and never
   waits on it: the layer fades as the video ends (hard cap 3.6s), and a tap, click or Escape skips it.
   prefers-reduced-motion or any video problem = the static mark for a moment, then the fade.
   working: a true 3D Mobius band (Three.js r128 from cdnjs, loaded once on first use), drawn by ONE shared WebGL
   renderer and copied into each element's 2D canvas, so any number of loaders cost one GPU context.
   No WebGL, the CDN failing, or prefers-reduced-motion = the static Mobius mark. */
(function () {
  if (window.customElements && customElements.get('mobius-loader')) return;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const BASE = (() => { try { return new URL('assets/intro/', document.currentScript.src).href; } catch { return 'assets/intro/'; } })();
  const SEEN = 'locus_intro_at', GAP = 10 * 60 * 1000, CAP = 3600, FILM = '?v=3';

  /* The Mobius mark (icons/locus.svg path) in the logo gradient: mint, Mobius blue, sand at 27 degrees, fitted to
     brand/mobius-app-icon-512.png. FINAL_VB puts it exactly where the intro's last frame has it (mark = half the
     square video, centred), so the still and the film agree to the pixel. */
  const FINAL_VB = '-168.85 -169.1 1363 1363';
  let gid = 0;
  const mark = (vb = '150 270 720 480') => { const id = 'mlg' + (++gid); return `<svg class="ml-mark" viewBox="${vb}" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-122.08" y1="62.20" x2="538.08" y2="-274.17"><stop offset="0" stop-color="#C6E4D6"/><stop offset=".5" stop-color="#62BDEA"/><stop offset="1" stop-color="#DCC9A8"/></linearGradient></defs><path fill="url(#${id})" d="M196.464 694.499C163.840 661.886 163.840 608.516 196.464 575.890L455.891 316.543C488.515 283.929 541.900 283.929 574.536 316.543C607.160 349.157 607.160 402.527 574.536 435.152L315.110 694.499C282.486 727.113 229.100 727.113 196.464 694.499M844.953 471.289L685.620 630.573L685.620 649.000C685.620 695.132 723.369 732.869 769.515 732.869C815.662 732.869 853.411 695.132 853.411 649.000L853.411 461.748C850.806 465.044 847.999 468.244 844.953 471.289M573.891 707.457L827.536 453.890C860.160 421.276 860.160 367.906 827.536 335.281C794.912 302.667 741.526 302.667 708.890 335.281L455.246 588.848C422.622 621.461 422.622 674.831 455.246 707.457C487.870 740.071 541.255 740.071 573.891 707.457Z"/></svg>`; };

  let threeP = null;
  const loadThree = () => threeP || (threeP = new Promise((res, rej) => {
    if (window.THREE) return res(window.THREE);
    const s = document.createElement('script'); s.src = THREE_URL; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => window.THREE ? res(window.THREE) : rej(new Error('three missing'));
    s.onerror = () => rej(new Error('three failed')); document.head.appendChild(s);
  }));

  /* ---------- the shared scene (working mode) ---------- */
  let R = null;
  function scene(THREE) {
    if (R) return R;
    const cv = document.createElement('canvas');
    let gl;
    try { gl = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch { return null; }
    gl.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 8.8);
    /* The band: u around the loop, v across it, a half twist. */
    const NU = 240, NV = 20, W = 0.66, pos = [], col = [], idx = [];
    const stops = [[0.776, 0.894, 0.839], [0.384, 0.741, 0.918], [0.184, 0.384, 0.851], [0.384, 0.741, 0.918], [0.863, 0.788, 0.659]];
    const grad = t => { t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i], b = stops[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * Math.PI * 2;
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV * 2 - 1) * W;
        const r = 1.5 + v * Math.cos(u / 2);
        pos.push(r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2));
        /* colour flows round the loop and matches itself where the band meets */
        const c = grad((1 - Math.cos(u)) / 2 * 0.85 + (j / NV) * 0.15); col.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(g, m); sc.add(mesh);
    sc.add(new THREE.AmbientLight(0xffffff, 0.72));
    const k = new THREE.DirectionalLight(0xffffff, 0.55); k.position.set(3, 4, 6); sc.add(k);
    const f = new THREE.DirectionalLight(0xbfe3ff, 0.35); f.position.set(-5, -2, 3); sc.add(f);
    R = { THREE, gl, sc, cam, mesh, cv };
    return R;
  }
  /* Draw one frame at angle a (radians, one full turn = 2PI loops seamlessly) into a 2D canvas. */
  function draw(target, px, a, wob) {
    const s = R; if (!s) return;
    if (s.cv.width !== px || s.cv.height !== px) s.gl.setSize(px, px, false);
    s.mesh.rotation.set(0.62 + Math.sin(a) * 0.14 * (wob ?? 1), Math.sin(a) * 0.18 * (wob ?? 1), a);
    s.gl.render(s.sc, s.cam);
    const ctx = target.getContext('2d'); ctx.clearRect(0, 0, px, px); ctx.drawImage(s.cv, 0, 0, px, px);
  }

  const live = new Set(); let raf = 0;
  const tick = t => { raf = 0; for (const el of live) el._frame(t); if (live.size) raf = requestAnimationFrame(tick); };
  const start = el => { live.add(el); if (!raf) raf = requestAnimationFrame(tick); };
  const stop = el => { live.delete(el); };

  const CSS = `mobius-loader{display:inline-block;position:relative;vertical-align:middle;line-height:0}
    mobius-loader .ml-box{position:relative;display:block}
    mobius-loader canvas,mobius-loader .ml-mark{position:absolute;inset:0;width:100%;height:100%;display:block}
    mobius-loader canvas{transition:opacity .3s ease}
    mobius-loader[mode="load"]{position:fixed;inset:0;z-index:300;display:grid;place-items:center;background:var(--bg,#F7F7F8);cursor:pointer;transition:opacity .4s cubic-bezier(.2,.8,.2,1)}
    mobius-loader[mode="load"].gone{opacity:0;pointer-events:none}
    mobius-loader[mode="load"] .ml-box{width:min(86vmin,600px);height:min(86vmin,600px)}
    mobius-loader[mode="load"] video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain;background:transparent}
    mobius-loader[mode="load"] .ml-mark{opacity:0}
    mobius-loader[mode="load"].still .ml-mark{opacity:1}
    mobius-loader[mode="load"].still video{opacity:0}
    mobius-loader[mode="working"] .ml-mark{animation:ml-breathe 1.6s ease-in-out infinite}
    @keyframes ml-breathe{0%,100%{transform:scale(.88);opacity:.75}50%{transform:scale(1);opacity:1}}
    @media (prefers-reduced-motion:reduce){mobius-loader .ml-mark{animation:none!important;transition:none!important}}`;
  const style = () => { if (document.getElementById('mlcss')) return; const s = document.createElement('style'); s.id = 'mlcss'; s.textContent = CSS; document.head.appendChild(s); };

  /* Which file: the H.264 copy baked on the page colour, on every browser (2026-10-10, Cole: "choppy, almost
     flickering"). The VP9-with-alpha copy is decoded in software in Chrome at 1080 x 1080, 60 fps, two planes, while
     the app boots behind it, and it dropped frames; H.264 goes to the graphics card. The overlay's background is the
     film's own baked colour (BAKED), so there is no edge. */
  const BAKED = { light: 'rgb(246,246,246)', dark: 'rgb(17,16,19)' };
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  function introSrc() {
    return BASE + (isDark() ? 'mobius-intro-square-dark.mp4' : 'mobius-intro-square.mp4') + FILM;
  }

  class MobiusLoader extends HTMLElement {
    connectedCallback() {
      style();
      const mode = this.getAttribute('mode') || 'working';
      this._mode = mode;
      if (mode === 'load') return this._intro();
      const size = +(this.getAttribute('size') || 20);
      this.setAttribute('role', 'img'); this.setAttribute('aria-label', 'Working');
      const box = document.createElement('span'); box.className = 'ml-box';
      box.style.width = size + 'px'; box.style.height = size + 'px';
      this.appendChild(box); this._box = box; this._size = size; this._t0 = performance.now();
      const showMark = () => { if (!box.querySelector('.ml-mark')) box.insertAdjacentHTML('beforeend', mark()); };
      if (reduced()) { showMark(); return; }
      loadThree().then(THREE => {
        if (!this.isConnected) return;
        if (!scene(THREE)) throw new Error('no webgl');
        const cv = document.createElement('canvas'); const px = Math.round(this._size * Math.min(2, window.devicePixelRatio || 1));
        cv.width = cv.height = px; box.insertBefore(cv, box.firstChild); this._cv = cv; this._px = px;
        start(this);
      }).catch(() => { if (this.isConnected) showMark(); });
    }
    /* The intro: never in the app's way. */
    _intro() {
      /* Every fresh page load, at most once per 10 minutes (localStorage time stamp). In-app navigation never
         reloads the page, so it never replays there. ?intro=1 forces it. */
      let force = false, recent = false;
      try { force = new URLSearchParams(location.search).get('intro') === '1'; } catch {}
      try {
        const last = +(localStorage.getItem(SEEN) || 0), now = Date.now();
        recent = last > 0 && now - last >= 0 && now - last < GAP;
        if (force || !recent) localStorage.setItem(SEEN, String(now));
      } catch {}
      if (recent && !force) { this._gone = true; this.remove(); return; }
      this.setAttribute('role', 'img'); this.setAttribute('aria-label', 'Locus');
      this.style.background = BAKED[isDark() ? 'dark' : 'light'];
      const box = document.createElement('span'); box.className = 'ml-box';
      box.insertAdjacentHTML('beforeend', mark(FINAL_VB));
      this.appendChild(box); this._box = box;
      const still = ms => { this.classList.add('still'); clearTimeout(this._kill); this._kill = setTimeout(() => this.done(), ms); };
      this._skip = e => { if (e.type === 'keydown' && e.key !== 'Escape') return; this.done(); };
      this.addEventListener('click', this._skip); document.addEventListener('keydown', this._skip);
      this._kill = setTimeout(() => this.done(), CAP);                          // hard cap, whatever happens
      if (reduced()) { still(700); return; }
      const v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.disablePictureInPicture = true;
      v.src = introSrc();
      let started = false;
      v.addEventListener('playing', () => { started = true; });
      v.addEventListener('error', () => still(600));
      v.addEventListener('ended', () => this.done());
      v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime >= v.duration - 0.12) this.done(); });
      box.insertBefore(v, box.firstChild);
      const p = v.play(); if (p && p.catch) p.catch(() => still(600));
      /* slow network: no film after 1.2s means the still and a short goodbye, not a blank screen */
      setTimeout(() => { if (!started && !this._gone) still(500); }, 1200);
    }
    _frame(t) {
      if (!this._cv) return;
      const e = (t - this._t0) / 1000;
      draw(this._cv, this._px, e * 1.9, 1);
      const k = 0.92 + 0.08 * Math.sin(e * 3.6); this._box.style.transform = `scale(${k.toFixed(3)})`;
    }
    disconnectedCallback() { stop(this); clearTimeout(this._kill); if (this._skip) document.removeEventListener('keydown', this._skip); }
    /** Fade out and remove (load mode); a working loader just stops. */
    done() {
      if (this._gone) return; this._gone = true; stop(this); clearTimeout(this._kill);
      if (this._mode !== 'load') { this.remove(); return; }
      if (this._skip) document.removeEventListener('keydown', this._skip);
      this.classList.add('gone'); setTimeout(() => this.remove(), 420);
    }
  }
  customElements.define('mobius-loader', MobiusLoader);

  /* Frames of one full turn of the live strip as PNG data URLs (transparent). The Slack emoji is now rendered
     offline with the intro (assets/intro/source), but this stays for quick looks. */
  window.MobiusLoader = {
    load: loadThree,
    async frames(n = 40, size = 128) {
      const THREE = await loadThree(); if (!scene(THREE)) throw new Error('no webgl');
      const cv = document.createElement('canvas'); cv.width = cv.height = size; const out = [];
      for (let i = 0; i < n; i++) { draw(cv, size, i / n * Math.PI * 2, 1); out.push(cv.toDataURL('image/png')); }
      return out;
    },
  };
})();
