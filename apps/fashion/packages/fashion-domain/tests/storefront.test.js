/* Storefront sections — see src/storefront.js. */
const assert = require('assert');
const { storefrontSections } = require('../src/storefront');

assert.deepStrictEqual(storefrontSections({ categories: ['clothing'], gender: 'female', ageSegments: ['adults'] }), ['women']);
assert.deepStrictEqual(storefrontSections({ categories: ['footwear'], gender: 'male', ageSegments: ['adults'] }), ['men']);
assert.deepStrictEqual(storefrontSections({ categories: ['clothing'], gender: 'unisex', ageSegments: ['adults'] }), ['women', 'men']);
assert.deepStrictEqual(storefrontSections({ categories: ['sportswear'], gender: 'female', ageSegments: ['adults'] }), ['women', 'sport']);
assert.deepStrictEqual(storefrontSections({ categories: ['accessories_leather_goods'], gender: 'female', ageSegments: ['adults'] }), ['accessories']);
assert.deepStrictEqual(storefrontSections({ categories: ['cosmetics', 'clothing'], gender: 'female', ageSegments: ['adults'] }), ['beauty']);
assert.deepStrictEqual(storefrontSections({ categories: ['clothing'], gender: 'unisex', ageSegments: ['children', 'baby'] }), ['kids']);
assert.deepStrictEqual(storefrontSections({ categories: ['clothing'], gender: 'male', ageSegments: ['adults', 'youth'] }), ['men'], 'adults included: adult pages');
assert.deepStrictEqual(storefrontSections({ categories: ['sportswear'], gender: 'male', ageSegments: ['youth'] }), ['kids', 'sport']);
assert.deepStrictEqual(storefrontSections({ categories: ['clothing'], gender: 'female' }), ['women'], 'no segments = adults');
console.log('storefront.js: all invariant checks passed.');
