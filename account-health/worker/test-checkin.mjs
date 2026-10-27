/* node test-checkin.mjs: the check-in's rich text readers (linesOf, splitByBrand). */
import { linesOf, splitByBrand, shortName } from './src/checkin.js';
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const b = t => ({ type: 'text', text: t, style: { bold: true } }), t = x => ({ type: 'text', text: x });
const rt = { type: 'rich_text', elements: [
  { type: 'rich_text_section', elements: [b('Dartee'), t('\n')] },
  { type: 'rich_text_list', style: 'bullet', elements: [{ type: 'rich_text_section', elements: [t('Brief batch 15, Game of Belts')] }, { type: 'rich_text_section', elements: [t('Walkthrough with '), { type: 'user', user_id: 'U1' }] }] },
  { type: 'rich_text_section', elements: [b('Lucky'), t('\nCheck William\'s statics\n')] },
] };
const lines = linesOf(rt);
ok(lines[0] === 'Dartee: Brief batch 15, Game of Belts', 'first line ' + lines[0]);
ok(lines[1] === 'Dartee: Walkthrough with @someone', 'mention ' + lines[1]);
ok(lines[2] === "Lucky: Check William's statics", 'section lines ' + lines[2]);
ok(lines.length === 3, 'count ' + lines.length);
const parts = splitByBrand(rt, ['Dartee', 'Lucky', 'Grunk Dolfer']);
ok(parts.length === 2 && parts[0].brand === 'Dartee' && parts[1].brand === 'Lucky', 'split ' + JSON.stringify(parts.map(p => p.brand)));
ok(parts[0].rt.elements.length === 1 && parts[0].rt.elements[0].type === 'rich_text_list', 'dartee part is the list');
ok(JSON.stringify(parts[1].rt).includes('statics'), 'lucky part keeps its text');
ok(splitByBrand({ type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [b('Grunk'), t('\nbatch 10')] }] }, ['Grunk Dolfer']).length === 1, 'Grunk matches Grunk Dolfer');
ok(shortName('Lucky Golf') === 'Lucky' && shortName('Yak Sports') === 'Yak' && shortName('Ice & Gold') === 'Ice & Gold', 'short names');
console.log(`${n - bad}/${n} passed`); if (bad) process.exit(1);
