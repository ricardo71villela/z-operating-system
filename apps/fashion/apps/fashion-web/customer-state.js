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

  let favourites = new Set(read(KEYS.favourites, ['p1','p4']));
  let bag = read(KEYS.bag, [
    {productId:'p5',size:'41',qty:1},
    {productId:'p8',size:'38',qty:1}
  ]);

  const demoProfile = {
    firstName:'Camille',lastName:'Martin',email:'camille.preview@example.com',phone:'+33 6 00 00 00 00',locale:'fr'
  };
  const demoAddresses = [
    {id:'addr-1',label:'Domicile · Preview',line1:'12 rue de Démonstration',postalCode:'75008',city:'Paris',country:'France',default:true},
    {id:'addr-2',label:'Bureau · Preview',line1:'8 avenue Exemple',postalCode:'75001',city:'Paris',country:'France',default:false}
  ];
  const demoOrders = [
    {
      id:'ZF-PREVIEW-260001',placedAt:'2026-08-18',status:'delivered',total:520,
      packages:[
        {partnerId:'atelier-27',status:'delivered',tracking:'PREVIEW-A27-001',items:[{productId:'p1',size:'38',qty:1}]},
        {partnerId:'linea-44',status:'delivered',tracking:'PREVIEW-L44-001',items:[{productId:'p8',size:'38',qty:1}]}
      ]
    },
    {
      id:'ZF-PREVIEW-260002',placedAt:'2026-08-23',status:'in_transit',total:420,
      packages:[
        {partnerId:'maison-nord',status:'in_transit',tracking:'PREVIEW-MN-002',items:[{productId:'p2',size:'M',qty:1}]}
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

  window.ZFashionCustomerState = {
    snapshot,toggleFavourite,addBag,setBagQty,removeBag,clearPreviewState,
    mode:'PREVIEW_LOCAL_ONLY'
  };
  window.Z_FASHION_CUSTOMER_STATE = 'PREVIEW_LOCAL_ONLY';
})();
