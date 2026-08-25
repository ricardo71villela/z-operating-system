const products = [
  {id:"p1",brand:"Aster Studio",name:"Blazer estruturado em lã",category:"women",price:289,corner:"Atelier 27",sizes:["34","36","38","40"],badge:"New",image:"https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=900&q=86",description:"Blazer de construção limpa, ombro suave e lã fria. Uma peça de transição pensada para uso quotidiano."},
  {id:"p2",brand:"Maison Nord",name:"Casaco minimal em lã",category:"women",price:420,corner:"Maison Nord",sizes:["XS","S","M","L"],badge:"Private",image:"https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=86",description:"Casaco de linhas longas e acabamento minimalista, selecionado pela Maison Nord."},
  {id:"p3",brand:"NOMA",name:"Overshirt technical",category:"men",price:198,corner:"Maison Nord",sizes:["S","M","L","XL"],badge:"New",image:"https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=86",description:"Overshirt leve com construção técnica e volume descontraído para sobreposição."},
  {id:"p4",brand:"Linea 44",name:"Mala Arc em pele",category:"accessories",price:355,corner:"Linea 44",sizes:["U"],badge:"Icon",image:"https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=86",description:"Mala compacta em pele com estrutura curva, ferragens discretas e alça ajustável."},
  {id:"p5",brand:"Runform",name:"Runner 02",category:"sports",price:165,corner:"Atelier 27",sizes:["38","39","40","41","42","43"],badge:"Fresh",image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=86",description:"Sapatilha de corrida urbana com perfil leve, sola responsiva e construção respirável."},
  {id:"p6",brand:"Aster Studio",name:"Vestido coluna",category:"women",price:245,corner:"Atelier 27",sizes:["34","36","38","40"],badge:"New",image:"https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=86",description:"Vestido de silhueta longa com decote depurado e tecido fluido de toque seco."},
  {id:"p7",brand:"Northline",name:"Bomber suede",category:"men",price:510,corner:"Maison Nord",sizes:["S","M","L","XL"],badge:"Limited",image:"https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=900&q=86",description:"Bomber em suede macio com acabamento mate e proporções contemporâneas."},
  {id:"p8",brand:"Linea 44",name:"Loafer 19",category:"accessories",price:285,corner:"Linea 44",sizes:["36","37","38","39","40","41"],badge:"New",image:"https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=86",description:"Loafer de construção clássica reinterpretado com sola fina e biqueira alongada."}
];

const translations = {
  pt:{preview:"Catálogo demonstrativo · sem pagamentos live",search:"Pesquisar",account:"Conta",allSale:"All Sale",women:"Mulher",men:"Homem",children:"Criança",sports:"Sportswear",accessories:"Acessórios",beauty:"Beauty",sale:"Saldos",newSeason:"Nova estação · 2026",heroTitle:"Descobrir estilo.<br>Comprar melhor.",heroCopy:"Boutiques, marcas e coleções numa experiência única — com stock do parceiro, checkout Z Fashion e identidade ZOS.",shopNow:"Comprar agora",exploreCorners:"Explorar Corners",multiBoutique:"Multi-boutique",multiBoutiqueCopy:"Um carrinho, vários parceiros",freshStock:"Stock atualizado",freshStockCopy:"Disponibilidade por boutique",easyReturns:"Devoluções simples",easyReturnsCopy:"Regras claras por encomenda",zosIdentity:"Identidade ZOS",zosIdentityCopy:"Uma conta no ecossistema",editWomen:"Editorial",womenEditTitle:"Quiet luxury, novo ritmo",editMen:"Homem",menEditTitle:"Tailoring sem esforço",editNew:"Novidades",newEditTitle:"Peças que definem a estação",discover:"Descobrir",allSaleTitle:"All Sale",allSaleCopy:"Uma seleção transversal de várias boutiques. No Preview, os produtos são demonstrativos.",all:"Tudo",partnerBoutiques:"Boutiques parceiras",cornersTitle:"Corners",cornersCopy:"Cada parceiro mantém identidade, curadoria e stock próprios dentro da experiência Z Fashion.",viewAll:"Ver todos",enterCorner:"Entrar no Corner",privateSale:"Venda Privada",campaignTitle:"Uma seleção reservada a membros ZOS.",campaignCopy:"Preview da lógica de campanhas Z Fashion: acesso, stock e condições comerciais continuam controlados por parceiro e mercado.",memberAccess:"Acesso de membro",support:"Apoio",delivery:"Entregas",returns:"Devoluções",contact:"Contacto",footerPreview:"Preview de produto. Sem checkout live, credenciais de pagamento ou mutações na base ZOS.",cart:"Carrinho",checkoutPreview:"Checkout indisponível no Preview",close:"Fechar"},
  en:{preview:"Demo catalogue · no live payments",search:"Search",account:"Account",allSale:"All Sale",women:"Women",men:"Men",children:"Kids",sports:"Sportswear",accessories:"Accessories",beauty:"Beauty",sale:"Sale",newSeason:"New season · 2026",heroTitle:"Discover style.<br>Shop better.",heroCopy:"Boutiques, brands and collections in one experience — partner-owned stock, Z Fashion checkout and ZOS identity.",shopNow:"Shop now",exploreCorners:"Explore Corners",multiBoutique:"Multi-boutique",multiBoutiqueCopy:"One cart, multiple partners",freshStock:"Fresh stock",freshStockCopy:"Availability by boutique",easyReturns:"Simple returns",easyReturnsCopy:"Clear rules per order",zosIdentity:"ZOS identity",zosIdentityCopy:"One account across the ecosystem",editWomen:"Editorial",womenEditTitle:"Quiet luxury, new rhythm",editMen:"Men",menEditTitle:"Effortless tailoring",editNew:"New in",newEditTitle:"Pieces that define the season",discover:"Discover",allSaleTitle:"All Sale",allSaleCopy:"A cross-boutique selection. Preview products are demonstrative.",all:"All",partnerBoutiques:"Partner boutiques",cornersTitle:"Corners",cornersCopy:"Each partner keeps its own identity, curation and stock inside the Z Fashion experience.",viewAll:"View all",enterCorner:"Enter Corner",privateSale:"Private Sale",campaignTitle:"A selection reserved for ZOS members.",campaignCopy:"Preview of Z Fashion campaigns: access, stock and commercial terms remain controlled by partner and market.",memberAccess:"Member access",support:"Support",delivery:"Delivery",returns:"Returns",contact:"Contact",footerPreview:"Product preview. No live checkout, payment credentials or ZOS database mutations.",cart:"Bag",checkoutPreview:"Checkout unavailable in Preview",close:"Close"},
  fr:{preview:"Catalogue de démonstration · aucun paiement live",search:"Rechercher",account:"Compte",allSale:"All Sale",women:"Femme",men:"Homme",children:"Enfant",sports:"Sportswear",accessories:"Accessoires",beauty:"Beauté",sale:"Soldes",newSeason:"Nouvelle saison · 2026",heroTitle:"Découvrir le style.<br>Acheter mieux.",heroCopy:"Boutiques, marques et collections dans une expérience unique — stock partenaire, checkout Z Fashion et identité ZOS.",shopNow:"Acheter",exploreCorners:"Explorer les Corners",multiBoutique:"Multi-boutique",multiBoutiqueCopy:"Un panier, plusieurs partenaires",freshStock:"Stock actualisé",freshStockCopy:"Disponibilité par boutique",easyReturns:"Retours simples",easyReturnsCopy:"Règles claires par commande",zosIdentity:"Identité ZOS",zosIdentityCopy:"Un compte dans l’écosystème",editWomen:"Éditorial",womenEditTitle:"Quiet luxury, nouveau rythme",editMen:"Homme",menEditTitle:"Tailoring sans effort",editNew:"Nouveautés",newEditTitle:"Les pièces de la saison",discover:"Découvrir",allSaleTitle:"All Sale",allSaleCopy:"Une sélection transversale de plusieurs boutiques. Les produits du Preview sont démonstratifs.",all:"Tout",partnerBoutiques:"Boutiques partenaires",cornersTitle:"Corners",cornersCopy:"Chaque partenaire conserve son identité, sa curation et son stock dans l’expérience Z Fashion.",viewAll:"Voir tout",enterCorner:"Entrer dans le Corner",privateSale:"Vente Privée",campaignTitle:"Une sélection réservée aux membres ZOS.",campaignCopy:"Preview de la logique de campagnes Z Fashion : accès, stock et conditions restent contrôlés par partenaire et marché.",memberAccess:"Accès membre",support:"Aide",delivery:"Livraison",returns:"Retours",contact:"Contact",footerPreview:"Preview produit. Aucun checkout live, identifiant de paiement ou mutation de la base ZOS.",cart:"Panier",checkoutPreview:"Checkout indisponible dans le Preview",close:"Fermer"},
  es:{preview:"Catálogo de demostración · sin pagos reales",search:"Buscar",account:"Cuenta",allSale:"All Sale",women:"Mujer",men:"Hombre",children:"Niños",sports:"Sportswear",accessories:"Accesorios",beauty:"Beauty",sale:"Rebajas",newSeason:"Nueva temporada · 2026",heroTitle:"Descubrir estilo.<br>Comprar mejor.",heroCopy:"Boutiques, marcas y colecciones en una sola experiencia — stock del partner, checkout Z Fashion e identidad ZOS.",shopNow:"Comprar",exploreCorners:"Explorar Corners",multiBoutique:"Multi-boutique",multiBoutiqueCopy:"Un carrito, varios partners",freshStock:"Stock actualizado",freshStockCopy:"Disponibilidad por boutique",easyReturns:"Devoluciones simples",easyReturnsCopy:"Reglas claras por pedido",zosIdentity:"Identidad ZOS",zosIdentityCopy:"Una cuenta en el ecosistema",editWomen:"Editorial",womenEditTitle:"Quiet luxury, nuevo ritmo",editMen:"Hombre",menEditTitle:"Sastrería sin esfuerzo",editNew:"Novedades",newEditTitle:"Piezas que definen la temporada",discover:"Descubrir",allSaleTitle:"All Sale",allSaleCopy:"Una selección de varias boutiques. Los productos del Preview son demostrativos.",all:"Todo",partnerBoutiques:"Boutiques partner",cornersTitle:"Corners",cornersCopy:"Cada partner mantiene identidad, curación y stock propios dentro de Z Fashion.",viewAll:"Ver todo",enterCorner:"Entrar en el Corner",privateSale:"Venta Privada",campaignTitle:"Una selección reservada a miembros ZOS.",campaignCopy:"Preview de campañas Z Fashion: acceso, stock y condiciones siguen controlados por partner y mercado.",memberAccess:"Acceso miembro",support:"Ayuda",delivery:"Entregas",returns:"Devoluciones",contact:"Contacto",footerPreview:"Preview de producto. Sin checkout real, credenciales de pago o mutaciones en la base ZOS.",cart:"Carrito",checkoutPreview:"Checkout no disponible en Preview",close:"Cerrar"},
  it:{preview:"Catalogo dimostrativo · nessun pagamento live",search:"Cerca",account:"Account",allSale:"All Sale",women:"Donna",men:"Uomo",children:"Bambini",sports:"Sportswear",accessories:"Accessori",beauty:"Beauty",sale:"Saldi",newSeason:"Nuova stagione · 2026",heroTitle:"Scoprire lo stile.<br>Acquistare meglio.",heroCopy:"Boutique, brand e collezioni in un’unica esperienza — stock del partner, checkout Z Fashion e identità ZOS.",shopNow:"Acquista",exploreCorners:"Esplora i Corners",multiBoutique:"Multi-boutique",multiBoutiqueCopy:"Un carrello, più partner",freshStock:"Stock aggiornato",freshStockCopy:"Disponibilità per boutique",easyReturns:"Resi semplici",easyReturnsCopy:"Regole chiare per ordine",zosIdentity:"Identità ZOS",zosIdentityCopy:"Un account nell’ecosistema",editWomen:"Editoriale",womenEditTitle:"Quiet luxury, nuovo ritmo",editMen:"Uomo",menEditTitle:"Tailoring senza sforzo",editNew:"Novità",newEditTitle:"I pezzi della stagione",discover:"Scopri",allSaleTitle:"All Sale",allSaleCopy:"Una selezione multi-boutique. I prodotti Preview sono dimostrativi.",all:"Tutto",partnerBoutiques:"Boutique partner",cornersTitle:"Corners",cornersCopy:"Ogni partner mantiene identità, curatela e stock propri dentro Z Fashion.",viewAll:"Vedi tutto",enterCorner:"Entra nel Corner",privateSale:"Vendita Privata",campaignTitle:"Una selezione riservata ai membri ZOS.",campaignCopy:"Preview delle campagne Z Fashion: accesso, stock e condizioni restano controllati per partner e mercato.",memberAccess:"Accesso membro",support:"Supporto",delivery:"Consegne",returns:"Resi",contact:"Contatti",footerPreview:"Preview prodotto. Nessun checkout live, credenziale di pagamento o modifica alla base ZOS.",cart:"Carrello",checkoutPreview:"Checkout non disponibile nel Preview",close:"Chiudi"},
  de:{preview:"Demo-Katalog · keine Live-Zahlungen",search:"Suchen",account:"Konto",allSale:"All Sale",women:"Damen",men:"Herren",children:"Kinder",sports:"Sportswear",accessories:"Accessoires",beauty:"Beauty",sale:"Sale",newSeason:"Neue Saison · 2026",heroTitle:"Stil entdecken.<br>Besser einkaufen.",heroCopy:"Boutiquen, Marken und Kollektionen in einem Erlebnis — Partnerbestand, Z Fashion Checkout und ZOS Identität.",shopNow:"Jetzt shoppen",exploreCorners:"Corners entdecken",multiBoutique:"Multi-Boutique",multiBoutiqueCopy:"Ein Warenkorb, mehrere Partner",freshStock:"Aktueller Bestand",freshStockCopy:"Verfügbarkeit je Boutique",easyReturns:"Einfache Rückgabe",easyReturnsCopy:"Klare Regeln je Bestellung",zosIdentity:"ZOS Identität",zosIdentityCopy:"Ein Konto im Ökosystem",editWomen:"Editorial",womenEditTitle:"Quiet luxury, neuer Rhythmus",editMen:"Herren",menEditTitle:"Müheloses Tailoring",editNew:"Neuheiten",newEditTitle:"Pieces der Saison",discover:"Entdecken",allSaleTitle:"All Sale",allSaleCopy:"Eine Auswahl aus mehreren Boutiquen. Preview-Produkte sind demonstrativ.",all:"Alle",partnerBoutiques:"Partner-Boutiquen",cornersTitle:"Corners",cornersCopy:"Jeder Partner behält Identität, Kuratierung und eigenen Bestand innerhalb von Z Fashion.",viewAll:"Alle ansehen",enterCorner:"Corner öffnen",privateSale:"Private Sale",campaignTitle:"Eine Auswahl für ZOS Mitglieder.",campaignCopy:"Preview der Z Fashion Kampagnenlogik: Zugang, Bestand und Konditionen bleiben Partner- und Markt-gesteuert.",memberAccess:"Mitgliederzugang",support:"Support",delivery:"Lieferung",returns:"Rückgabe",contact:"Kontakt",footerPreview:"Produkt-Preview. Kein Live-Checkout, keine Zahlungsdaten und keine ZOS-Datenbankänderungen.",cart:"Warenkorb",checkoutPreview:"Checkout im Preview nicht verfügbar",close:"Schließen"}
};

let locale="pt", activeFilter="all", wishlist=new Set(), cart=[];
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

function money(v){return new Intl.NumberFormat(locale==="en"?"en-IE":locale==="fr"?"fr-FR":locale==="de"?"de-DE":locale==="it"?"it-IT":locale==="es"?"es-ES":"pt-PT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(v)}
function t(key){return translations[locale]?.[key]||translations.pt[key]||key}
function applyLocale(next){
  locale=next; document.documentElement.lang=locale; document.documentElement.dataset.locale=locale;
  $$('[data-i18n]').forEach(el=>{const value=t(el.dataset.i18n);if(value)el.innerHTML=value});
  $('#localeSelect').value=locale; renderProducts(); renderCart(); renderWishlist();
  localStorage.setItem('zfashion_locale',locale);
}
function filteredProducts(){
  if(activeFilter==='all')return products;
  if(activeFilter==='sale')return products.filter((_,i)=>i%3===1);
  if(activeFilter==='children'||activeFilter==='beauty')return products.slice(0,4);
  return products.filter(p=>p.category===activeFilter);
}
function renderProducts(){
  $('#productGrid').innerHTML=filteredProducts().map(p=>`
    <article class="product-card" data-product="${p.id}" tabindex="0" aria-label="${p.brand} ${p.name}">
      <div class="product-image">
        <img loading="lazy" src="${p.image}" alt="${p.name}">
        <div class="product-badges"><span>${p.badge}</span><span>${p.corner}</span></div>
        <button class="wish-toggle ${wishlist.has(p.id)?'saved':''}" data-wish="${p.id}" aria-label="Wishlist">${wishlist.has(p.id)?'♥':'♡'}</button>
      </div>
      <div class="product-meta"><strong>${p.brand}</strong><span class="product-name">${p.name}</span><span class="price">${money(p.price)}</span><small>${p.corner}</small></div>
    </article>`).join('');
  $$('.product-card').forEach(card=>{
    card.addEventListener('click',e=>{if(!e.target.closest('[data-wish]'))openProduct(card.dataset.product)});
    card.addEventListener('keydown',e=>{if(e.key==='Enter')openProduct(card.dataset.product)});
  });
  $$('[data-wish]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleWish(b.dataset.wish)}));
}
function setFilter(filter){
  activeFilter=filter;
  $$('#filterPills button').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
  renderProducts(); $('#all-sale').scrollIntoView({behavior:'smooth',block:'start'});
}
function openProduct(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  $('#productDetail').innerHTML=`<div class="product-detail">
    <div class="product-detail-media"><img src="${p.image}" alt="${p.name}"></div>
    <div class="product-detail-copy">
      <span class="detail-brand">${p.brand} · ${p.corner}</span><h2>${p.name}</h2><div class="detail-price">${money(p.price)}</div>
      <p class="detail-description">${p.description}</p>
      <p class="eyebrow" style="margin-top:20px">SIZE</p><div class="size-row">${p.sizes.map((s,i)=>`<button class="${i===0?'active':''}">${s}</button>`).join('')}</div>
      <div class="product-detail-actions"><button class="button dark" data-add="${p.id}">${t('cart')==='Bag'?'Add to bag':'Adicionar ao carrinho'}</button><button class="wish-toggle-detail" data-detail-wish="${p.id}">${wishlist.has(p.id)?'♥':'♡'}</button></div>
      <p class="partner-note">Stock demonstrativo · ${p.corner}. O stock real pertence ao Partner e será validado no checkout quando o backend live estiver autorizado.</p>
    </div></div>`;
  $$('.size-row button').forEach(b=>b.addEventListener('click',()=>{$$('.size-row button').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
  $('[data-add]').addEventListener('click',()=>addCart(id));
  $('[data-detail-wish]').addEventListener('click',()=>{toggleWish(id);$('[data-detail-wish]').textContent=wishlist.has(id)?'♥':'♡'});
  $('#productDialog').showModal();
}
function toggleWish(id){
  wishlist.has(id)?wishlist.delete(id):wishlist.add(id);
  $('#wishlistCount').textContent=wishlist.size; renderProducts(); renderWishlist(); toast(wishlist.has(id)?'Adicionado à Wishlist':'Removido da Wishlist');
}
function addCart(id){
  const existing=cart.find(x=>x.id===id); existing?existing.qty++:cart.push({id,qty:1});
  $('#cartCount').textContent=cart.reduce((n,x)=>n+x.qty,0); renderCart(); toast('Adicionado ao carrinho'); $('#productDialog').close();
}
function renderCart(){
  const box=$('#cartItems');
  if(!cart.length){box.innerHTML=`<p class="empty-drawer">O carrinho está vazio. Este Preview permite testar a composição multi-boutique, mas não executa pagamentos.</p>`}
  else box.innerHTML=cart.map(item=>{const p=products.find(x=>x.id===item.id);return `<div class="mini-item"><img src="${p.image}" alt=""><div><strong>${p.brand}</strong><span>${p.name}</span><small>${p.corner} · ×${item.qty}</small></div><div><span>${money(p.price*item.qty)}</span><button class="mini-remove" data-remove="${p.id}" aria-label="Remover">×</button></div></div>`}).join('');
  $('#cartTotal').textContent=money(cart.reduce((sum,item)=>sum+products.find(x=>x.id===item.id).price*item.qty,0));
  $$('[data-remove]',box).forEach(b=>b.addEventListener('click',()=>{cart=cart.filter(x=>x.id!==b.dataset.remove);$('#cartCount').textContent=cart.reduce((n,x)=>n+x.qty,0);renderCart()}));
}
function renderWishlist(){
  const box=$('#wishlistItems');
  if(!wishlist.size){box.innerHTML=`<p class="empty-drawer">A Wishlist está vazia. Guarde peças para as rever mais tarde.</p>`;return}
  box.innerHTML=[...wishlist].map(id=>{const p=products.find(x=>x.id===id);return `<div class="mini-item" data-product="${p.id}"><img src="${p.image}" alt=""><div><strong>${p.brand}</strong><span>${p.name}</span><small>${p.corner}</small></div><span>${money(p.price)}</span></div>`}).join('');
  $$('.mini-item[data-product]',box).forEach(el=>el.addEventListener('click',()=>{closeDrawers();openProduct(el.dataset.product)}));
}
function openDrawer(name){
  closeDrawers(); const el=name==='cart'?$('#cartDrawer'):$('#wishlistDrawer');el.classList.add('open');el.setAttribute('aria-hidden','false');$('#backdrop').hidden=false;document.body.classList.add('locked')
}
function closeDrawers(){
  $$('.drawer').forEach(el=>{el.classList.remove('open');el.setAttribute('aria-hidden','true')});$('#backdrop').hidden=true;document.body.classList.remove('locked')
}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),1800)}
function search(q){
  q=q.trim().toLowerCase();const matches=q?products.filter(p=>[p.brand,p.name,p.corner,p.category].join(' ').toLowerCase().includes(q)):[];
  $('#searchResults').innerHTML=matches.map(p=>`<button class="search-result" data-search-product="${p.id}"><strong>${p.brand}</strong>${p.name} · ${money(p.price)}</button>`).join('');
  $$('[data-search-product]').forEach(b=>b.addEventListener('click',()=>{closeSearch();openProduct(b.dataset.searchProduct)}))
}
function openSearch(){$('#searchPanel').hidden=false;document.body.classList.add('locked');setTimeout(()=>$('#searchInput').focus(),20)}
function closeSearch(){$('#searchPanel').hidden=true;document.body.classList.remove('locked')}

$('#localeSelect').addEventListener('change',e=>applyLocale(e.target.value));
$('#menuButton').addEventListener('click',()=>{const bar=$('#categoryBar');const open=bar.classList.toggle('open');$('#menuButton').setAttribute('aria-expanded',String(open))});
$$('[data-filter]').forEach(el=>el.addEventListener('click',()=>setFilter(el.dataset.filter)));
$('#cartButton').addEventListener('click',()=>openDrawer('cart'));
$('#wishlistButton').addEventListener('click',()=>openDrawer('wishlist'));
$$('.drawer-close').forEach(b=>b.addEventListener('click',closeDrawers));
$('#backdrop').addEventListener('click',closeDrawers);
$('#productClose').addEventListener('click',()=>$('#productDialog').close());
$('#searchTrigger').addEventListener('click',openSearch);
$('#searchClose').addEventListener('click',closeSearch);
$('#searchInput').addEventListener('input',e=>search(e.target.value));
$('#accountButton').addEventListener('click',()=>toast('Conta ZOS · autenticação live ainda não ativada'));
$('#memberButton').addEventListener('click',()=>toast('Venda Privada · Preview'));
$$('[data-corner]').forEach(b=>b.addEventListener('click',()=>toast(`${b.dataset.corner} · Corner Preview`)));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawers();closeSearch()}});

applyLocale(localStorage.getItem('zfashion_locale')||'pt');
renderProducts(); renderCart(); renderWishlist();
