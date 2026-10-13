// The Locus spot. One app, the morning read and the calls. The picture
// follows the voice (vo.json, lines 01 to 15).
//
//  01-02 Meta says 4.1. Shopify says 2.3.            two platform cards shove each other
//  03 Your ad spend is bleeding.                     the spend bars, the last three turn red and run down the chart
//  04 You find out at 11:47.                         dark, a clock spins to 11:47
//  05 Fourteen tabs open. Nobody knows what to change.   tabs fly in, a count, then they collapse into one point
//  06-07 Locus. It wakes before you do.              the field floods blue, the bead, the character wakes
//  08 Every store. Every ad account. Every email. Read by 7.   Home's own tiles and the day check fly in
//  09 The morning brief.                             the morning line types in, one sentence per brand
//  10 Yesterday you actually kept $4,310.            the hero with the bites bar
//  11 Today's calls. Scale this. Cut that. Refresh this.   the calls, one row per phrase
//  12 One tap. Paused. And logged.                   the tap, the row flips, the chime
//  13 What to make next.                             the proven angle, three iterations
//  14 Every brand, one morning.                      the agency lanes fill
//  15 Locus. Know what to change.                    dark, the lockup, the tagline, the nod
import React from 'react';
import { Sequence, interpolate, useCurrentFrame } from 'remotion';
import { colours, locus as app, locusNumbers as N } from '../../brand';
import { buildTimeline, type Cue } from '../lib/timeline';
import { Bed, Sfx, Voice } from '../lib/audio';
import { feel, useBump, useExit, useSpring } from '../lib/motion';
import { Big, Caption, Camera, Field, SceneBox, Words } from '../shared/scene';
import { Act, LogoLockup } from '../marks/Mark';
import { PaperLife } from '../fx/Paper';
import { LxAngle, LxCalls, LxDayCheck, LxHero, LxLanes, LxMorning, LxSpendBars, LxTile, LxWindow, PlatformCard, Zoom } from '../ui/locus';
import { TabsBeat, locusTabs } from '../shared/tabsBeat';
import { MetaMark, ShopifyMark } from '../ui/marks';
import { serifStack } from '../lib/fonts';

const cues: Cue[] = [
  { id: '01', gap: 0.6 }, { id: '02', gap: 0.4 }, { id: '03', gap: 0.8, hold: 0.7 }, { id: '04', gap: 0 },
  { id: '04a', gap: 0.3 }, { id: '04b', gap: 0.08 }, { id: '04c', gap: 0.08 }, { id: '04d', gap: 0.08 }, { id: '04e', gap: 0.08 }, { id: '04f', gap: 0.08 },
  { id: '05', gap: 0.15, hold: 0.6 },
  { id: '06', gap: 0 }, { id: '07', gap: 0.3 }, { id: '08', gap: 0.5, hold: 0.5 }, { id: '09', gap: 0 }, { id: '10', gap: 0.3, hold: 1.0 },
  { id: '11', gap: 0 }, { id: '12', gap: 0.5, hold: 0.8 }, { id: '13', gap: 0, hold: 0.7 }, { id: '14', gap: 0, hold: 0.8 }, { id: '15', gap: 0.3 },
];
export const tl = buildTimeline('locus', cues, 2.0);
export const locusDuration = tl.total;
const A = (id: string) => tl.at(id);
const E = (id: string) => tl.end(id);

const keptCheck = N.sales - N.bites.reduce((s, b) => s + b.v, 0);
if (keptCheck !== N.kept) throw new Error(`brand.ts: Locus sales minus the bites is ${keptCheck}, not kept ${N.kept}.`);

const B = colours.locus;
const INK = colours.ink;
const PAPER = colours.paper;
const NIGHT = colours.night;
const W = colours.onField;
const RED = colours.blood;
const WIN = { k: 1.75, w: 560, x: 50 }; // the app window: 560 app px wide, scaled to 980

// ---- 01 and 02. Two numbers argue --------------------------------------------
const SceneArgue: React.FC<{ len: number; secondAt: number }> = ({ len, secondAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const left = s(0, feel.pop);
  const right = s(secondAt, feel.pop);
  const shoveL = bump(secondAt + 30, 5, feel.wobble) + bump(secondAt + 70, 5, feel.wobble);
  const shoveR = bump(secondAt + 50, 5, feel.wobble) + bump(secondAt + 90, 5, feel.wobble);
  const q = s(secondAt + 60, feel.pop);
  const capText = f < secondAt ? 'Meta says *4.1*.' : 'Shopify says *2.3*.';
  const capP = s(f < secondAt ? 2 : secondAt, feel.settle);
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={330} p={capP} color={W} size={56} />
      <div style={{ position: 'absolute', left: 50, top: 620, transform: `translateX(${(1 - left) * -600 + shoveL * 70 - shoveR * 26}px) rotate(${(1 - left) * -10 + shoveL * 3}deg)`, opacity: left, transformOrigin: '50% 100%' }}>
        <Zoom k={2.1} w={330}>
          <PlatformCard name="Ads Manager" colour="#0866FF" metric="Purchase ROAS, last 7 days" value={N.metaRoas} note="0.4" up series={[3.2, 3.5, 3.4, 3.8, 3.9, 4.0, 4.1]} t={s(10, feel.settle, 50)} mark={<MetaMark size={14} />} />
        </Zoom>
      </div>
      <div style={{ position: 'absolute', left: 1080 - 50 - 693, top: 1060, transform: `translateX(${(1 - right) * 600 - shoveR * 70 + shoveL * 26}px) rotate(${(1 - right) * 10 - shoveR * 3}deg)`, opacity: right, transformOrigin: '50% 0' }}>
        <Zoom k={2.1} w={330}>
          <PlatformCard name="Shopify" colour="#5E8E3E" metric="Total sales over ad spend" value={N.shopifyRoas} note="0.3" up={false} series={[2.9, 2.8, 2.7, 2.6, 2.5, 2.4, 2.3]} t={s(secondAt + 10, feel.settle, 50)} mark={<ShopifyMark size={14} />} />
        </Zoom>
      </div>
      <div style={{ position: 'absolute', left: 540 - 70, top: 980 - 70, width: 140, height: 140, borderRadius: '50%', background: W, color: B, display: 'grid', placeItems: 'center', fontSize: 100, fontWeight: 800, transform: `scale(${q}) rotate(${(1 - q) * 30}deg)`, opacity: q, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>?</div>
    </SceneBox>
  );
};

// ---- 03. The spend bleeds --------------------------------------------------------
const SceneBleed: React.FC<{ len: number; bleedAt: number }> = ({ len, bleedAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const bars = s(8, feel.settle, 44);
  const bleed = s(bleedAt, feel.heavy, 110);
  const cam = s(bleedAt, feel.soft, 150);
  const worry = s(bleedAt + 20, feel.pop);
  const capText = f < bleedAt + 10 ? 'Your ad spend.' : 'Your ad spend is *bleeding*.';
  const capP = s(f < bleedAt + 10 ? 2 : bleedAt + 10, feel.settle);
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={330} p={capP} color={INK} accentColor={RED} size={54} />
      <Camera p={cam} zoom={1.14} cx={560} cy={1000}>
        <div style={{ position: 'absolute', left: WIN.x, top: 560, transform: `translateY(${(1 - win) * 140}px) scale(${0.92 + 0.08 * win})`, opacity: win, transformOrigin: '50% 0' }}>
          <Zoom k={WIN.k} w={WIN.w}>
            <LxWindow width={WIN.w} crumb={['Ads', 'Meta']} tabs={["Today's calls", 'All channels', 'Meta', 'Google', 'TikTok']} active={2} faceState="thinking" badge="Looking">
              <LxSpendBars width={524} t={bars} bleed={bleed} red={RED} />
            </LxWindow>
          </Zoom>
        </div>
      </Camera>
      {(() => {
        // It watches the bars run down, then looks left and right: where did it go?
        const look = f - (bleedAt + 60);
        const lookX = look > 0 ? Math.sin(look / 9) * 4 : 1.5;
        const lookY = look > 0 ? -1 : 3.5 * bleed;
        const shiver = bleed > 0.1 && bleed < 0.95 ? Math.sin(f * 1.7) * 0.05 : 0;
        return (
          <div style={{ position: 'absolute', left: 0, top: 1310, transform: `scale(${worry}) translateY(${(1 - worry) * 60}px)`, transformOrigin: '50% 100%', opacity: worry }}>
            <Act app={app} size={430} from="rest" to="thinking" t={worry} face={{ lookX, lookY, smile: -0.4 * bleed, mouthOpen: 0.3 * bleed, round: 0.8 }} squash={shiver} tilt={look > 0 ? Math.sin(look / 9) * 5 : 0} seed={1} />
          </div>
        );
      })()}
    </SceneBox>
  );
};

// ---- 04 and 05. 11:47, then the tabs ----------------------------------------------
const SceneNight: React.FC<{ len: number; nameAt: number[]; restAt: number; collapseAt: number }> = ({ len, nameAt, restAt, collapseAt }) => {
  const s = useSpring();
  const out = useExit(len, 6);
  const clockIn = s(0, feel.pop);
  const spin = s(6, feel.settle, 60); // the hands race round to 11:47
  const timeIn = s(50, feel.pop);
  const minuteDeg = -90 + 360 * (47 / 60) + 720 * (1 - spin);
  const hourDeg = -90 + 360 * ((11 + 47 / 60) / 12) + 60 * (1 - spin);
  const clockOut = 1 - s(nameAt[0] - 10, feel.soft);
  return (
    <SceneBox opacity={out}>
      <div style={{ position: 'absolute', left: 540 - 170, top: 700, width: 340, height: 340, borderRadius: '50%', background: '#F4F4F6', transform: `scale(${clockIn * clockOut})`, opacity: clockIn * clockOut, boxShadow: '0 0 0 14px rgba(255,255,255,.06), 0 30px 80px rgba(0,0,0,.6)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 110, height: 8, background: '#15171C', borderRadius: 4, transformOrigin: '0 50%', transform: `rotate(${hourDeg}deg) translateY(-4px)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 150, height: 6, background: '#15171C', borderRadius: 3, transformOrigin: '0 50%', transform: `rotate(${minuteDeg}deg) translateY(-3px)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 16, height: 16, borderRadius: '50%', background: colours.blood, transform: 'translate(-50%,-50%)' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1090, textAlign: 'center', opacity: timeIn * clockOut, transform: `scale(${0.8 + 0.2 * timeIn})` }}>
        <Big text={N.clock} size={150} color={W} />
        <div style={{ fontFamily: serifStack, fontStyle: 'italic', fontSize: 60, color: 'rgba(255,255,255,.75)', marginTop: 6 }}>at night.</div>
      </div>
      <Caption text={clockOut > 0.5 ? 'And you find out' : '11:47, with everything open.'} y={330} p={clockOut > 0.5 ? s(2, feel.settle) : s(nameAt[0] - 6, feel.settle)} color={W} size={46} />
      <TabsBeat tabs={locusTabs} nameAt={nameAt} restAt={restAt} collapseAt={collapseAt} accent="#8FB3FF" tail="Nobody knows what to change." tailAt={restAt + 20} />
    </SceneBox>
  );
};

// ---- 06 and 07. Locus wakes ------------------------------------------------------
const SceneWake: React.FC<{ len: number; nameAt: number; wakeAt: number }> = ({ len, nameAt, wakeAt }) => {
  const s = useSpring();
  const out = useExit(len, 10);
  const flood = s(0, feel.settle, 40);
  const lockup = s(nameAt, feel.pop);
  const wake = s(wakeAt + 4, feel.pop);
  const blink = useBump()(wakeAt + 26, 3, feel.snap);
  const lift = s(wakeAt, feel.pop);
  const line = s(wakeAt + 10, feel.settle);
  const frame = useCurrentFrame();
  return (
    <SceneBox opacity={out}>
      <div style={{ position: 'absolute', left: 540 - 1400, top: 940 - 1400, width: 2800, height: 2800, borderRadius: '50%', background: B, transform: `scale(${flood})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 760, display: 'flex', justifyContent: 'center', transform: `scale(${0.6 + 0.4 * lockup})`, opacity: lockup, color: W }}>
        <LogoLockup app={app} height={120} color={W} />
      </div>
      <Caption text="It wakes before *you* do." y={1010} p={line} color={W} size={50} />
      <div style={{ position: 'absolute', left: 540 - 280, top: 1050, transform: `translateY(${(1 - lift) * 40}px)`, opacity: Math.min(1, lockup * 2) }}>
        <Act app={app} size={560} from="asleep" to="found" t={wake} blink={blink} squash={0.35 * (1 - lift) - useBump()(wakeAt, 8, feel.pop) * 0.7} lift={useBump()(wakeAt, 8, feel.pop) * 30} spin={wake > 0.05 ? (wake * 0.6 + frame / 80) % 1 : -1} seed={2} />
      </div>
    </SceneBox>
  );
};

// ---- 08 to 10. The read: tiles, the morning line, the hero ------------------------
const SceneRead: React.FC<{ len: number; waves: number[]; readAt: number; morningAt: number; heroAt: number }> = ({ len, waves, readAt, morningAt, heroAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const tileIn = [waves[0], waves[0] + 8, waves[1], waves[1] + 8].map((t) => s(t, feel.pop));
  const tileDraw = [waves[0], waves[0] + 8, waves[1], waves[1] + 8].map((t) => s(t + 10, feel.settle, 40));
  const dayIn = s(waves[2], feel.pop);
  const dayDraw = s(waves[2] + 6, feel.settle, 44);
  const read = s(readAt, feel.pop);
  const morning = s(morningAt, feel.pop);
  const typed = N.morning.map((l, i) => interpolate(f, [morningAt + 10 + i * 24, morningAt + 10 + i * 24 + l.length * 0.55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const hero = s(heroAt, feel.pop);
  const heroBar = s(heroAt + 14, feel.settle, 56);
  const heroCount = s(heroAt + 6, feel.settle, 50);
  const scrollUp = s(heroAt - 4, feel.settle, 40);
  const cam = s(heroAt + 10, feel.soft, 150);
  const charState = f < morningAt ? 'rest' : 'found';
  void charState;
  const capText = f < morningAt ? 'Every store. Every ad account. Every email.' : f < heroAt ? 'The morning *brief*.' : 'What you *actually* kept.';
  const capAt = f < morningAt ? waves[0] : f < heroAt ? morningAt : heroAt;
  const capP = s(capAt, feel.settle);
  const tiles = N.tiles;
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={300} p={capP} color={W} size={46} />
      <Camera p={cam} zoom={1.1} cx={540} cy={760}>
        <div style={{ position: 'absolute', left: WIN.x, top: 470 - scrollUp * 60, transform: `translateY(${(1 - win) * 160}px) scale(${0.92 + 0.08 * win})`, opacity: win, transformOrigin: '50% 0' }}>
          <Zoom k={WIN.k} w={WIN.w}>
            <LxWindow width={WIN.w} crumb={['Home', 'Overview']} tabs={['Overview', 'Day check', 'P&L', 'Goals', 'Requests']} active={0} faceState={charState} badge={f < morningAt ? 'Locus' : '2 to do'}>
              {f >= morningAt - 2 && (
                <div style={{ transform: `translateY(${(1 - morning) * -30}px)`, opacity: morning }}>
                  <LxMorning width={524} lines={N.morning} shown={typed} faceState="found" />
                </div>
              )}
              {f >= heroAt - 2 && (
                <div style={{ transform: `scale(${0.9 + 0.1 * hero})`, opacity: hero, transformOrigin: '50% 0' }}>
                  <LxHero width={524} t={heroBar} count={heroCount} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxHeight: scrollUp > 0.5 && f >= heroAt ? 0 : 400, overflow: 'hidden', opacity: 1 - scrollUp }}>
                {tiles.map((tile, i) => (
                  <div key={tile.label} style={{ transform: `translate(${(1 - tileIn[i]) * 80}px, ${(1 - tileIn[i]) * 60}px) rotate(${(1 - tileIn[i]) * 3}deg)`, opacity: tileIn[i] }}>
                    <LxTile label={tile.label} value={tile.value} delta={tile.delta} up={tile.up} series={tile.series} t={tileDraw[i]} src={i === 0 ? 'Shopify' : i === 1 ? 'Meta' : undefined} />
                  </div>
                ))}
              </div>
              {f >= waves[2] - 2 && (
                <div style={{ transform: `translateY(${(1 - dayIn) * 60}px)`, opacity: dayIn * (1 - scrollUp) }}>
                  <LxDayCheck width={524} t={dayDraw} />
                </div>
              )}
            </LxWindow>
          </Zoom>
        </div>
      </Camera>
      {/* "Read by 7": the stamp */}
      {f >= readAt - 2 && f < morningAt + 10 && (
        <div style={{ position: 'absolute', left: 540 - 180, top: 1560, width: 360, textAlign: 'center', padding: '14px 0', borderRadius: 999, background: W, color: B, fontSize: 34, fontWeight: 700, transform: `scale(${0.7 + 0.3 * read}) rotate(${(1 - read) * -6}deg)`, opacity: read * (1 - s(morningAt, feel.soft)), boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
          Read by <span style={{ fontFamily: serifStack, fontStyle: 'italic', fontWeight: 400, fontSize: 40 }}>7</span>.
        </div>
      )}
      <div style={{ position: 'absolute', left: 740, top: 1450, transformOrigin: '50% 100%', transform: `translateY(${(1 - win) * 100}px)` }}>
        <Act app={app} size={330} from="rest" to="found" t={s(morningAt, feel.pop)} face={{ lookX: -3, lookY: -3.5 }} lift={useBump()(heroAt, 6, feel.pop) * 30} squash={-useBump()(heroAt, 6, feel.pop) * 0.5} spin={(f / 90) % 1} seed={3} />
      </div>
    </SceneBox>
  );
};

// ---- 11 and 12. Today's calls, one tap ------------------------------------------
const SceneCalls: React.FC<{ len: number; rowAt: number[]; tapAt: number; pausedAt: number }> = ({ len, rowAt, tapAt, pausedAt }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const rows = rowAt.map((t) => s(t, feel.pop));
  const pressed = bump(tapAt, 5, feel.snap);
  const tap = interpolate(f, [tapAt - 8, tapAt + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const done = s(pausedAt, feel.pop);
  const hop = bump(tapAt + 8, 8, feel.pop);
  const perk = s(tapAt - 10, feel.pop);
  const cam = s(rowAt[1], feel.soft, 160);
  const capText = f < tapAt - 12 ? "Today's *calls*." : f < pausedAt ? 'One tap.' : '*Paused.*';
  const capP = s(f < tapAt - 12 ? 2 : f < pausedAt ? tapAt - 12 : pausedAt, feel.settle);
  return (
    <SceneBox opacity={out}>
      <Caption text={capText} y={f < pausedAt ? 300 : 260} p={capP} color={W} size={f < pausedAt ? 50 : 110} />
      <Camera p={cam} zoom={1.08} cx={540} cy={1080}>
        <div style={{ position: 'absolute', left: WIN.x, top: 470, transform: `translateY(${(1 - win) * 160}px) scale(${0.92 + 0.08 * win})`, opacity: win, transformOrigin: '50% 0' }}>
          <Zoom k={WIN.k} w={WIN.w}>
            <LxWindow width={WIN.w} crumb={['Ads', "Today's calls"]} tabs={["Today's calls", 'All channels', 'Meta', 'Google', 'TikTok']} active={0} faceState={done > 0.5 ? 'clear' : 'found'} badge={done > 0.5 ? '2 to do' : '3 to do'}>
              <LxCalls width={524} shown={rows} pressed={pressed} pressedIndex={N.tappedCall} done={done} tap={tap} />
            </LxWindow>
          </Zoom>
        </div>
      </Camera>
      <div style={{ position: 'absolute', left: 620, top: 1330 }}>
        <Act app={app} size={440} from={done > 0.5 ? 'found' : 'rest'} to={done > 0.5 ? 'clear' : 'found'} t={done > 0.5 ? done : perk} tilt={-perk * 9 * (1 - done)} lift={hop * 70} squash={-hop * 0.6 + bump(tapAt + 34, 5, feel.wobble) * 0.5} face={{ lookX: -3.5 * (1 - done), lookY: -3.5 * (1 - done) }} spin={(f / 70) % 1} seed={4} />
      </div>
    </SceneBox>
  );
};

// ---- 13. What to make next --------------------------------------------------------
const SceneAngle: React.FC<{ len: number; pressAt: number }> = ({ len, pressAt }) => {
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const pressed = bump(pressAt, 5, feel.snap);
  const f = useCurrentFrame();
  const tap = interpolate(f, [pressAt - 8, pressAt + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lines = [0, 1, 2].map((i) => s(pressAt + 12 + i * 9, feel.pop));
  return (
    <SceneBox opacity={out}>
      <Caption text="What to make *next*." y={300} p={s(2, feel.settle)} color={W} size={50} />
      <div style={{ position: 'absolute', left: WIN.x, top: 470, transform: `translateX(${(1 - win) * 500}px)`, opacity: win }}>
        <Zoom k={WIN.k} w={WIN.w}>
          <LxWindow width={WIN.w} crumb={['Ads', 'Tests and angles']} tabs={["Today's calls", 'All channels', 'Meta', 'Google', 'Tests and angles']} active={4} faceState="clear" badge="2 to do">
            <LxAngle width={524} pressed={pressed} tap={tap} lines={lines} />
          </LxWindow>
        </Zoom>
      </div>
      <div style={{ position: 'absolute', left: 740, top: 1450 }}>
        <Act app={app} size={330} from="rest" to="found" t={s(pressAt, feel.pop)} face={{ lookX: -3, lookY: -3 }} lift={useBump()(pressAt + 4, 6, feel.pop) * 30} spin={(f / 80) % 1} seed={5} />
      </div>
    </SceneBox>
  );
};

// ---- 14. Every brand, one morning ----------------------------------------------
const SceneAgency: React.FC<{ len: number }> = ({ len }) => {
  const s = useSpring();
  const bump = useBump();
  const out = useExit(len, 10);
  const win = s(0, feel.pop);
  const fill = s(14, feel.settle, 60);
  const count = s(10, feel.settle, 60);
  const nod = bump(70, 10, feel.soft);
  return (
    <SceneBox opacity={out}>
      <Caption text="Every brand. *One* morning." y={300} p={s(2, feel.settle)} color={W} size={50} />
      <div style={{ position: 'absolute', left: WIN.x, top: 470, transform: `translateY(${(1 - win) * 140}px)`, opacity: win }}>
        <Zoom k={WIN.k} w={WIN.w}>
          <LxWindow width={WIN.w} crumb={['Home', 'Overview']} tabs={['Overview', 'Day check', 'P&L', 'Goals', 'Requests']} active={0} faceState="clear" badge="All clear">
            <LxLanes width={524} t={fill} count={count} />
          </LxWindow>
        </Zoom>
      </div>
      <div style={{ position: 'absolute', left: 740, top: 1450 }}>
        <Act app={app} size={330} from="rest" to="clear" t={s(60, feel.pop)} squash={nod * 0.45} face={{ lookY: nod * 2 }} spin={(useCurrentFrame() / 80) % 1} seed={6} />
      </div>
    </SceneBox>
  );
};

// ---- 15. The end --------------------------------------------------------------------
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
      <div style={{ position: 'absolute', left: 0, right: 0, top: 760, display: 'flex', justifyContent: 'center', transform: `scale(${0.7 + 0.3 * logo})`, opacity: logo, color: W }}>
        <LogoLockup app={app} height={120} color={W} />
      </div>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 950, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
        <Words text="Know what to *change*." size={72} color={W} weight={600} />
      </div>
      <div style={{ position: 'absolute', left: 540 - 280, top: 1020, transform: `scale(${charIn})`, transformOrigin: '50% 100%', opacity: Math.min(1, charIn * 2) }}>
        <Act app={app} size={560} from="rest" to="clear" t={s(52, feel.pop)} squash={nod * 0.4 - useBump()(30, 4, feel.pop) * 0.4} face={{ lookY: nod * 2.5 }} spin={(f / 80) % 1} seed={7} />
      </div>
      <div style={{ position: 'absolute', inset: -200, background: '#000', opacity: black }} />
    </SceneBox>
  );
};

// ---- The spot ------------------------------------------------------------------
export const LocusSpot: React.FC = () => {
  const argue = [0, A('03') - 2] as const;
  const bleed = [A('03') - 8, A('04') - 2] as const;
  const night = [A('04') - 8, A('06') + 2] as const;
  const wake = [A('06') - 4, A('08') - 2] as const;
  const read = [A('08') - 8, A('11') - 2] as const;
  const calls = [A('11') - 8, A('13') - 2] as const;
  const angle = [A('13') - 8, A('14') - 2] as const;
  const agency = [A('14') - 8, A('15') - 10] as const;
  const end = [A('15') - 12, tl.total] as const;
  const bleedAt = A('03') - bleed[0] + 26;
  const nameAt = ['04a', '04b', '04c', '04d', '04e', '04f'].map((id) => A(id) - night[0] + 4);
  const restAt = A('05') - night[0] + 10;
  const collapseAt = E('05') - night[0] - 4;
  const waves = [0, 28, 56].map((d) => A('08') - read[0] + d);
  const readAt = A('08') - read[0] + 92;
  const rowAt = [27, 45, 63].map((d) => A('11') - calls[0] + d);
  const tapAt = A('12') - calls[0] + 10;
  const pausedAt = A('12') - calls[0] + 26;
  const pressAt = A('13') - angle[0] + 30;
  return (
    <Field stops={[[0, B], [bleed[0] + 6, PAPER], [night[0] + 6, NIGHT], [read[0] - 10, B], [end[0] + 6, NIGHT]]}>
      <PaperLife from={bleed[0] + 6} to={night[0] + 6} accent={B} seed="bleed" />
      <Sequence from={argue[0]} durationInFrames={argue[1] - argue[0]} name="argue"><SceneArgue len={argue[1] - argue[0]} secondAt={A('02')} /></Sequence>
      <Sequence from={bleed[0]} durationInFrames={bleed[1] - bleed[0]} name="bleed"><SceneBleed len={bleed[1] - bleed[0]} bleedAt={bleedAt} /></Sequence>
      <Sequence from={night[0]} durationInFrames={night[1] - night[0]} name="night"><SceneNight len={night[1] - night[0]} nameAt={nameAt} restAt={restAt} collapseAt={collapseAt} /></Sequence>
      <Sequence from={wake[0]} durationInFrames={wake[1] - wake[0]} name="wake"><SceneWake len={wake[1] - wake[0]} nameAt={A('06') - wake[0]} wakeAt={A('07') - wake[0]} /></Sequence>
      <Sequence from={read[0]} durationInFrames={read[1] - read[0]} name="read"><SceneRead len={read[1] - read[0]} waves={waves} readAt={readAt} morningAt={A('09') - read[0]} heroAt={A('10') - read[0]} /></Sequence>
      <Sequence from={calls[0]} durationInFrames={calls[1] - calls[0]} name="calls"><SceneCalls len={calls[1] - calls[0]} rowAt={rowAt} tapAt={tapAt} pausedAt={pausedAt} /></Sequence>
      <Sequence from={angle[0]} durationInFrames={angle[1] - angle[0]} name="angle"><SceneAngle len={angle[1] - angle[0]} pressAt={pressAt} /></Sequence>
      <Sequence from={agency[0]} durationInFrames={agency[1] - agency[0]} name="agency"><SceneAgency len={agency[1] - agency[0]} /></Sequence>
      <Sequence from={end[0]} durationInFrames={end[1] - end[0]} name="end"><SceneEnd len={end[1] - end[0]} /></Sequence>

      {/* the mix */}
      <Voice tl={tl} ids={cues.map((c) => c.id)} />
      <Bed name="bed-locus" tl={tl} />
      <Sfx name="pop" at={A('01')} volume={0.4} rate={0.9} />
      <Sfx name="pop" at={A('02')} volume={0.4} rate={0.8} />
      <Sfx name="tick" at={A('02') + 60} volume={0.4} />
      {[0, 10, 22, 36, 52].map((d, i) => <Sfx key={i} name="drip" at={bleed[0] + bleedAt + 10 + d} volume={0.4} rate={1 - i * 0.08} />)}
      <Sfx name="whoosh" at={bleed[0] + bleedAt} volume={0.3} rate={0.8} />
      <Sfx name="tick" at={A('04') + 50} volume={0.4} rate={0.8} />
      {nameAt.map((t, i) => <Sfx key={i} name="tick" at={night[0] + t} volume={0.4} rate={1.1 + (i % 3) * 0.08} />)}
      {Array.from({ length: 8 }, (_, i) => <Sfx key={`r${i}`} name="tick" at={night[0] + restAt + i * 3} volume={0.25} rate={1.3 + (i % 3) * 0.1} />)}
      <Sfx name="whoosh" at={night[0] + collapseAt} volume={0.45} rate={1.3} />
      <Sfx name="riser" at={A('06') - 46} volume={0.5} />
      <Sfx name="chime-low" at={A('06')} volume={0.35} />
      <Sfx name="wake" at={A('07') + 4} volume={0.5} />
      <Sfx name="hop" at={wake[0] + A('07') - wake[0]} volume={0.4} />
      <Sfx name="hop" at={calls[0] + tapAt + 8} volume={0.4} rate={1.15} />
      <Sfx name="hop" at={read[0] + A('10') - read[0]} volume={0.3} rate={1.1} />
      <Sfx name="land" at={end[0] + 32} volume={0.4} />
      {[0, 8, 28, 36, 56].map((d, i) => <Sfx key={i} name="wake" at={A('08') + d} volume={0.16} rate={1.3 + i * 0.05} />)}
      <Sfx name="pop" at={read[0] + readAt} volume={0.35} rate={1.2} />
      <Sfx name="wake" at={A('10')} volume={0.3} />
      {rowAt.map((r, i) => <Sfx key={i} name="wake" at={calls[0] + r} volume={0.18} rate={1.4} />)}
      <Sfx name="tick" at={calls[0] + tapAt} volume={0.6} />
      <Sfx name="chime" at={calls[0] + pausedAt} volume={0.55} />
      <Sfx name="tick" at={angle[0] + pressAt} volume={0.5} />
      {[0, 1, 2].map((i) => <Sfx key={i} name="pop" at={angle[0] + pressAt + 12 + i * 9} volume={0.25} rate={1.4 + i * 0.1} />)}
      <Sfx name="whoosh" at={agency[0]} volume={0.25} rate={1.3} />
      <Sfx name="chime" at={A('15')} volume={0.45} />
    </Field>
  );
};
