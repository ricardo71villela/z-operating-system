const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'polished.html'),'utf8');
const france=fs.readFileSync(path.join(root,'fr.html'),'utf8');
const css=fs.readFileSync(path.join(root,'polish.css'),'utf8');
const js=fs.readFileSync(path.join(root,'polish.js'),'utf8');
for(const marker of ['polish.css','polish.js','accountDrawer','mobile-dock','catalog-toolbar','searchSuggestions','partnerFulfilment']) assert.ok(html.includes(marker),`missing polish marker: ${marker}`);
for(const marker of ['safe-area-inset-bottom','mobile-dock',':focus-visible','account-content','detail-polish']) assert.ok(css.includes(marker),`missing polish CSS: ${marker}`);
for(const marker of ['Z_FASHION_FINAL_POLISH','openAccount','syncMobileCounts','sortMode','baseOpenProduct','baseAddCart','baseRenderCart','baseRenderWishlist']) assert.ok(js.includes(marker),`missing polish behavior: ${marker}`);
for(const locale of ['pt','en','fr','es','it','de']) assert.ok(js.includes(`${locale}:{`)||js.includes(`${locale}: {`),`missing polish locale: ${locale}`);
assert.ok(html.includes('noindex,nofollow'),'polished preview must remain noindex');
assert.ok(html.includes('sem pagamentos live'),'payment boundary must remain explicit');

assert.ok(france.includes('<html lang="fr" data-locale="fr">'),'France entry must be French at document authority');
assert.ok(france.includes('Z Fashion — France · Aperçu'),'France title must be localized');
assert.ok(france.includes('Catalogue de démonstration · aucun paiement réel'),'France preview boundary must be French');
assert.ok(france.includes('Découvrir le style.'),'France hero must be French');
assert.ok(france.includes('Votre compte vous accompagne également dans Z Fashion.'),'France account UX must be French');
assert.ok(france.includes('Z Operating System'),'corporate system name may remain in footer');
assert.ok(!france.includes('language-picker'),'France launch must not expose a language selector');
for(const forbidden of ['Saltar para o conteúdo','Pesquisar','Carrinho','Devoluções','Acesso de membro','Peças que definem']) assert.ok(!france.includes(forbidden),`Portuguese launch residue: ${forbidden}`);
assert.ok(js.includes("document.documentElement.lang !== 'fr'"),'France runtime gate missing');
assert.ok(js.includes("Z_FASHION_FRANCE_LAUNCH='PASS'"),'France launch runtime marker missing');
for(const marker of ['Blazer structuré en laine','Manteau minimaliste en laine','Sac Arc en cuir','Robe colonne']) assert.ok(js.includes(marker),`French product copy missing: ${marker}`);

console.log('Z_FASHION_FINAL_POLISH_CONTRACT=PASS');
console.log('Z_FASHION_FRANCE_LAUNCH_CONTRACT=PASS');
