/* The agency settings: the switches and times the settings screens read and save. Each is one row of the
   old settings table. Reading takes one statement. Saving writes only the rows named in the body. */
// from account-health/worker/src/worker.js (GET and PUT /api/settings, seasonTabOf), buyerlist.js (buyerSettings,
// normDays), buyerai.js (buyerAIOn), morningcard.js (morningHour, cardOn), minoff.js (minOffOn), clientchan.js (switches)
import { fail } from '../platform/errors.js';
import { safeJson, isPlainObject } from '../platform/text.js';
import { settingsOf } from './service.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_LAUNCH_DAYS = 'mon,thu';
const DEFAULT_MORNING_HOUR = 5;
/* The three safety switches: true until someone turns one off (stored as '0'). */
const SWITCHES = ['checkinAutoApprove', 'askInClientChannels', 'slackIndexClient'];
/* On unless the stored word is 'off'. Answer key and settings key are the same. */
const ON_UNLESS_OFF = ['movedPost', 'marketChatter', 'todayPost', 'actionRemind', 'minOffPost', 'buyerPost', 'morningCard'];
const READ_KEYS = ['slackChannel', 'slackSendWho', 'paceAlertPct', 'marketHandles', 'seasonTab', 'dailyBriefsChannel',
  'briefClientStyle', 'buyerChannel', 'buyerOwner', 'launchDays', 'buyerAI', 'morningHour', 'briefHour',
  'dailyBriefsError', ...ON_UNLESS_OFF, ...SWITCHES];
/* Fields the engine cannot know: three say whether a key is set on the old side, two fall back to a
   person and a chat channel that are fixed in the old code. Listed in the row's source.borrows. */
export const BORROWED = ['slackInteractive', 'hasSlackToken', 'hasTwKey', 'buyerOwner', 'buyerChannel'];

const CHANNEL = /^[CG][A-Z0-9]{6,}$/;
const BUYER_CHANNEL = /^[CGU][A-Z0-9]{6,}$/;
const squeeze = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/* The seasonal menu item: its label (40 characters at most) and when it shows. Takes the stored text or
   an object. The label pattern is the old one, letter for letter, so both engines give the same answer. */
function seasonTabOf(v) {
  const o = typeof v === 'string' ? safeJson(v, {}) : (isPlainObject(v) ? v : {});
  const label = String(o?.label ?? '').replace(/s+/g, ' ').trim().slice(0, 40) || 'Black Friday';
  return { label, mode: ['auto', 'on', 'off'].includes(o?.mode) ? o.mode : 'auto' };
}

/* "mon, Thu" -> "mon,thu" in week order. null when no day is named. */
function normDays(v) {
  const want = new Set(String(v || '').toLowerCase().split(/[\s,]+/).map(x => x.slice(0, 3)).filter(x => DAY_KEYS.includes(x)));
  return want.size ? DAY_KEYS.filter(k => want.has(k)).join(',') : null;
}

/* The one hour every morning post goes out: morningHour, else the older briefHour, else 5. */
function morningHourOf(set) {
  for (const k of ['morningHour', 'briefHour']) {
    const raw = set[k];
    const h = raw == null || raw === '' ? NaN : +raw;
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
  }
  return DEFAULT_MORNING_HOUR;
}

/** GET /api/settings. Same keys, same order, same fallbacks as the old answer. */
export async function readSettings(ctx) {
  const set = await settingsOf(ctx, READ_KEYS);
  const old = (await ctx.legacy.get('ah', '/api/settings', { cache_s: 300 })) || {};
  const text = k => set[k] ?? null;
  const on = k => text(k) !== 'off';
  const owner = squeeze(text('buyerOwner'), 40);
  const channel = text('buyerChannel') || '';
  const out = {
    slackChannel: text('slackChannel'),
    slackSendWho: text('slackSendWho') === 'anyone' ? 'anyone' : 'owner',
    slackInteractive: old.slackInteractive ?? null,
    paceAlertPct: +text('paceAlertPct') || 0.15,
    movedPost: on('movedPost'),
    marketHandles: text('marketHandles') || '',
    marketChatter: on('marketChatter'),
    seasonTab: seasonTabOf(text('seasonTab')),
    dailyBriefsChannel: text('dailyBriefsChannel') || '',
    briefClientStyle: text('briefClientStyle') === 'full' ? 'full' : 'short',
    todayPost: on('todayPost'),
    actionRemind: on('actionRemind'),
    minOffPost: on('minOffPost'),
    buyerOwner: owner || (old.buyerOwner ?? null),
    buyerChannel: BUYER_CHANNEL.test(channel) ? channel : (old.buyerChannel ?? null),
    buyerPost: on('buyerPost'),
    launchDays: normDays(text('launchDays')) || DEFAULT_LAUNCH_DAYS,
    buyerAI: on('buyerAI'),
    morningHour: morningHourOf(set),
    morningCard: on('morningCard'),
    dailyBriefsError: safeJson(text('dailyBriefsError'), null),
    hasSlackToken: old.hasSlackToken ?? null,
    hasTwKey: old.hasTwKey ?? null,
  };
  for (const k of SWITCHES) out[k] = text(k) !== '0';
  return out;
}

const word = v => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const isOff = v => v === false || v === '0' || v === 0 || v === 'off';

/* The rows the body asks for, in the old order. Anything not named in the body is not touched. */
function rowsFor(b) {
  const rows = [];
  const put = (key, value) => rows.push(['platform.settingPut', { key, value: String(value) }]);
  const flag = key => { if (key in b) put(key, b[key] ? 'on' : 'off'); };
  if ('slackChannel' in b) put('slackChannel', word(b.slackChannel));
  if ('slackSendWho' in b) put('slackSendWho', b.slackSendWho === 'anyone' ? 'anyone' : 'owner');
  if ('paceAlertPct' in b) put('paceAlertPct', +b.paceAlertPct || 0.15);
  flag('movedPost');
  if ('marketHandles' in b) put('marketHandles', word(b.marketHandles).slice(0, 400));
  flag('marketChatter');
  if ('seasonTab' in b) put('seasonTab', JSON.stringify(seasonTabOf(b.seasonTab)));
  if ('dailyBriefsChannel' in b) put('dailyBriefsChannel', CHANNEL.test(word(b.dailyBriefsChannel)) ? word(b.dailyBriefsChannel) : '');
  if ('briefClientStyle' in b) put('briefClientStyle', b.briefClientStyle === 'full' ? 'full' : 'short');
  flag('todayPost');
  flag('actionRemind');
  flag('minOffPost');
  flag('buyerPost');
  if ('buyerOwner' in b && word(b.buyerOwner).trim()) put('buyerOwner', word(b.buyerOwner).trim().slice(0, 40));
  if ('buyerChannel' in b) put('buyerChannel', CHANNEL.test(word(b.buyerChannel)) ? word(b.buyerChannel) : '');
  flag('morningCard');
  for (const k of SWITCHES) if (k in b) put(k, isOff(b[k]) ? '0' : '1');
  return rows;
}

/** PUT /api/settings. Only settings rows are written, nothing is sent or posted. As on the old side, the
 *  other rows are saved before the hour is checked, and a good hour is saved under both of its keys. */
export async function saveSettings(ctx, input) {
  const b = isPlainObject(input.body) ? input.body : {};
  await ctx.db.batch(rowsFor(b));
  if ('morningHour' in b) {
    const h = +b.morningHour;
    if (!Number.isInteger(h) || h < 0 || h > 23) fail(400, 'The hour is a whole number from 0 to 23.');
    await ctx.db.batch([['platform.settingPut', { key: 'morningHour', value: String(h) }],
      ['platform.settingPut', { key: 'briefHour', value: String(h) }]]);
  }
  return { ok: true };
}
