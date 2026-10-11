// The tabs beat both spots share: a browser fills with the real things people
// have open, one tab per spoken name, then the rest pile in fast while the
// voice counts, then the whole window collapses into one point.
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { feel, useSpring } from '../lib/motion';
import { serifStack } from '../lib/fonts';
import { Big } from './scene';
import { BrowserWindow, type TabSpec } from '../ui/browser';

export const TabsBeat: React.FC<{
  tabs: TabSpec[];
  nameAt: number[]; // the frame each spoken tab appears
  restAt: number; // when the unnamed tabs start piling in
  collapseAt: number;
  accent: string; // the colour of the count
  tail: string; // the line under the count
  tailAt: number;
  word?: string; // the serif word after "tabs"
}> = ({ tabs, nameAt, restAt, collapseAt, accent, tail, tailAt, word = 'open.' }) => {
  const f = useCurrentFrame();
  const s = useSpring();
  const appearAt = tabs.map((_, i) => (i < nameAt.length ? nameAt[i] : restAt + (i - nameAt.length) * 3));
  const shown = appearAt.filter((a) => f >= a).length;
  const pop = appearAt.map((a) => s(a, feel.pop));
  const win = s(nameAt[0] - 6, feel.pop);
  const collapse = s(collapseAt, feel.settle, 28);
  const point = s(collapseAt + 12, feel.pop);
  const tailIn = s(tailAt, feel.settle);
  const wordIn = s(restAt + 10, feel.settle);
  const countPop = s(appearAt[Math.max(0, shown - 1)] ?? 0, feel.snap);
  if (f < nameAt[0] - 8) return null;
  return (
    <>
      <div style={{ position: 'absolute', left: 40, top: 520, transform: `translateY(${(1 - win) * 120}px) scale(${(0.9 + 0.1 * win) * (1 - collapse)})`, opacity: win * (1 - collapse), transformOrigin: '50% 55%' }}>
        <BrowserWindow tabs={tabs} shown={Math.max(1, shown)} width={1000} height={820} pop={pop}>
          <div style={{ textAlign: 'center', color: '#F2F2F4', padding: '0 40px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 16, transform: `scale(${1 + (1 - countPop) * 0.08})`, transformOrigin: '50% 80%' }}>
              <Big text={String(shown)} size={230} color={accent} />
              <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.04em' }}>{shown === 1 ? 'tab' : 'tabs'}</span>
              <span style={{ fontFamily: serifStack, fontStyle: 'italic', fontSize: 96, color: accent, opacity: wordIn, marginLeft: 4 }}>{word}</span>
            </div>
            <div style={{ fontSize: 42, fontWeight: 600, color: 'rgba(255,255,255,.82)', marginTop: 18, opacity: tailIn, transform: `translateY(${(1 - tailIn) * 16}px)` }}>{tail}</div>
          </div>
        </BrowserWindow>
      </div>
      <div style={{ position: 'absolute', left: 540 - 20, top: 940 - 20, width: 40, height: 40, borderRadius: '50%', background: '#fff', transform: `scale(${point * 1.4})`, opacity: point, boxShadow: `0 0 ${60 * point}px ${30 * point}px rgba(255,255,255,.45)` }} />
    </>
  );
};

export const locusTabs: TabSpec[] = [
  { logo: 'shopify', title: 'Orders · Marlow Golf' },
  { logo: 'meta', title: 'Ads Manager' },
  { logo: 'google-ads', title: 'Google Ads' },
  { logo: 'tiktok', title: 'TikTok Ads Manager' },
  { logo: 'triplewhale', title: 'Triple Whale · Summary' },
  { logo: 'klaviyo', title: 'Klaviyo · Campaigns' },
  { logo: 'google-sheets', title: 'Oct budget v4' },
  { logo: 'google-analytics', title: 'GA4 · Reports' },
  { logo: 'asana', title: 'Asana · Creative' },
  { logo: 'slack', title: 'Slack · marlow-internal' },
  { logo: 'canva', title: 'Canva · BF statics' },
  { logo: 'looker', title: 'Looker Studio' },
  { logo: 'gmail', title: 'Re: numbers?' },
  { logo: 'meta', title: 'Ads Manager (2)' },
];

export const cashewTabs: TabSpec[] = [
  { logo: 'bank', title: 'Pacific Business Checking' },
  { logo: 'stripe', title: 'Stripe · Payouts' },
  { logo: 'paypal', title: 'PayPal · Activity' },
  { logo: 'amex', title: 'Amex · Statements' },
  { logo: 'shopify', title: 'Shopify · Payouts' },
  { logo: 'quickbooks', title: 'QuickBooks · Reports' },
  { logo: 'google-sheets', title: 'Sept P&L v3 FINAL' },
  { logo: 'gmail', title: 'Re: Re: Q3 docs?' },
  { logo: 'gusto', title: 'Gusto · Payroll' },
  { logo: 'kickfurther', title: 'Kickfurther · Schedule' },
  { logo: 'amazon', title: 'Amazon Pay' },
  { logo: 'brex', title: 'Brex · Card' },
  { logo: 'google-sheets', title: 'Sept P&L v3 FINAL (1)' },
  { logo: 'bank', title: 'Pacific Business Checking (2)' },
];
