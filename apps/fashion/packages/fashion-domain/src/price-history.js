/* ============================================================
   Z FASHION — PRICE HISTORY (bounded context: fashion-domain)
   ============================================================
   Owns: per-Product price history and the 30-day reference-price
   calculation required by the EU Omnibus Directive (2019/2161,
   transposed in France since 28 May 2022): any advertised price
   reduction must reference the lowest price actually charged in the
   30 days before the promotion — not an inflated "before" price
   chosen to make the discount look bigger. This applies to every
   Campaign type that shows a reduction (Saldos, Black Friday, Vendas
   Privadas), not just Soldes.
   ============================================================ */

const DEFAULT_LOOKBACK_DAYS = 30;

function emptyHistory() {
  return Object.freeze({ entries: [] });
}

/**
 * @param {object} history
 * @param {object} entry - { priceMinorUnits, observedAt (ISO string) }
 */
function recordPrice(history, entry) {
  if (typeof entry.priceMinorUnits !== 'number' || entry.priceMinorUnits < 0) {
    throw new Error('recordPrice: priceMinorUnits must be a non-negative number');
  }
  if (!entry.observedAt) {
    throw new Error('recordPrice: observedAt is required');
  }
  return Object.freeze({
    entries: [...history.entries, Object.freeze({ ...entry })].sort(
      (a, b) => (a.observedAt < b.observedAt ? -1 : 1)
    ),
  });
}

/**
 * The legally required reference price: the lowest price charged in the
 * lookback window ending at `asOf`. Returns null if there is no price data
 * in that window at all — callers must treat that as "cannot legally
 * advertise a reduction," never fall back to guessing.
 *
 * @param {object} history
 * @param {object} options - { asOf (ISO string), lookbackDays }
 */
function referencePrice(history, { asOf, lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}) {
  if (!asOf) throw new Error('referencePrice: asOf is required');
  const windowStart = new Date(new Date(asOf).getTime() - lookbackDays * 86400000).toISOString();

  const inWindow = history.entries.filter(
    (e) => e.observedAt >= windowStart && e.observedAt <= asOf
  );
  if (inWindow.length === 0) return null;

  return Math.min(...inWindow.map((e) => e.priceMinorUnits));
}

module.exports = { DEFAULT_LOOKBACK_DAYS, emptyHistory, recordPrice, referencePrice };
