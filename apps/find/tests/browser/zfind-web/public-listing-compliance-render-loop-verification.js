#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const fileUrl = 'file://' + path.resolve(
  __dirname,
  '..', '..', '..',
  'apps', 'zfind-web', 'dist', 'z-find-prototype.html'
);

function fail(message, context) {
  const suffix = context ? ` :: ${JSON.stringify(context)}` : '';
  throw new Error(message + suffix);
}

const approvedCompliance = {
  jurisdiction_iso: 'FR',
  profile: 'fr_residential_sale_v1',
  facts: {
    dpe_status: 'available',
    dpe_energy_class: 'C',
    ghg_class: 'A',
    energy_cost_min: 900,
    energy_cost_max: 1200,
    energy_cost_reference_year: 2025,
    fees_payer: 'seller',
    agency_fees_amount: 15000,
    is_condominium: true,
    condominium_lots_count: 18,
    annual_condominium_charges: 2400,
    condominium_procedure_status: 'none'
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let rpcCount = 0;

    await page.route('https://example.supabase.co/**', route => {
      const url = route.request().url();
      if (url.includes('/rest/v1/rpc/zfind_public_get_asset_compliance')) {
        rpcCount += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(approvedCompliance),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

    // Build a stable Property detail fixture while the actual route is
    // still Home. This lets the observer settle without making a
    // compliance request before the measured scenario begins.
    await page.evaluate(() => {
      const root = document.getElementById('property-root');
      root.innerHTML = `
        <div class="wrap">
          <div class="detail-layout">
            <div>
              <div class="facts-grid">
                <div class="fact"><div class="k">Surface</div><div class="v">95 m²</div></div>
              </div>
            </div>
            <div><div class="sidebar-sticky"></div></div>
          </div>
          <div class="detail-actions-row"></div>
        </div>
      `;
    });

    await page.waitForTimeout(120);

    await page.evaluate(async () => {
      history.replaceState(null, '', '#/fr/property/compliance-fixture');
      await window.ZFindPublicListingCompliance.refresh();
    });

    // If the compliance block triggers its own observer, the old runtime
    // repeatedly removes/re-adds the block and rpcCount climbs here.
    await page.waitForTimeout(320);

    const first = await page.evaluate(() => {
      const blocks = document.querySelectorAll('#zfind-public-listing-compliance');
      const block = blocks[0] || null;
      if (block) block.dataset.loopSentinel = 'preserve';
      return {
        blockCount: blocks.length,
        hasVerifiedCopy: Boolean(block && block.textContent.includes('Informations vérifiées avant publication')),
        hasGeorisques: Boolean(block && block.textContent.includes('Géorisques')),
        fingerprint: block && block.dataset.complianceFingerprint,
      };
    });

    if (rpcCount !== 1) {
      fail('Compliance render must not schedule repeated self-refresh RPCs', { rpcCount, first });
    }
    if (first.blockCount !== 1) fail('Exactly one compliance block must exist', { rpcCount, first });
    if (!first.hasVerifiedCopy || !first.hasGeorisques) fail('Approved France compliance content missing', { first });
    if (!first.fingerprint) fail('Compliance render fingerprint missing', { first });

    // A genuine external child-list mutation must still schedule one
    // refresh. Identical approved data should retain the existing block
    // rather than remove/reinsert it.
    await page.evaluate(() => {
      const marker = document.createElement('div');
      marker.id = 'external-property-detail-mutation';
      document.getElementById('property-root').appendChild(marker);
    });

    await page.waitForTimeout(220);

    const second = await page.evaluate(() => {
      const blocks = document.querySelectorAll('#zfind-public-listing-compliance');
      const block = blocks[0] || null;
      return {
        blockCount: blocks.length,
        sentinel: block && block.dataset.loopSentinel,
        fingerprint: block && block.dataset.complianceFingerprint,
      };
    });

    if (rpcCount !== 2) {
      fail('One external detail mutation must produce exactly one compliance refresh', { rpcCount, second });
    }
    if (second.blockCount !== 1) fail('External refresh must keep one compliance block', { second });
    if (second.sentinel !== 'preserve') {
      fail('Identical approved compliance data must not rebuild the existing block', { second });
    }
    if (second.fingerprint !== first.fingerprint) {
      fail('Stable approved compliance data must retain the same fingerprint', { first, second });
    }

    await page.waitForTimeout(220);
    if (rpcCount !== 2) {
      fail('Compliance renderer entered a delayed refresh loop', { rpcCount });
    }

    console.log('PUBLIC_COMPLIANCE_INITIAL_RPC_COUNT=1');
    console.log('PUBLIC_COMPLIANCE_EXTERNAL_MUTATION_RPC_COUNT=1');
    console.log('PUBLIC_COMPLIANCE_BLOCK_COUNT=1');
    console.log('PUBLIC_COMPLIANCE_IDENTICAL_RENDER_REUSED=true');
    console.log('Z_FIND_PUBLIC_COMPLIANCE_RENDER_LOOP_HARDENING=PASS');

    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
