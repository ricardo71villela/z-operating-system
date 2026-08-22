/* ============================================================
   Z FASHION — CLIENT ADDRESS (bounded context: fashion-domain)
   ============================================================
   Owns: the Client's address book (shipping/billing) — the last
   direct blocker to a real checkout flagged in the customer-side
   audit's priority list (2026-08-21): Wishlist, Corner Follow, and
   Order/Shipment/Return all exist now, but "Adresses" stayed an empty
   placeholder in the Account prototype until this.

   Payment methods are deliberately NOT built here — storing card data
   is a PSP-integration decision (which provider, tokenization scheme),
   not a pure domain-logic one, and doing it inline here would mean
   inventing a payment architecture as a side effect of fixing the
   address gap. Left open, same as DOMAIN-SKETCH.md/ZOS-ALIGNMENT.md
   already do for Phase 2 payment/shipping.

   Reuses @zos/geography's getCountryByIsoCode() — the same check
   partner.js already runs — rather than a second, drifting country
   list. A Market (market.js) and a Client's Address country are
   related in the real world (a Client usually ships within the Market
   they're shopping in) but are NOT the same field and NOT enforced
   against each other here — cross-border shipping is a real, distinct
   product decision this module does not make on the Client's behalf.
   ============================================================ */

const { getCountryByIsoCode } = require('../../../../../packages/geography/geography');

const ADDRESS_TYPES = Object.freeze(['shipping', 'billing']);

function emptyAddressBook() {
  return Object.freeze({ items: [] });
}

/**
 * @param {object} args
 * @param {string} args.clientUserId
 * @param {string} args.type - one of ADDRESS_TYPES
 * @param {string} args.line1
 * @param {string} [args.line2]
 * @param {string} args.postalCode
 * @param {string} args.city
 * @param {string} args.countryIso - ISO-3166-1 alpha-2, validated
 *   against @zos/geography — same check partner.js already runs, never
 *   a free-text country field
 * @param {string} [args.recipientName]
 * @param {string} [args.id] - defaults to a caller-supplied id; this
 *   module does not generate ids itself (same "no I/O, no storage"
 *   discipline as the rest of fashion-domain)
 */
function createAddress(args) {
  const errors = [];

  if (!args.clientUserId) errors.push('clientUserId is required');
  if (!args.id) errors.push('id is required');
  if (!args.type || !ADDRESS_TYPES.includes(args.type)) {
    errors.push(`type is required and must be one of ${ADDRESS_TYPES.join(', ')}`);
  }
  if (!args.line1 || !args.line1.trim()) errors.push('line1 is required');
  if (!args.postalCode || !args.postalCode.trim()) errors.push('postalCode is required');
  if (!args.city || !args.city.trim()) errors.push('city is required');
  if (!args.countryIso) {
    errors.push('countryIso is required (ISO-3166-1 alpha-2, e.g. "FR")');
  } else if (!getCountryByIsoCode(args.countryIso)) {
    errors.push(`countryIso "${args.countryIso}" is not a recognized Country in @zos/geography`);
  }

  if (errors.length > 0) {
    throw new Error(`createAddress: invalid Address —\n  ${errors.join('\n  ')}`);
  }

  return Object.freeze({
    id: args.id,
    clientUserId: args.clientUserId,
    type: args.type,
    recipientName: args.recipientName || null,
    line1: args.line1,
    line2: args.line2 || null,
    postalCode: args.postalCode,
    city: args.city,
    countryIso: args.countryIso,
    isDefault: !!args.isDefault,
  });
}

/**
 * @param {object} addressBook - emptyAddressBook() shape
 * @param {object} address - createAddress() shape
 * @returns {object} the updated address book. If `address.isDefault` is
 *   true, every other Address of the same Client and the same `type`
 *   is un-defaulted in the same operation — never two simultaneous
 *   defaults of the same type for one Client, enforced structurally
 *   here rather than left as a caller responsibility.
 */
function addAddress(addressBook, address) {
  let items = [...addressBook.items];
  if (address.isDefault) {
    items = items.map((a) =>
      a.clientUserId === address.clientUserId && a.type === address.type
        ? Object.freeze({ ...a, isDefault: false })
        : a
    );
  }
  return Object.freeze({ items: [...items, address] });
}

function removeAddress(addressBook, clientUserId, addressId) {
  return Object.freeze({
    items: addressBook.items.filter((a) => !(a.clientUserId === clientUserId && a.id === addressId)),
  });
}

/** @returns {object[]} every Address belonging to this Client, of any type */
function listAddressesForClient(addressBook, clientUserId) {
  return addressBook.items.filter((a) => a.clientUserId === clientUserId);
}

/**
 * @param {object} addressBook
 * @param {string} clientUserId
 * @param {string} type - one of ADDRESS_TYPES
 * @returns {object|null} the Client's default Address of this type, or
 *   null if none is marked default yet — never guesses by picking the
 *   first one in the list
 */
function defaultAddressForClient(addressBook, clientUserId, type) {
  return addressBook.items.find((a) => a.clientUserId === clientUserId && a.type === type && a.isDefault) || null;
}

module.exports = {
  ADDRESS_TYPES,
  emptyAddressBook,
  createAddress,
  addAddress,
  removeAddress,
  listAddressesForClient,
  defaultAddressForClient,
};
