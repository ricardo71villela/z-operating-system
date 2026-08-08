'use strict';

/**
 * A Listing is a marketplace projection of a Representation, not a Registry
 * identity for the represented Property/Development.
 */
function listingProjection({ listingId, representationId, channel, status, price, currencyIso }) {
  if (!listingId || !representationId) throw new Error('Listing projection requires listingId and representationId');
  if (!['standard', 'offmarket'].includes(channel)) throw new Error(`Invalid listing channel: ${channel}`);
  if (!/^[A-Z]{3}$/.test(currencyIso || '')) throw new Error('Listing projection requires ISO-4217 currencyIso');
  return Object.freeze({ listingId, representationId, channel, status, price, currencyIso });
}

module.exports = { listingProjection };
