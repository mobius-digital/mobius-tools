/**
 * Renders the home-screen icons in public/icons/ from public/logo.svg and the
 * colours in brand.config.ts.
 *
 *   npm run icons
 *
 * Phones want PNG icons, and iOS cannot tint one the way the in-app logo is
 * tinted, so the accent colour is baked in here. Each icon is the logo on a
 * solid tile of the brand's primary colour (logoTint: true) — or the logo as
 * drawn on the page background (logoTint: false). The maskable variant keeps
 * the mark inside the safe zone Android crops to.
 *
 * Needs Google Chrome (or Chromium/Edge) installed; nothing else. Set CHROME
 * to the executable path if it is somewhere unusual. If you would rather make
 * the icons yourself, drop PNGs with these names into public/icons/ instead:
 *   icon-180.png  icon-192.png  icon-512.png  icon-maskable-512.png
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
const PORT = 9377;

const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error(
    "Could not find Chrome. Install Google Chrome, or set CHROME=<path to the executable>.",
  );
  process.exit(1);
}

// brand.config.ts is TypeScript; node 24 strips types on import.
const { brand } = await import(
  new URL("../brand.config.ts", import.meta.url).href
);

const logoPath = join(root, "public", brand.logoUrl.replace(/^\//, ""));
const logo = await readFile(logoPath, "utf8");
const tinted = brand.logoTint !== false;

// An untinted (full-colour) logo sits on the page background; a tinted mark
// sits on the accent and is painted in the colour that contrasts with it.
const tile = tinted ? brand.colors.primary : brand.colors.background;
const ink = tinted ? brand.colors.primaryText : "inherit";

function page(size, { maskable }) {
  // Maskable icons are cropped to a circle/squircle of ~80% — keep the mark
  // inside it. Plain icons get a little more breathing room than the nav.
  const inset = maskable ? 0.22 : 0.18;
  const mark = size * (1 - inset * 2);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .tile{width:${size}px;height:${size}px;background:${tile};display:flex;align-items:center;justify-content:center;color:${ink}}
    .tile svg{width:${mark}px;height:${mark}px;display:block}
  </style></head><body><div class="tile">${logo}</div></body></html>`;
}

const proc = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(root, ".wrangler", "tmp-icon-profile")}`,
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === "page");
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error("Chrome did not start.");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const msg = { id: ++id, method, params };
      pending.set(msg.id, res);
      ws.send(JSON.stringify(msg));
    });

  await send("Page.enable");
  await mkdir(outDir, { recursive: true });

  const ICONS = [
    { name: "icon-180.png", size: 180, maskable: false },
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-maskable-512.png", size: 512, maskable: true },
  ];

  for (const icon of ICONS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: icon.size,
      height: icon.size,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const html = page(icon.size, icon);
    await send("Page.navigate", {
      url: "data:text/html;charset=utf-8," + encodeURIComponent(html),
    });
    await new Promise((r) => setTimeout(r, 400));
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 },
    });
    await writeFile(join(outDir, icon.name), Buffer.from(shot.result.data, "base64"));
    console.log(`wrote public/icons/${icon.name}`);
  }
  ws.close();
} finally {
  proc.kill();
}
