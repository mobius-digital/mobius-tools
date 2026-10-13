// The Cashew spot. One app, one number. The picture follows the voice
// (vo.json, lines 01 to 16); the frame numbers below come from the voiced
// lengths, so a re-voiced line moves every beat after it.
//
//  01 Your bank app says you have $18,400.          a bank app's card, the number counts up
//  02 That is not what you made.                     the field goes to paper, the number becomes a green pill
//  03-06 Rent. The factory. Ads. The tax.            four costs, each takes a bite with a pop
//  07 What you actually kept? $3,120.                the pill melts into a puddle, the character rises, sighs
//  08 You found out in April. From your CPA.         a calendar flips seven months; the CPA's email
//  09 Cashew.                                        the field goes green, the wordmark
//  10 Every account. Every sale. Every bill.         the app's own cards fly in, charts drawing
//  11 One real number. Every night.                  the cards gather into the kept hero, circled
//  12-13 The bill that did not come... One tap. Booked.   the finding card, the tap, the chime
//  14 Monday, 7:02. Here is your week.               the phone, the notification
//  15 Close the month. Hand your CPA a pack.         the close checklist ticks, the pack slides out
//  16 Cashew. Know what you kept.                    dark, the wordmark, the tagline, the nod
import React from 'react';
import { Sequence, interpolate, useCurrentFrame } from 'remotion';
import { cashew as app, cashewNumbers as N, colours } from '../../brand';
import { buildTimeline, type Cue } from '../lib/timeline';
import { Bed, Sfx, Voice } from '../lib/audio';
import { feel, useBump, useExit, useSpring } from '../lib/motion';
import { Big, Caption, Camera, Field, SceneBox, Words } from '../shared/scene';
import { Act, Logo, svg } from '../marks/Mark';
import { BiteBurst, PaperLife } from '../fx/Paper';
import { Phone } from '../shared/pieces';
import { BittenPill, MeltPill } from '../fx/Goo';
import { Cost, costInk } from '../fx/Costs';
import { BankCard, CwClose, CwFinding, CwForecast, CwHeroTile, CwKeptHero, CwNetByMonth, CwPack, CwTile, CwWhereItWent, CwWindow, Zoom, cwMoney as money } from '../ui/cashew';
import { serifStack } from '../lib/fonts';
import { TabsBeat, cashewTabs } from '../shared/tabsBeat';

// The silence before each line, and how long the picture holds after it.
const cues: Cue[] = [
  { id: '01', gap: 0.6 }, { id: '02', gap: 0.5 }, { id: '03', gap: 0.7 }, { id: '04', gap: 0.35 }, { id: '05', gap: 0.35 }, { id: '06', gap: 0.45 },
  { id: '07', gap: 0.5, hold: 0.9 },
  { id: '07a', gap: 0 }, { id: '07b', gap: 0.15 }, { id: '07c', gap: 0.08 }, { id: '07d', gap: 0.08 }, { id: '07e', gap: 0.08 }, { id: '07f', gap: 0.08 }, { id: '07g', gap: 0.08 }, { id: '07h', gap: 0.08 },
  { id: '07i', gap: 0.15, hold: 0.4 },
  { id: '08', gap: 0 }, { id: '09', gap: 0.7, hold: 0.3 }, { id: '10', gap: 0 }, { id: '11', gap: 0.4, hold: 0.9 },
  { id: '12', gap: 0 }, { id: '13', gap: 0.3, hold: 0.8 }, { id: '14', gap: 0 }, { id: '15', gap: 0.6, hold: 0.5 }, { id: '16', gap: 0.3 },
];
export const tl = buildTimeline('cashew', cues, 2.0);
export const cashewDuration = tl.total;
const A = (id: string) => tl.at(id);
const E = (id: string) => tl.end(id);

// The numbers must add up, or the spot refuses to render.
const biteSum = N.bites.reduce((s, b) => s + b.amount, 0);
if (biteSum !== N.inBank - N.kept) {
  throw new Error(`brand.ts: the bites add up to ${biteSum}, but inBank minus kept is ${N.inBank - N.kept}; they miss by ${N.inBank - N.kept - biteSum}.`);
}
const balances = N.bites.reduce<number[]>((acc, b) => [...acc, acc[acc.length - 1] - b.amount], [N.inBank]);

const G = colours.cashew;
const INK = colours.ink;
const PAPER = colours.paper;
const NIGHT = colours.night;
const W = colours.onField;
const CHOMP = 22; // frames after a cost arrives when its bite lands

// ---- 01. The bank app ------------------------------------------------------
const SceneBank: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const out = useExit(len, 10);
  const pop = s(0, feel.pop);
  const count = s(14, feel.settle, 70);
  const line = s(20, feel.settle, 60);
  const cam = s(30, feel.soft, 120);
  return (
    <SceneBox opacity={out}>
      <Camera p={cam} zoom={1.1} cy={880}>
        <div style={{ position: 'absolute', left: 540 - 336, top: 560, transform: `scale(${0.8 + 0.2 * pop}) translateY(${(1 - pop) * 60}px)`, opacity: pop, transformOrigin: '50% 50%' }}>
          <Zoom k={1.6} w={420}>
            <BankCard count={count} t={line} />
          </Zoom>
        </div>
      </Camera>
      <Caption text="Sunday night. You check the bank." y={330} p={s(6, feel.settle)} color={W} size={46} />
    </SceneBox>
  );
};

// ---- 02 to 07. The pill, the bites, the melt -------------------------------
const spots = [
  { x: 1.0, y: 0.34, r: 80 }, // rent, from the right
  { x: 0.0, y: 0.7, r: 86 }, // the factory, from the left
  { x: 0.7, y: 0.0, r: 76 }, // ads, from above
  { x: 0.3, y: 1.0, r: 80 }, // the tax, from below
];
const costHome = [
  { x: 790, y: 620, from: [420, 0] }, // where each cost sits beside the pill, and the offset it enters from
  { x: 50, y: 850, from: [-440, 0] },
  { x: 610, y: 410, from: [120, -540] },
  { x: 240, y: 970, from: [-80, 580] },
];
const PILL = { x: 160, y: 690, w: 760, h: 270 };
const FLOOR = PILL.y + PILL.h + 320;

const SceneBites: React.FC<{ len: number; biteAt: number[]; meltAt: number; sighAt: number }> = ({ len, biteAt, meltAt, sighAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 12);
  const pillIn = s(0, feel.pop);
  // The balance on screen: counts down at each chomp.
  let value = N.inBank;
  let squash = 0;
  let shoveX = 0;
  N.bites.forEach((b, i) => {
    const c = biteAt[i] + CHOMP;
    value -= b.amount * s(c, feel.snap);
    const k = bump(c, 4, feel.wobble);
    squash += k;
    shoveX += k * (i % 2 ? 1 : -1) * 18;
  });
  const bites = N.bites.map((_, i) => s(biteAt[i] + CHOMP, feel.pop));
  const melt = s(meltAt, feel.heavy, 86);
  const melting = f >= meltAt;
  const landed = N.bites.filter((_, i) => f >= biteAt[i] + CHOMP).length;
  // The caption: one line per beat.
  const captions: [number, string][] = [
    [0, 'That is not what you *made*.'],
    [biteAt[0], 'Rent takes a bite.'],
    [biteAt[1], 'The factory takes a bite.'],
    [biteAt[2], 'Ads *burn*.'],
    [biteAt[3], 'And the tax you owe, but have not paid.'],
    [meltAt + 30, 'What you *actually* kept.'],
  ];
  const cap = captions.filter(([at]) => f >= at).pop() ?? captions[0];
  const capP = s(cap[0], feel.settle);
  // After the melt: the number above the puddle, the character out of it.
  const figIn = s(meltAt + 56, feel.pop);
  const charIn = s(meltAt + 40, feel.heavy);
  const land = bump(meltAt + 62, 4, feel.wobble);
  const sighIn = s(sighAt, feel.heavy);
  const sighOut = s(sighAt + 40, feel.soft);
  const sigh = sighIn - sighOut * 0.6; // it deflates, then half fills again
  const sighWord = s(sighAt + 4, feel.settle);
  const peek = s(meltAt + 56, feel.settle); // the eyes go up to the number
  const valueText = money(melting ? Math.max(N.kept, value) : value);
  return (
    <SceneBox opacity={out}>
      <Caption text={cap[1]} y={330} p={capP} color={INK} accentColor={G} size={54} />
      {/* the pill, bitten */}
      {!melting && (
        <div style={{ position: 'absolute', left: PILL.x, top: PILL.y, transform: `translateX(${shoveX}px) scale(${(0.6 + 0.4 * pillIn) * (1 + squash * 0.06)}, ${(0.6 + 0.4 * pillIn) * (1 - squash * 0.1)})`, opacity: pillIn, transformOrigin: '50% 50%' }}>
          <BittenPill w={PILL.w} h={PILL.h} color={G} spots={spots} bites={bites}>
            <Big text={valueText} size={132} color={W} />
          </BittenPill>
        </div>
      )}
      {/* the melt */}
      {melting && (
        <MeltPill w={PILL.w} h={PILL.h} t={melt} color={G} floor={FLOOR} width={1080} height={1920} top={PILL.y} spots={spots}>
          <Big text={valueText} size={132} color={W} />
        </MeltPill>
      )}
      {/* crumbs at each chomp */}
      {N.bites.map((_, i) => {
        const c = biteAt[i] + CHOMP;
        const t = interpolate(f, [c, c + 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const sp = spots[i];
        return (
          <div key={i} style={{ position: 'absolute', left: PILL.x + sp.x * PILL.w, top: PILL.y + sp.y * PILL.h }}>
            <BiteBurst t={t} color={G} digits={money(N.bites[i].amount)} seed={i + 2} dir={sp.x > 0.5 ? 1 : -1} />
          </div>
        );
      })}
      {/* the costs */}
      {N.bites.map((b, i) => {
        const arrive = biteAt[i];
        const leave = i < 3 ? biteAt[i + 1] + 4 : meltAt + 6;
        const inP = s(arrive, feel.pop);
        const outP = s(leave, feel.soft);
        if (f < arrive - 2 || outP > 0.98) return null;
        const home = costHome[i];
        const lunge = bump(arrive + CHOMP - 6, 6, feel.snap);
        const toward = [PILL.x + spots[i].x * PILL.w - (home.x + 115), PILL.y + spots[i].y * PILL.h - (home.y + 115)];
        const squint = bump(arrive + CHOMP - 2, 10, feel.snap);
        const amountP = s(arrive + CHOMP + 3, feel.pop);
        const dx = home.from[0] * (1 - inP) + toward[0] * 0.22 * lunge + home.from[0] * 0.5 * outP;
        const dy = home.from[1] * (1 - inP) + toward[1] * 0.22 * lunge + 120 * outP;
        return (
          <div key={b.who} style={{ position: 'absolute', left: home.x, top: home.y, transform: `translate(${dx}px, ${dy}px) rotate(${(1 - inP) * (i % 2 ? -14 : 14)}deg)`, opacity: Math.min(inP * 1.5, 1 - outP) }}>
            <Cost who={b.who} size={240} squint={squint} />
            <div style={{ position: 'absolute', left: i % 2 ? 230 : -60, top: 200, fontSize: 60, fontWeight: 800, letterSpacing: '-0.03em', color: costInk[b.who], whiteSpace: 'nowrap', transform: `scale(${0.5 + 0.5 * amountP}) translateY(${(1 - amountP) * 20}px)`, opacity: amountP, transformOrigin: i % 2 ? '0 50%' : '100% 50%', textShadow: '0 2px 0 rgba(255,255,255,.6)' }}>
              −{money(b.amount)}
            </div>
          </div>
        );
      })}
      {/* after the melt: the real number, the character out of the puddle */}
      {melting && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', transform: `scale(${0.7 + 0.3 * figIn}) translateY(${(1 - figIn) * 40}px)`, opacity: figIn, transformOrigin: '50% 50%' }}>
            <Big text={money(N.kept)} size={210} color={G} />
          </div>
          <div style={{ position: 'absolute', left: 540 - 260, top: FLOOR - 456, clipPath: 'inset(-300px -300px 12px -300px)', opacity: Math.min(1, charIn * 3) }}>
            <Act
              app={app}
              size={520}
              from={sighIn > 0.3 ? 'asleep' : 'found'}
              to={sighIn > 0.3 ? 'rest' : 'found'}
              t={sighIn > 0.3 ? sighOut : 0}
              face={{ lookY: -4 * peek * (1 - sighIn), lookX: 0, smile: sighIn > 0.3 ? -0.3 + sighOut * 0.3 : 0.1 }}
              squash={-(1 - charIn) * 0.9 + land * 0.5 + sigh * 0.45}
              lift={-(1 - charIn) * 150}
              seed={2}
            />
          </div>
          <div style={{ position: 'absolute', left: 540 + 230, top: FLOOR - 400, fontFamily: serifStack, fontStyle: 'italic', fontSize: 44, color: colours.muted, opacity: sighWord * (1 - s(sighAt + 50, feel.soft)), transform: `translateY(${(1 - sighWord) * 10 - sighWord * 6}px)` }}>(sigh)</div>
        </>
      )}
      {landed === 0 && f > 20 && f < biteAt[0] && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: PILL.y + PILL.h + 40, textAlign: 'center', fontSize: 30, color: colours.muted, opacity: s(24, feel.settle) }}>in the bank</div>
      )}
    </SceneBox>
  );
};

// ---- 07a to 07i. Or add it up yourself: the tabs -------------------------------
const SceneTabs: React.FC<{ len: number; nameAt: number[]; restAt: number; collapseAt: number }> = ({ len, nameAt, restAt, collapseAt }) => {
  const s = useSpring();
  const out = useExit(len, 6);
  return (
    <SceneBox opacity={out}>
      <Caption text="Or add it up *yourself*." y={330} p={s(0, feel.settle)} color={W} size={50} />
      <TabsBeat tabs={cashewTabs} nameAt={nameAt} restAt={restAt} collapseAt={collapseAt} accent={colours.cashewBright} tail="Still no number." tailAt={restAt + 24} word="open." />
    </SceneBox>
  );
};

// ---- 08. April -----------------------------------------------------------------
const months = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April'];
const SceneApril: React.FC<{ len: number; emailAt: number }> = ({ len, emailAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const out = useExit(len, 10);
  const cardIn = s(0, feel.pop);
  const FLIP = 7;
  const first = 8;
  const idx = Math.min(months.length - 1, Math.max(0, Math.floor((f - first) / FLIP) + 1));
  const month = f < first ? months[0] : months[idx];
  const within = f < first ? 1 : Math.min(1, ((f - first) % FLIP) / FLIP);
  const flipScale = idx >= months.length - 1 && f - first >= (months.length - 1) * FLIP ? 1 : Math.abs(Math.cos(within * Math.PI));
  const landed = s(first + (months.length - 1) * FLIP, feel.pop);
  const emailIn = s(emailAt, feel.pop);
  const charIn = s(10, feel.pop);
  return (
    <SceneBox opacity={out}>
      <Caption text="So you found out in *April*." y={330} p={s(2, feel.settle)} color={INK} accentColor={G} size={54} />
      <div style={{ position: 'absolute', left: 540 - 310, top: 600, width: 620, height: 500, background: '#fff', borderRadius: 28, boxShadow: '0 30px 70px rgba(0,0,0,.14)', opacity: cardIn, transform: `scale(${0.85 + 0.15 * cardIn}) rotate(${(1 - landed) * 0}deg)`, padding: '34px 40px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: colours.muted }}>2026</div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: '-0.035em', color: month === 'April' ? '#9C3A2E' : INK, transform: `scaleY(${flipScale}) scale(${1 + (1 - landed) * 0.0})`, transformOrigin: '0 60%', height: 92, lineHeight: '92px' }}>{month}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginTop: 26 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} style={{ fontSize: 16, fontWeight: 600, color: colours.muted, textAlign: 'center' }}>{d}</div>)}
          {Array.from({ length: 28 }, (_, i) => (
            <div key={i} style={{ height: 40, borderRadius: 10, background: month === 'April' && i === 13 ? '#9C3A2E' : '#F1F1EC', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 600, color: month === 'April' && i === 13 ? '#fff' : colours.muted }}>{i + 1}</div>
          ))}
        </div>
      </div>
      {/* the CPA's email */}
      <div style={{ position: 'absolute', left: 540 - 380, top: 1180, width: 760, background: '#fff', borderRadius: 22, boxShadow: '0 24px 60px rgba(0,0,0,.14)', padding: '22px 26px', boxSizing: 'border-box', display: 'flex', gap: 18, alignItems: 'center', opacity: emailIn, transform: `translateY(${(1 - emailIn) * 80}px)` }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1B3A6B', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700, flex: 'none' }}>D</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 650, color: INK }}><span>{N.cpaName}</span><span style={{ color: colours.muted, fontWeight: 500, fontSize: 20 }}>Apr 14</span></div>
          <div style={{ fontSize: 22, color: INK, marginTop: 4, fontWeight: 600 }}>Your 2025 return is ready</div>
          <div style={{ fontSize: 21, color: colours.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Net income came to $37,400 for the year. Call me when you can, we should talk about the</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 10, top: 1290, transform: `scale(${charIn}) translateY(${(1 - charIn) * 60}px)`, transformOrigin: '50% 100%', opacity: charIn }}>
        <Act app={app} size={430} from="thinking" to="found" t={landed} face={{ lookX: 3.5 * (1 - landed) + Math.sin(f / 3.5) * 1.2 * (1 - landed), lookY: -3.5 }} squash={-useBump()(first + (months.length - 1) * FLIP, 4, feel.wobble) * 0.6} seed={3} />
      </div>
    </SceneBox>
  );
};

// ---- 09 to 11. Cashew, the cards, the one number ---------------------------
const SceneProduct: React.FC<{ len: number; logoAt: number; cardsAt: number; gatherAt: number }> = ({ len, logoAt, cardsAt, gatherAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const out = useExit(len, 10);
  const logo = s(logoAt, feel.pop);
  const ring = s(logoAt, feel.soft, 40);
  const up = s(cardsAt - 10, feel.settle, 40);
  const gather = s(gatherAt, feel.settle, 36);
  const heroIn = s(gatherAt + 10, feel.pop);
  const heroBar = s(gatherAt + 22, feel.settle, 50);
  const circle = s(gatherAt + 46, feel.settle, 40);
  const charIn = s(gatherAt + 26, feel.pop);
  const nod = useBump()(gatherAt + 80, 8, feel.soft);
  const cam = s(gatherAt + 20, feel.soft, 160);
  const k = 1.5;
  const kh = 1.85;
  // Five cards, three waves: every account, every sale, every bill. Laid so every chart stays readable.
  const cards: { at: number; x: number; y: number; rot: number; node: (t: number) => React.ReactNode }[] = [
    { at: cardsAt, x: 40, y: 450, rot: -2, node: (t) => <CwHeroTile t={t} width={520} /> },
    { at: cardsAt + 24, x: 650, y: 770, rot: 2.5, node: (t) => <CwTile label="Revenue, Sep" value={money(N.revenue)} delta={{ amount: money(N.revenue - N.revenuePrev), pct: '11%', up: true, vs: 'vs Aug' }} series={[18.2, 19.4, 20.1, 21.8, 22.1, 24.6]} t={t} width={262} /> },
    { at: cardsAt + 30, x: 30, y: 880, rot: 1.5, node: (t) => <CwNetByMonth t={t} width={420} /> },
    { at: cardsAt + 50, x: 560, y: 1070, rot: -2, node: (t) => <CwWhereItWent t={t} width={330} /> },
    { at: cardsAt + 58, x: 60, y: 1300, rot: 1.5, node: (t) => <CwForecast t={t} width={520} /> },
  ];
  const capText = f < cardsAt ? 'Every account. Every sale. Every bill.' : f < gatherAt + 14 ? 'Every account. Every sale. Every bill.' : 'One *real* number. Every night.';
  const capP = s(f < gatherAt + 14 ? cardsAt : gatherAt + 14, feel.settle);
  return (
    <SceneBox opacity={out}>
      {/* the ring behind the wordmark */}
      <div style={{ position: 'absolute', left: 540 - 400, top: 900 - 400, width: 800, height: 800, borderRadius: '50%', border: `3px solid ${colours.onFieldLine}`, transform: `scale(${0.2 + ring * 1.3})`, opacity: (1 - ring) * 0.9 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 900 - 80 - up * 650, display: 'flex', justifyContent: 'center', transform: `scale(${(0.5 + 0.5 * logo) * (1 - up * 0.55)})`, opacity: logo, transformOrigin: '50% 50%' }}>
        <Logo app={app} height={160} color={W} />
      </div>
      {f >= cardsAt - 4 && <Caption text={capText} y={352} p={capP} color={W} size={44} />}
      <Camera p={cam} zoom={1.12} cy={1000}>
        {cards.map((c, i) => {
          const p = s(c.at, feel.pop);
          const draw = s(c.at + 10, feel.settle, 44);
          if (f < c.at - 2) return null;
          const gx = 540 - c.x - 260;
          const gy = 1000 - c.y - 160;
          return (
            <div key={i} style={{ position: 'absolute', left: c.x, top: c.y, transform: `translate(${(1 - p) * 420 + gather * gx}px, ${(1 - p) * 320 + gather * gy}px) rotate(${c.rot * (1 - p * 0.6) * (1 - gather)}deg) scale(${(0.9 + 0.1 * p) * (1 - gather * 0.75)})`, opacity: Math.min(1, p * 1.5) * (1 - gather), transformOrigin: '50% 50%', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.28))' }}>
              <Zoom k={k} w={520}>{c.node(draw)}</Zoom>
            </div>
          );
        })}
        {f >= gatherAt + 8 && (
          <div style={{ position: 'absolute', left: 540 - (520 * kh) / 2, top: 700, transform: `scale(${0.6 + 0.4 * heroIn})`, opacity: heroIn, transformOrigin: '50% 40%', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.3))' }}>
            <Zoom k={kh} w={520}>
              <CwKeptHero t={heroBar} count={heroIn} circle={circle} />
            </Zoom>
          </div>
        )}
      </Camera>
      {(() => {
        // In with the wordmark at centre, 380px, a hop; off to the corner when the cards come; a nod at the number.
        const big = s(logoAt + 6, feel.pop);
        const aside = s(cardsAt - 12, feel.settle, 30);
        const hop = useBump()(logoAt + 10, 6, feel.pop);
        const x = interpolate(aside, [0, 1], [540 - 240, 760]);
        const y = interpolate(aside, [0, 1], [1030, 1470]);
        const k = interpolate(aside, [0, 1], [1, 0.6]) * (gatherAt + 26 > f ? 1 : 1);
        return (
          <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${k * Math.max(big, 0.001)})`, transformOrigin: '0 0', opacity: Math.min(1, big * 2) * (charIn > 0 ? 1 : 1) }}>
            <Act app={app} size={480} from="rest" to="found" t={charIn} lift={hop * 40} squash={-hop * 0.5 + nod * 0.4} face={{ lookY: aside > 0.5 ? -2.5 : 0, lookX: aside > 0.5 ? -3 : 0 }} seed={4} />
          </div>
        );
      })()}
    </SceneBox>
  );
};

// ---- 12 and 13. The tap on the shoulder ----------------------------------------
const SceneNudge: React.FC<{ len: number; secondAt: number; shoulderAt: number; tapAt: number }> = ({ len, secondAt, shoulderAt, tapAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const rows = [s(6, feel.pop), s(secondAt, feel.pop)];
  const pressed = bump(tapAt, 5, feel.snap);
  const tap = interpolate(f, [tapAt - 8, tapAt + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const booked = s(tapAt + 14, feel.pop);
  const perk = s(shoulderAt, feel.pop);
  const hop = bump(tapAt + 10, 8, feel.pop);
  const cam = s(shoulderAt - 20, feel.soft, 140);
  const capText = f < shoulderAt ? 'The bill that did not come.' : 'Cashew taps you on the *shoulder*.';
  const capP = s(f < shoulderAt ? 0 : shoulderAt, feel.settle);
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={330} p={capP} color={W} size={50} />
      <Camera p={cam} zoom={1.12} cx={540} cy={860}>
        <div style={{ position: 'absolute', left: 50, top: 520, transform: `translateY(${(1 - win) * 140}px) scale(${0.92 + 0.08 * win})`, opacity: win, transformOrigin: '50% 0' }}>
          <Zoom k={1.75} w={560}>
            <CwWindow width={560} crumb={['Home', 'Overview']} tabs={['Overview', 'Transactions', 'Receipts', 'Close']} active={0} faceState={booked > 0.5 ? 'clear' : 'found'}>
              <CwFinding width={524} show={rows} pressed={pressed} booked={booked} tap={tap} />
            </CwWindow>
          </Zoom>
        </div>
      </Camera>
      {/* the character at the edge, thinking, then it has found something */}
      <div style={{ position: 'absolute', left: 640, top: 1330 + (1 - s(0, feel.pop)) * 200 }}>
        <Act app={app} size={410} from={booked > 0.5 ? 'found' : 'thinking'} to={booked > 0.5 ? 'clear' : 'found'} t={booked > 0.5 ? booked : perk} tilt={-perk * 10 * (1 - booked) - bump(tapAt - 6, 6, feel.snap) * 8} lift={hop * 60} squash={-hop * 0.6 + bump(tapAt + 30, 5, feel.wobble) * 0.5} face={{ lookX: -3.5 * (1 - booked), lookY: -3 * (1 - booked) }} seed={5} />
      </div>
      {booked > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 1300, textAlign: 'center', opacity: booked, transform: `scale(${0.8 + 0.2 * booked})` }}>
          <Words text="*Booked.*" size={110} color={W} />
        </div>
      )}
    </SceneBox>
  );
};

// ---- 14. Monday, 7:02 ---------------------------------------------------------
const SceneMonday: React.FC<{ len: number; noteAt: number }> = ({ len, noteAt }) => {
  const s = useSpring();
  const out = useExit(len, 10);
  const phone = s(0, feel.pop);
  const note = s(noteAt, feel.pop);
  const charIn = s(noteAt + 20, feel.pop);
  const cam = s(noteAt, feel.soft, 120);
  const Mark = svg('cashew/mark.svg');
  return (
    <SceneBox opacity={out}>
      <Caption text="Monday, *7:02*." y={300} p={s(4, feel.settle)} color={W} size={54} />
      <Camera p={cam} zoom={1.08} cy={980}>
        <div style={{ position: 'absolute', left: 540 - 260, top: 480, transform: `translateY(${(1 - phone) * 160}px) scale(${0.9 + 0.1 * phone})`, opacity: phone, transformOrigin: '50% 30%' }}>
          <Phone width={520} height={1060} frame="#1A1C24" screen="linear-gradient(180deg,#1d2230 0%,#0f1118 70%)">
            <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 150, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1 }}>{N.mondayLine.time}</div>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'rgba(255,255,255,.7)', marginTop: 10 }}>{N.mondayLine.day}, October 13</div>
            </div>
            <div style={{ position: 'absolute', top: 420, left: 24, right: 24, background: 'rgba(255,255,255,.96)', borderRadius: 28, padding: '20px 22px', boxSizing: 'border-box', color: INK, transform: `translateY(${(1 - note) * -300}px) scale(${0.9 + 0.1 * note})`, opacity: note, boxShadow: '0 20px 50px rgba(0,0,0,.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 44, height: 44, borderRadius: 11, background: G, display: 'grid', placeItems: 'center', color: '#fff' }}><Mark style={{ width: 28, height: 28 }} /></span>
                <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '.04em', color: colours.muted }}>CASHEW</span>
                <span style={{ marginLeft: 'auto', fontSize: 19, color: colours.muted }}>now</span>
              </div>
              <div style={{ fontSize: 27, fontWeight: 650, marginTop: 14, letterSpacing: '-0.015em' }}>Here is your week.</div>
              <div style={{ fontSize: 23, lineHeight: 1.4, marginTop: 6, color: '#3F4744' }}>{N.mondayLine.text.replace('Here is your week. ', '')}</div>
            </div>
          </Phone>
        </div>
      </Camera>
      <div style={{ position: 'absolute', left: 0, top: 1390, transform: `scale(${charIn}) translateY(${(1 - charIn) * 60}px)`, transformOrigin: '50% 100%', opacity: charIn }}>
        <Act app={app} size={340} from="asleep" to="clear" t={s(noteAt + 26, feel.pop)} squash={-useBump()(noteAt + 26, 6, feel.pop) * 0.6} lift={useBump()(noteAt + 26, 6, feel.pop) * 30} seed={6} />
      </div>
    </SceneBox>
  );
};

// ---- 15. Close the month, the pack --------------------------------------------
const SceneClose: React.FC<{ len: number; tickAt: number[]; packAt: number }> = ({ len, tickAt, packAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const ticks = tickAt.map((t) => s(t, feel.pop));
  const pack = s(packAt, feel.settle, 40);
  const nod = bump(packAt + 30, 8, feel.soft);
  const capText = f < packAt ? 'Close the month in *one* sitting.' : 'Hand your CPA a *pack*.';
  const capP = s(f < packAt ? 2 : packAt, feel.settle);
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={330} p={capP} color={W} size={50} />
      <div style={{ position: 'absolute', left: 50, top: 540, transform: `translate(${(1 - win) * 0 - pack * 420}px, ${(1 - win) * 140}px) scale(${(0.92 + 0.08 * win) * (1 - pack * 0.12)})`, opacity: win * (1 - pack * 0.9), transformOrigin: '50% 0' }}>
        <Zoom k={1.8} w={560}>
          <CwWindow width={560} crumb={['Books', 'Close']} tabs={['Transactions', 'Receipts', 'Statements', 'Close']} active={3} faceState="clear">
            <CwClose width={524} ticks={ticks} />
          </CwWindow>
        </Zoom>
      </div>
      {f >= packAt - 2 && (
        <div style={{ position: 'absolute', left: 540 - 368, top: 560, transform: `translateX(${(1 - pack) * 900}px) rotate(${(1 - pack) * 10 - 2}deg)`, transformOrigin: '50% 50%', opacity: Math.min(1, pack * 2) }}>
          <Zoom k={1.6} w={460}>
            <CwPack t={s(packAt + 14, feel.settle, 40)} />
          </Zoom>
        </div>
      )}
      <div style={{ position: 'absolute', left: 720, top: 1410 }}>
        <Act app={app} size={340} from="rest" to="clear" t={s(packAt + 20, feel.pop)} squash={nod * 0.45} tilt={nod * 6} face={{ lookY: nod * 2 }} seed={7} />
      </div>
    </SceneBox>
  );
};

// ---- 16. The end -------------------------------------------------------------
const SceneEnd: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const logo = s(6, feel.pop);
  const line = s(22, feel.settle);
  const charIn = s(30, feel.pop);
  const nod = bump(56, 10, feel.soft) + bump(80, 10, feel.soft);
  const black = interpolate(f, [len - 26, len - 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <SceneBox>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 760, display: 'flex', justifyContent: 'center', transform: `scale(${0.7 + 0.3 * logo})`, opacity: logo }}>
        <Logo app={app} height={130} color={W} />
      </div>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 950, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
        <Words text="Know what you *kept*." size={72} color={W} weight={600} />
      </div>
      <div style={{ position: 'absolute', left: 540 - 270, top: 1030, transform: `scale(${charIn})`, transformOrigin: '50% 100%', opacity: Math.min(1, charIn * 2) }}>
        <Act app={app} size={540} from="rest" to="clear" t={s(52, feel.pop)} squash={nod * 0.4 - useBump()(30, 4, feel.pop) * 0.4} face={{ lookY: nod * 2.5 }} seed={8} />
      </div>
      <div style={{ position: 'absolute', inset: -200, background: '#000', opacity: black }} />
    </SceneBox>
  );
};

// ---- The spot ------------------------------------------------------------------
export const CashewSpot: React.FC = () => {
  const bank = [0, A('02') + 8] as const;
  const bites = [A('02') - 6, A('07a') - 2] as const;
  const tabs = [A('07a') - 8, A('08') - 2] as const;
  const april = [A('08') - 6, A('09') - 10] as const;
  const product = [A('09') - 12, A('12') - 2] as const;
  const nudge = [A('12') - 6, A('14') - 6] as const;
  const monday = [A('14') - 8, A('15') - 8] as const;
  const close = [A('15') - 10, A('16') - 10] as const;
  const end = [A('16') - 12, tl.total] as const;
  const biteAt = ['03', '04', '05', '06'].map((id) => A(id) - bites[0]);
  const nameAt = ['07b', '07c', '07d', '07e', '07f', '07g', '07h'].map((id) => A(id) - tabs[0] + 4);
  const restAt = A('07i') - tabs[0] + 10;
  const collapseAt = E('07i') - tabs[0] - 4;
  const meltAt = A('07') - bites[0];
  const sighAt = E('07') - bites[0] + 8;
  const tapAt = A('13') - nudge[0] + 56;
  const tickAt = [8, 18, 28, 38, 56].map((t) => A('15') - close[0] + t);
  const packAt = A('15') - close[0] + 74;
  return (
    <Field stops={[[0, G], [bites[0] + 4, PAPER], [tabs[0] + 6, NIGHT], [april[0] + 12, PAPER], [product[0] + 6, G], [monday[0] + 6, NIGHT], [close[0] + 6, G], [end[0] + 6, NIGHT]]}>
      <PaperLife from={bites[0] + 4} to={tabs[0] + 6} accent={G} seed="bites" />
      <PaperLife from={april[0] + 12} to={product[0] + 6} accent={G} seed="april" />
      <Sequence from={bank[0]} durationInFrames={bank[1] - bank[0]} name="bank"><SceneBank len={bank[1] - bank[0]} /></Sequence>
      <Sequence from={bites[0]} durationInFrames={bites[1] - bites[0]} name="bites"><SceneBites len={bites[1] - bites[0]} biteAt={biteAt} meltAt={meltAt} sighAt={sighAt} /></Sequence>
      <Sequence from={tabs[0]} durationInFrames={tabs[1] - tabs[0]} name="tabs"><SceneTabs len={tabs[1] - tabs[0]} nameAt={nameAt} restAt={restAt} collapseAt={collapseAt} /></Sequence>
      <Sequence from={april[0]} durationInFrames={april[1] - april[0]} name="april"><SceneApril len={april[1] - april[0]} emailAt={E('08') - april[0] - 34} /></Sequence>
      <Sequence from={product[0]} durationInFrames={product[1] - product[0]} name="product"><SceneProduct len={product[1] - product[0]} logoAt={A('09') - product[0]} cardsAt={A('10') - product[0]} gatherAt={A('11') - product[0]} /></Sequence>
      <Sequence from={nudge[0]} durationInFrames={nudge[1] - nudge[0]} name="nudge"><SceneNudge len={nudge[1] - nudge[0]} secondAt={A('12') - nudge[0] + 48} shoulderAt={A('13') - nudge[0]} tapAt={tapAt} /></Sequence>
      <Sequence from={monday[0]} durationInFrames={monday[1] - monday[0]} name="monday"><SceneMonday len={monday[1] - monday[0]} noteAt={A('14') - monday[0] + 22} /></Sequence>
      <Sequence from={close[0]} durationInFrames={close[1] - close[0]} name="close"><SceneClose len={close[1] - close[0]} tickAt={tickAt} packAt={packAt} /></Sequence>
      <Sequence from={end[0]} durationInFrames={end[1] - end[0]} name="end"><SceneEnd len={end[1] - end[0]} /></Sequence>

      {/* the mix */}
      <Voice tl={tl} ids={cues.map((c) => c.id)} />
      <Bed name="bed-cashew" tl={tl} />
      {biteAt.map((b, i) => <Sfx key={i} name="pop" at={bites[0] + b + CHOMP} volume={0.7} rate={1 - i * 0.06} />)}
      <Sfx name="whoosh" at={bites[0] + meltAt} volume={0.6} />
      <Sfx name="wake" at={bites[0] + meltAt + 48} volume={0.3} />
      <Sfx name="land" at={bites[0] + meltAt + 62} volume={0.55} />
      <Sfx name="sigh" at={bites[0] + sighAt} volume={0.6} />
      <Sfx name="hop" at={april[0] + 8 + 7 * 7} volume={0.4} />
      <Sfx name="hop" at={A('09') + 10} volume={0.4} rate={1.1} />
      <Sfx name="hop" at={nudge[0] + tapAt + 10} volume={0.4} rate={1.15} />
      <Sfx name="hop" at={A('14') + 22 + 26} volume={0.3} />
      <Sfx name="land" at={end[0] + 32} volume={0.4} />
      {nameAt.map((t, i) => <Sfx key={`n${i}`} name="tick" at={tabs[0] + t} volume={0.4} rate={1.1 + (i % 3) * 0.08} />)}
      {Array.from({ length: 7 }, (_, i) => <Sfx key={`r${i}`} name="tick" at={tabs[0] + restAt + i * 3} volume={0.25} rate={1.3 + (i % 3) * 0.1} />)}
      <Sfx name="whoosh" at={tabs[0] + collapseAt} volume={0.4} rate={1.3} />
      {Array.from({ length: 7 }, (_, i) => <Sfx key={i} name="tick" at={april[0] + 8 + i * 7} volume={0.35} rate={1.2} />)}
      <Sfx name="riser" at={A('09') - 50} volume={0.55} />
      <Sfx name="chime-low" at={A('09')} volume={0.35} />
      {[0, 24, 30, 50, 58].map((d, i) => <Sfx key={i} name="wake" at={A('10') + d} volume={0.18} rate={1.3 + i * 0.05} />)}
      <Sfx name="whoosh" at={A('11')} volume={0.35} rate={1.4} />
      <Sfx name="tick" at={A('11') + 46} volume={0.3} />
      <Sfx name="wake" at={A('12')} volume={0.3} />
      <Sfx name="tick" at={nudge[0] + tapAt} volume={0.6} />
      <Sfx name="chime" at={nudge[0] + tapAt + 14} volume={0.55} />
      <Sfx name="wake" at={A('14') + 22} volume={0.35} rate={1.1} />
      {tickAt.map((t, i) => <Sfx key={i} name="tick" at={close[0] + t} volume={0.4} rate={1 + i * 0.04} />)}
      <Sfx name="chime-low" at={close[0] + packAt + 30} volume={0.4} />
      <Sfx name="chime" at={A('16')} volume={0.45} />
    </Field>
  );
};
