/* Copy a review document from its working folder into Locus (2026-11-05). Run it again whenever the source changes.
 *
 *   node profit/reviews/sync-review.mjs "<source folder>" <brand-folder> <review-slug> <brand id> "<title>"
 *   node profit/reviews/sync-review.mjs "C:/Users/wetzl/Mobius Digital/Yak Sports/Site Review" yak site-rebuild brand_yak_sports "Site rebuild"
 *
 * Mirrors the source folder into profit/reviews/<brand-folder>/<review-slug>/ (every file and subfolder; anything no
 * longer in the source is removed), turns index.html into a full document if it is an artifact body (charset meta,
 * noindex, no-referrer so the token never leaks in a Referer), names the review on <body>, adds review-kit.js, and
 * rewrites this review's line in index.json with the current page list (every <section class="ba" id> and its <h2>).
 * Answers are kept by section id, so renaming an id drops that page's answers. Then commit, PR, merge: Publish Locus
 * puts it live. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_V = 2;   // bump with review-kit.js changes, then re-run for every review
const here = path.dirname(fileURLToPath(import.meta.url));
const [src, brand, slug, act, title] = process.argv.slice(2);
if (!src || !/^[a-z0-9-]+$/.test(brand || '') || !/^[a-z0-9][a-z0-9-]*$/.test(slug || '') || !/^brand_[a-z0-9_]+$/.test(act || '') || !title) {
  console.error('usage: node sync-review.mjs "<source folder>" <brand-folder> <review-slug> <brand id> "<title>"'); process.exit(1);
}
const srcHtml = path.join(src, 'index.html');
if (!fs.existsSync(srcHtml)) { console.error(`no index.html in ${src}`); process.exit(1); }
const dest = path.join(here, brand, slug);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const e of fs.readdirSync(src, { withFileTypes: true })) {
  if (e.name === 'index.html' || e.name.startsWith('.')) continue;
  fs.cpSync(path.join(src, e.name), path.join(dest, e.name), { recursive: true });
}

const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const bodyAttrs = `data-review-act="${act}" data-review-slug="${slug}" data-review-title="${attr(title)}"`;
const kit = `<script src="../../review-kit.js?v=${KIT_V}"></script>`;
let html = fs.readFileSync(srcHtml, 'utf8').replace(/^\uFEFF/, '').replace(/<meta name="claude:[^>]*>\s*/g, '');
const META = '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n<link rel="icon" type="image/png" sizes="32x32" href="../../../../logo/locus/icons/favicon-32.png">\n';
if (/<html[\s>]/i.test(html)) {
  /* already a full document: add what is missing */
  if (!/<meta[^>]+charset/i.test(html)) html = html.replace(/<head[^>]*>/i, m => `${m}\n${META}`);
  html = html.replace(/<body([^>]*)>/i, (m, a) => `<body${a} ${bodyAttrs}>`).replace(/<\/body>/i, `${kit}\n</body>`);
} else {
  /* an artifact body: everything up to the first </style> is the head */
  const i = html.indexOf('</style>');
  const head = i >= 0 ? html.slice(0, i + 8) : '';
  const body = i >= 0 ? html.slice(i + 8) : html;
  html = `<!doctype html>\n<html lang="en">\n<head>\n${META}${head.trim()}\n</head>\n<body ${bodyAttrs}>\n${body.trim()}\n${kit}\n</body>\n</html>\n`;
}
fs.writeFileSync(path.join(dest, 'index.html'), html);

const sections = [...html.matchAll(/<section[^>]*class="[^"]*\bba\b[^"]*"[^>]*id="([a-z0-9-]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/g)]
  .map(m => ({ id: m[1], title: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
const idxFile = path.join(here, 'index.json');
const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : [];
const old = idx.find(r => r.act === act && r.slug === slug);
const entry = { act, slug, title, path: `reviews/${brand}/${slug}/`, added: old?.added || new Date().toISOString().slice(0, 10), sections };
const next = old ? idx.map(r => r === old ? entry : r) : [...idx, entry];
fs.writeFileSync(idxFile, JSON.stringify(next, null, 1) + '\n');
const gone = (old?.sections || []).filter(s => !sections.some(n => n.id === s.id)).map(s => s.id);
console.log(`${brand}/${slug}: ${sections.length} pages${gone.length ? `; REMOVED ids (their answers no longer show): ${gone.join(', ')}` : ''}`);
