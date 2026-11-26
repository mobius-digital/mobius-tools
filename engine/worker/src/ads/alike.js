/* Look alike ads. Two live ads in the same ad set are "same" when they run the same creative, and
   "alike" when format, hook, person, product and offer match and their message and notes share 40
   percent or more of their words. Groups are joined (A like B and B like C is one group of 3). Ads with
   no tags are never judged. */
// from profit/worker/src/hub.js (lookAlikeGroups)
import { num } from './base.js';

const KEYS = ['format', 'hook', 'person', 'product', 'offer'];
const STOP = new Set('a an and the of to in on with for at by from into over under its it is are be this that their his her our your as or but no not very more most'.split(' '));
const lowered = v => String(v || '').toLowerCase();

function wordsOf(tags) {
  const text = `${(tags && tags.message) || ''} ${(tags && tags.notes) || ''}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  return new Set(text.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')));
}

function shared(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}

function kindOf(a, b, wa, wb) {
  if (a.asset_key && a.asset_key === b.asset_key) return 'same';
  if (a.tags && b.tags && KEYS.every(k => lowered(a.tags[k]) === lowered(b.tags[k])) && shared(wa, wb) >= 0.4) return 'alike';
  return null;
}

/* The groups inside one ad set. */
function groupsIn(set, list) {
  const parent = list.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const kind = {};
  const words = list.map(r => (r.tags ? wordsOf(r.tags) : null));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const k = kindOf(list[i], list[j], words[i], words[j]);
      if (!k) continue;
      const ri = find(i), rj = find(j);
      if (ri !== rj) parent[rj] = ri;
      kind[`${i}|${j}`] = k;
    }
  }
  const groups = {};
  list.forEach((r, i) => (groups[find(i)] ||= []).push(i));
  const out = [];
  for (const idx of Object.values(groups)) {
    if (idx.length < 2) continue;
    const same = idx.some(i => idx.some(j => kind[`${Math.min(i, j)}|${Math.max(i, j)}`] === 'same'));
    const ads = idx.map(i => list[i]).sort((x, y) => num(y.spend) - num(x.spend));
    out.push({ adset_id: set, kind: same ? 'same' : 'alike', ads: ads.map(r => ({ id: r.id, name: r.name, spend: num(r.spend) })),
      spend: ads.reduce((s, r) => s + num(r.spend), 0) });
  }
  return out;
}

/** Every look alike group among these ads, biggest spend first. */
export function lookAlikeGroups(ads) {
  const bySet = {};
  for (const r of ads) if (r.adset_id && (r.asset_key || r.tags)) (bySet[r.adset_id] ||= []).push(r);
  const out = [];
  for (const [set, list] of Object.entries(bySet)) if (list.length >= 2) out.push(...groupsIn(set, list));
  return out.sort((x, y) => y.spend - x.spend);
}
