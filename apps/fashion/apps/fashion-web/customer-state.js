(() => {
  const KEYS = {
    favourites:'zfashion_preview_favourites_v1',
    bag:'zfashion_preview_bag_v1'
  };
  const safeParse = (raw, fallback) => {
    try { const value = JSON.parse(raw); return value ?? fallback; } catch (_) { return fallback; }
  };
  const read = (key, fallback) => {
    try { return safeParse(localStorage.getItem(key), fallback); } catch (_) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  // Shared by the home page (launch.html) and every customer-shell route:
  // a first visit starts with an empty bag and no favourites.
  const readFavourites = () => { const v = read(KEYS.favourites, []); return new Set(Array.isArray(v) ? v : []); };
  const readBag = () => { const v = read(KEYS.bag, []); return Array.isArray(v) ? v.filter(item => item && item.productId && item.qty > 0) : []; };
  let favourites = readFavourites();
  let bag = readBag();

  const demoProfile = {
    firstName:'Camille',lastName:'Martin',email:'camille.martin@example.com',phone:'+33 6 00 00 00 00',locale:'fr'
  };
  const demoAddresses = [
    {id:'addr-1',label:'Domicile',line1:'12 rue de Démonstration',postalCode:'75008',city:'Paris',country:'France',default:true},
    {id:'addr-2',label:'Bureau',line1:'8 avenue Exemple',postalCode:'75001',city:'Paris',country:'France',default:false}
  ];
  const demoOrders = [
    {
      id:'ZF-DEMO-260001',placedAt:'2026-08-18',status:'delivered',total:520,
      packages:[
        {partnerId:'atelier-27',status:'delivered',tracking:'DEMO-A27-001',items:[{productId:'p1',size:'38',qty:1}]},
        {partnerId:'linea-44',status:'delivered',tracking:'DEMO-L44-001',items:[{productId:'p8',size:'38',qty:1}]}
      ]
    },
    {
      id:'ZF-DEMO-260002',placedAt:'2026-08-23',status:'in_transit',total:420,
      packages:[
        {partnerId:'maison-nord',status:'in_transit',tracking:'DEMO-MN-002',items:[{productId:'p2',size:'M',qty:1}]}
      ]
    }
  ];

  const snapshot = () => ({
    favourites:[...favourites],
    bag:bag.map(item=>({...item})),
    profile:{...demoProfile},
    addresses:demoAddresses.map(address=>({...address})),
    orders:demoOrders.map(order=>({...order,packages:order.packages.map(pkg=>({...pkg,items:pkg.items.map(item=>({...item}))}))}))
  });
  const emit = () => document.dispatchEvent(new CustomEvent('zfashion:preview-state',{detail:snapshot()}));
  const toggleFavourite = productId => {
    if (favourites.has(productId)) favourites.delete(productId); else favourites.add(productId);
    write(KEYS.favourites,[...favourites]); emit(); return favourites.has(productId);
  };
  const addBag = (productId,size,qty=1) => {
    const existing = bag.find(item=>item.productId===productId && item.size===size);
    if (existing) existing.qty += qty; else bag.push({productId,size,qty});
    write(KEYS.bag,bag); emit();
  };
  const setBagQty = (productId,size,qty) => {
    const item = bag.find(entry=>entry.productId===productId && entry.size===size);
    if (!item) return;
    if (qty <= 0) bag = bag.filter(entry=>!(entry.productId===productId && entry.size===size)); else item.qty = qty;
    write(KEYS.bag,bag); emit();
  };
  const removeBag = (productId,size) => {
    bag = bag.filter(entry=>!(entry.productId===productId && entry.size===size));
    write(KEYS.bag,bag); emit();
  };
  const clearPreviewState = () => {
    favourites = new Set(); bag = [];
    write(KEYS.favourites,[]); write(KEYS.bag,[]); emit();
  };

  // Re-read storage when another tab changes it or when the page is restored from the back/forward cache.
  const reload = () => { favourites = readFavourites(); bag = readBag(); emit(); };
  window.addEventListener('storage', e => { if (e.key === KEYS.favourites || e.key === KEYS.bag) reload(); });
  window.addEventListener('pageshow', e => { if (e.persisted) reload(); });

  window.ZFashionCustomerState = {
    snapshot,toggleFavourite,addBag,setBagQty,removeBag,clearPreviewState,reload,
    mode:'PREVIEW_LOCAL_ONLY'
  };
  window.Z_FASHION_CUSTOMER_STATE = 'PREVIEW_LOCAL_ONLY';
})();
