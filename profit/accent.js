/* THE ACCENT WORD (2026-10-11, docs/two-products.md sections 1 and 5, session D).
 * One word per page head in Instrument Serif italic ("what you actually kept"): the type rule from the plan, on every
 * page, without touching a layout. The word is chosen by hand per page here, ONE list; pageHead (index.html) wraps the
 * first whole-word match in the title with <em class="lx-accent">. A title that does not carry its word gets no accent
 * (never a wrong word), and a head that IS only the word keeps plain type: the accent lives inside a sentence. The Home hero carries its own word ("actually") inside hero.js.
 * The font is loaded with the other Google Fonts in index.html; the token is --font-accent in v2.css. */
(() => {
  /* tab id -> the words to try, in order. Titles are usually "<page>: <brand>", a few are sentences. */
  const WORDS = {
    overview: ['Overview'], yesterday: ['check'], leaks: ['Leaks'], today: ['calls'], profit: ['P&amp;L', 'P&L', 'Profit'], plan: ['Goals', 'Plan'], requests: ['Requests'],
    channels: ['channels'], meta: ['Meta'], campaigns: ['campaigns'], adcreative: ['ads'], changes: ['changes'], mtoday: ['Today'], mbrowser: ['browser'],
    google: ['Google'], gcampaigns: ['campaigns'], gads: ['ads'], gterms: ['terms'], gchanges: ['changes'], tiktok: ['TikTok'],
    angles: ['angles'], tests: ['calls'], email: ['SMS', 'Attentive', 'Email'], store: ['Sales'], customers: ['Customers'], website: ['Website'], search: ['Search'],
    stock: ['Stock'], buying: ['Buying'], drops: ['Drops'], studio: ['ads', 'Studio'], copy: ['desk', 'Words'], amb: ['Creators', 'link'], library: ['Library'], inspo: ['Inspiration'],
    answers: ['answers'], research: ['Research'], voice: ['Voice'], brand: ['Brand'], calendar: ['Calendar'], brief: ['Brief'], reports: ['monthly', 'Reports'], dash: ['Dashboards'],
    war: ['Room'], season: ['Plan'], calc: ['Scenarios'], pulse: ['status'], economics: ['economics'], workload: ['workload'],
    settings: ['settings', 'Settings'], health: ['Health', 'check'], costs: ['Costs'], guide: ['use'],
    /* v4 pages and the module pages that now carry the brand in the title */
    morning: ['Morning'], month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Month'],
    production: ['Pipeline'], social: ['Social'], socialsaved: ['Social'], socialweek: ['Social'], tasks: ['Tasks'], actions: ['Tasks'], calls: ['Meetings', 'call'], monday: ['call', 'Meetings'], meetings: ['Meetings'], ccall: ['call'],
  };
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** Wraps the first whole-word match of the page's word in the title's TEXT (never inside a tag or an existing accent). */
  function apply(tab, title) {
    const t = String(title ?? '');
    if (!t || /lx-accent/.test(t)) return t;
    const words = WORDS[tab]; if (!words) return t;
    const parts = t.split(/(<[^>]+>)/);               // text and tags alternate; tags are odd indexes
    /* One word IN a sentence: a head that is only the word ("Overview", "Library") keeps its plain type. */
    const plain = parts.filter((_, i) => i % 2 === 0).join('').replace(/\s+/g, ' ').trim();
    if (words.some(w => plain.toLowerCase() === w.toLowerCase())) return t;
    for (const w of words) {
      const re = new RegExp(`(^|[^\\w&])(${escRe(w)})(?![\\w;])`, 'i');
      for (let i = 0; i < parts.length; i += 2) {
        if (!parts[i] || !re.test(parts[i])) continue;
        parts[i] = parts[i].replace(re, (m, pre, word) => `${pre}<em class="lx-accent">${word}</em>`);
        return parts.join('');
      }
    }
    return t;
  }
  window.LxAccent = { WORDS, apply };
})();
