/* Small text helpers shared by the kernel and the groups. */

export function safeJson(text, fallback) {
  try {
    if (text == null || text === '') return fallback;
    const v = JSON.parse(text);
    return v == null ? fallback : v;
  } catch {
    return fallback;   // not JSON: the caller named the fallback, nothing to log
  }
}

export const lower = s => String(s || '').trim().toLowerCase();

export const isBrandId = s => /^brand_[a-z0-9_]+$/.test(String(s || ''));

export const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
