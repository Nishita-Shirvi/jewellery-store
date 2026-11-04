import "server-only";

/**
 * A tiny in-process cache in front of hot shared-cache reads (Phase 25 load test).
 *
 * `unstable_cache` is shared between server instances, but every read still loads and parses
 * an entry (a file locally, a network call on Vercel). Values read on almost every page —
 * the announcement bar, recommendation rows — are kept here for a few seconds as well.
 *
 * Freshness: saving in admin clears this instance's memo at once (clearMemo, called next to
 * revalidateTag); other instances catch up within `ttlMs`. Scheduled content is unaffected:
 * the cached rows carry their dates and "is it live now?" is still decided on every request.
 */
type Entry = { value: Promise<unknown>; expires: number };
// One store per server process. Next.js bundles routes separately, so a plain module-level Map
// could exist once per bundle — and clearing it from the cron route would miss the copy that
// /api/reco reads. globalThis is shared by all of them.
const holder = globalThis as unknown as { __recoMemo?: Map<string, Entry> };
const store = (holder.__recoMemo ??= new Map<string, Entry>());
const MAX_ENTRIES = 2000;

export function memo<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
  ttlMs = 30_000,
): (...args: A) => Promise<R> {
  return (...args: A) => {
    const key = `${name}:${JSON.stringify(args)}`;
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<R>;
    const value = fn(...args);
    // A failed read is never kept: the next request tries again.
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });
    if (store.size >= MAX_ENTRIES) {
      // Drop the oldest entries (Map keeps insertion order).
      for (const k of [...store.keys()].slice(0, MAX_ENTRIES / 4)) store.delete(k);
    }
    store.set(key, { value, expires: now + ttlMs });
    return value;
  };
}

/** Clears memoised values whose name starts with `prefix` (all when omitted). */
export function clearMemo(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
