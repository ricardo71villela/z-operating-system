/* Run with: node apps/fashion/packages/fashion-domain/tests/address.test.js */

const assert = require('assert');
const {
  emptyAddressBook, createAddress, addAddress, removeAddress,
  listAddressesForClient, defaultAddressForClient, setDefaultAddress, ADDRESS_TYPES,
} = require('../src/address');

assert.deepStrictEqual(ADDRESS_TYPES, ['shipping', 'billing']);

// --- createAddress: validation ---
assert.throws(
  () => createAddress({ clientUserId: 'client_ines', id: 'addr_1', type: 'shipping', line1: '', postalCode: '75001', city: 'Paris', countryIso: 'FR' }),
  /line1 is required/
);
assert.throws(
  () => createAddress({ clientUserId: 'client_ines', id: 'addr_1', type: 'other', line1: '10 rue de Rivoli', postalCode: '75001', city: 'Paris', countryIso: 'FR' }),
  /type is required and must be one of shipping, billing/
);
assert.throws(
  () => createAddress({ clientUserId: 'client_ines', id: 'addr_1', type: 'shipping', line1: '10 rue de Rivoli', postalCode: '75001', city: 'Paris', countryIso: 'ZZ' }),
  /not a recognized Country/
);
assert.throws(
  () => createAddress({ clientUserId: 'client_ines', id: 'addr_1', type: 'shipping', line1: '10 rue de Rivoli', postalCode: '75001', city: 'Paris' }),
  /countryIso is required/
);

const addr1 = createAddress({
  clientUserId: 'client_ines', id: 'addr_1', type: 'shipping',
  recipientName: 'Inès Moreau', line1: '10 rue de Rivoli', postalCode: '75001', city: 'Paris',
  countryIso: 'FR', isDefault: true,
});
assert.strictEqual(addr1.isDefault, true);
assert.strictEqual(addr1.line2, null);

// --- addAddress + default exclusivity ---
let book = emptyAddressBook();
book = addAddress(book, addr1);
assert.strictEqual(listAddressesForClient(book, 'client_ines').length, 1);

// Adding a second shipping default un-defaults the first — never two
// simultaneous defaults of the same type for the same Client.
const addr2 = createAddress({
  clientUserId: 'client_ines', id: 'addr_2', type: 'shipping',
  line1: '5 avenue Foch', postalCode: '75116', city: 'Paris', countryIso: 'FR', isDefault: true,
});
book = addAddress(book, addr2);
const shipping = listAddressesForClient(book, 'client_ines').filter((a) => a.type === 'shipping');
assert.strictEqual(shipping.length, 2);
assert.strictEqual(shipping.find((a) => a.id === 'addr_1').isDefault, false);
assert.strictEqual(shipping.find((a) => a.id === 'addr_2').isDefault, true);

// A billing default of the same Client is untouched by the shipping
// default change above — exclusivity is scoped per type, not global.
const billingAddr = createAddress({
  clientUserId: 'client_ines', id: 'addr_3', type: 'billing',
  line1: '10 rue de Rivoli', postalCode: '75001', city: 'Paris', countryIso: 'FR', isDefault: true,
});
book = addAddress(book, billingAddr);
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'billing').id, 'addr_3');
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'shipping').id, 'addr_2');

// A different Client's addresses/defaults are completely unaffected.
const otherClientAddr = createAddress({
  clientUserId: 'client_tiago', id: 'addr_4', type: 'shipping',
  line1: 'Rua Augusta 100', postalCode: '1100-053', city: 'Lisboa', countryIso: 'PT', isDefault: true,
});
book = addAddress(book, otherClientAddr);
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'shipping').id, 'addr_2'); // unchanged
assert.strictEqual(defaultAddressForClient(book, 'client_tiago', 'shipping').id, 'addr_4');

// No default set yet for a type: returns null, never guesses.
assert.strictEqual(defaultAddressForClient(book, 'client_tiago', 'billing'), null);

// --- removeAddress ---
book = removeAddress(book, 'client_ines', 'addr_1');
assert.strictEqual(listAddressesForClient(book, 'client_ines').length, 2); // addr_2 (shipping) + addr_3 (billing)
assert.strictEqual(listAddressesForClient(book, 'client_tiago').length, 1); // untouched

// --- setDefaultAddress: marking an EXISTING address as default, not
// at insertion time ---
assert.throws(() => setDefaultAddress(book, 'client_ines', 'addr_does_not_exist'), /no address with id/);
assert.throws(() => setDefaultAddress(book, 'client_tiago', 'addr_2'), /does not belong to client/);

// addr_2 (shipping) is already default at this point; add a second
// shipping address for client_ines, not yet default.
const addr5 = createAddress({
  clientUserId: 'client_ines', id: 'addr_5', type: 'shipping',
  line1: '2 place Vendôme', postalCode: '75001', city: 'Paris', countryIso: 'FR', isDefault: false,
});
book = addAddress(book, addr5);
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'shipping').id, 'addr_2');

book = setDefaultAddress(book, 'client_ines', 'addr_5');
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'shipping').id, 'addr_5');
// addr_2 lost default status — never two simultaneous defaults.
assert.strictEqual(listAddressesForClient(book, 'client_ines').find((a) => a.id === 'addr_2').isDefault, false);
// billing default (addr_3) untouched — exclusivity is scoped per type.
assert.strictEqual(defaultAddressForClient(book, 'client_ines', 'billing').id, 'addr_3');

console.log('address.js: all invariant checks passed.');
