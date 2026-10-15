/* ============================================================
   Z FASHION — STOREFRONT SECTIONS (bounded context: fashion-domain)
   ============================================================
   Which pages of the public site a product appears on. The site menu
   is Femme / Homme / Enfant / Sport / Accessoires / Beauté; products
   carry categories, a gender and age segments (product.js). One
   product can appear on several pages (a unisex sweater is in Femme
   and in Homme).

   - Beauté      : cosmetics (and nowhere else)
   - Sport       : sportswear (technical use, product.js)
   - Accessoires : accessories and leather goods
   - Enfant      : sold only to children, babies or teens
   - Femme/Homme : by gender (unisex → both), for adults' items that
                   are clothing, footwear or sportswear
   ============================================================ */

const SECTIONS = Object.freeze(['women', 'men', 'kids', 'sport', 'accessories', 'beauty']);
const KIDS_SEGMENTS = Object.freeze(['children', 'baby', 'youth']);

function storefrontSections(product) {
  const categories = product.categories || [];
  const ages = product.ageSegments && product.ageSegments.length ? product.ageSegments : ['adults'];
  const sections = new Set();
  if (categories.includes('cosmetics')) return ['beauty'];
  if (categories.includes('sportswear')) sections.add('sport');
  if (categories.includes('accessories_leather_goods')) sections.add('accessories');
  const kidsOnly = ages.every((a) => KIDS_SEGMENTS.includes(a));
  if (kidsOnly) sections.add('kids');
  const wearable = categories.some((c) => ['clothing', 'footwear', 'sportswear'].includes(c));
  if (!kidsOnly && wearable) {
    if (product.gender === 'female' || product.gender === 'unisex') sections.add('women');
    if (product.gender === 'male' || product.gender === 'unisex') sections.add('men');
  }
  return SECTIONS.filter((s) => sections.has(s));
}

module.exports = { SECTIONS, storefrontSections };
