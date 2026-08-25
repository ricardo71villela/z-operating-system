(() => {
  const copy = {
    pt:{sortBy:'Ordenar',featured:'Destaques',priceAsc:'Preço ↑',priceDesc:'Preço ↓',partnerFulfilment:'No checkout real, envios e devoluções serão identificados por boutique.',oneIdentity:'Uma identidade. Todo o ecossistema.',accountTitle:'A sua conta ZOS acompanha-o também no Z Fashion.',accountCopy:'Wishlist, boutiques seguidas, moradas e preferências ficam ligadas à mesma identidade, respeitando as permissões de cada produto.',savedStyle:'Guardar estilo e favoritos',followCorners:'Seguir Corners e boutiques',sharedAddresses:'Reutilizar moradas autorizadas',signinPreview:'Login disponível após ativação',accountBoundary:'Preview: nenhuma sessão real é iniciada.',home:'Início',popularSearches:'Pesquisas populares'},
    en:{sortBy:'Sort',featured:'Featured',priceAsc:'Price ↑',priceDesc:'Price ↓',partnerFulfilment:'In live checkout, shipping and returns will be identified by boutique.',oneIdentity:'One identity. The whole ecosystem.',accountTitle:'Your ZOS account follows you into Z Fashion.',accountCopy:'Wishlist, followed boutiques, addresses and preferences stay connected to the same identity, within each product’s permissions.',savedStyle:'Save style and favourites',followCorners:'Follow Corners and boutiques',sharedAddresses:'Reuse authorised addresses',signinPreview:'Sign-in available after activation',accountBoundary:'Preview: no real session is started.',home:'Home',popularSearches:'Popular searches'},
    fr:{sortBy:'Trier',featured:'Sélection',priceAsc:'Prix ↑',priceDesc:'Prix ↓',partnerFulfilment:'Au checkout réel, expéditions et retours seront identifiés par boutique.',oneIdentity:'Une identité. Tout l’écosystème.',accountTitle:'Votre compte ZOS vous accompagne aussi dans Z Fashion.',accountCopy:'Wishlist, boutiques suivies, adresses et préférences restent liées à la même identité selon les permissions de chaque produit.',savedStyle:'Enregistrer styles et favoris',followCorners:'Suivre Corners et boutiques',sharedAddresses:'Réutiliser les adresses autorisées',signinPreview:'Connexion disponible après activation',accountBoundary:'Preview : aucune session réelle n’est ouverte.',home:'Accueil',popularSearches:'Recherches populaires'},
    es:{sortBy:'Ordenar',featured:'Destacados',priceAsc:'Precio ↑',priceDesc:'Precio ↓',partnerFulfilment:'En el checkout real, envíos y devoluciones se identificarán por boutique.',oneIdentity:'Una identidad. Todo el ecosistema.',accountTitle:'Tu cuenta ZOS te acompaña también en Z Fashion.',accountCopy:'Wishlist, boutiques seguidas, direcciones y preferencias permanecen ligadas a la misma identidad con permisos por producto.',savedStyle:'Guardar estilo y favoritos',followCorners:'Seguir Corners y boutiques',sharedAddresses:'Reutilizar direcciones autorizadas',signinPreview:'Login disponible tras activación',accountBoundary:'Preview: no se inicia ninguna sesión real.',home:'Inicio',popularSearches:'Búsquedas populares'},
    it:{sortBy:'Ordina',featured:'In evidenza',priceAsc:'Prezzo ↑',priceDesc:'Prezzo ↓',partnerFulfilment:'Nel checkout reale, spedizioni e resi saranno identificati per boutique.',oneIdentity:'Un’identità. Tutto l’ecosistema.',accountTitle:'Il tuo account ZOS ti accompagna anche in Z Fashion.',accountCopy:'Wishlist, boutique seguite, indirizzi e preferenze restano collegati alla stessa identità con permessi per prodotto.',savedStyle:'Salvare stile e preferiti',followCorners:'Seguire Corners e boutique',sharedAddresses:'Riutilizzare indirizzi autorizzati',signinPreview:'Login disponibile dopo l’attivazione',accountBoundary:'Preview: nessuna sessione reale viene avviata.',home:'Home',popularSearches:'Ricerche popolari'},
    de:{sortBy:'Sortieren',featured:'Empfohlen',priceAsc:'Preis ↑',priceDesc:'Preis ↓',partnerFulfilment:'Im Live-Checkout werden Versand und Rückgabe je Boutique ausgewiesen.',oneIdentity:'Eine Identität. Das ganze Ökosystem.',accountTitle:'Ihr ZOS Konto begleitet Sie auch in Z Fashion.',accountCopy:'Wishlist, gefolgte Boutiquen, Adressen und Präferenzen bleiben mit derselben Identität und produktspezifischen Berechtigungen verbunden.',savedStyle:'Stil und Favoriten speichern',followCorners:'Corners und Boutiquen folgen',sharedAddresses:'Autorisierte Adressen wiederverwenden',signinPreview:'Login nach Aktivierung verfügbar',accountBoundary:'Preview: Es wird keine echte Sitzung gestartet.',home:'Start',popularSearches:'Beliebte Suchen'}
  };
  const pc = key => copy[locale]?.[key] || copy.pt[key] || key;
  const applyPolishCopy = () => document.querySelectorAll('[data-i18n]').forEach(el => { if(copy[locale]?.[el.dataset.i18n]) el.textContent = pc(el.dataset.i18n); });

  const account = document.getElementById('accountDrawer');
  const openAccount = () => { closeDrawers(); account.classList.add('open'); account.setAttribute('aria-hidden','false'); document.getElementById('backdrop').hidden=false; document.body.classList.add('locked'); };
  document.getElementById('accountButton')?.addEventListener('click', openAccount);
  document.getElementById('memberButton')?.addEventListener('click', openAccount);
  document.querySelector('[data-close="account"]')?.addEventListener('click', closeDrawers);

  const mobile = {
    search:document.getElementById('mobileSearch'), wishlist:document.getElementById('mobileWishlist'), cart:document.getElementById('mobileCart'), account:document.getElementById('mobileAccount')
  };
  mobile.search?.addEventListener('click', openSearch); mobile.wishlist?.addEventListener('click',()=>openDrawer('wishlist')); mobile.cart?.addEventListener('click',()=>openDrawer('cart')); mobile.account?.addEventListener('click',openAccount);

  const syncMobileCounts = () => {
    const wish = document.getElementById('wishlistCount')?.textContent || '0';
    const bag = document.getElementById('cartCount')?.textContent || '0';
    document.getElementById('mobileWishlistCount').textContent=wish; document.getElementById('mobileCartCount').textContent=bag;
  };
  new MutationObserver(syncMobileCounts).observe(document.querySelector('.utility-nav'),{subtree:true,childList:true,characterData:true}); syncMobileCounts();

  const baseSetFilter = setFilter;
  let sortMode='featured';
  const updateCount = () => { const n=document.querySelectorAll('#productGrid .product-card').length; document.getElementById('productCount').textContent=`${n} ${locale==='fr'?'pièces':locale==='en'?'pieces':'peças'}`; };
  const sortGrid = () => {
    const grid=document.getElementById('productGrid'); const cards=[...grid.querySelectorAll('.product-card')];
    if(sortMode==='featured'){ renderProducts(); updateCount(); return; }
    cards.sort((a,b)=>{const pa=products.find(p=>p.id===a.dataset.product)?.price||0,pb=products.find(p=>p.id===b.dataset.product)?.price||0; return sortMode==='price-asc'?pa-pb:pb-pa;});
    cards.forEach(c=>grid.appendChild(c)); updateCount();
  };
  setFilter = function(filter){ baseSetFilter(filter); updateCount(); if(sortMode!=='featured') sortGrid(); };
  document.getElementById('sortSelect')?.addEventListener('change',e=>{sortMode=e.target.value;sortGrid()}); updateCount();

  const baseOpenProduct = openProduct;
  openProduct = function(id){
    baseOpenProduct(id);
    const copyBox=document.querySelector('.product-detail-copy'); if(!copyBox)return;
    const sizeRow=copyBox.querySelector('.size-row');
    if(sizeRow && !copyBox.querySelector('.size-helper')){
      const helper=document.createElement('div'); helper.className='size-helper'; helper.innerHTML=`<span>${locale==='fr'?'Taille':locale==='en'?'Size':'Tamanho'}</span><button type="button">${locale==='fr'?'Guide des tailles':locale==='en'?'Size guide':'Guia de tamanhos'}</button>`; sizeRow.before(helper); helper.querySelector('button').onclick=()=>toast(`${helper.querySelector('button').textContent} · Preview`);
    }
    if(!copyBox.querySelector('.detail-polish')){
      const services=document.createElement('div'); services.className='detail-polish'; services.innerHTML=`<span>${locale==='fr'?'Stock démonstratif — aucune réservation':locale==='en'?'Demo stock — no reservation':'Stock demonstrativo — sem reserva'}</span><span>${locale==='fr'?'Retours définis par boutique':locale==='en'?'Returns defined by boutique':'Devoluções definidas por boutique'}</span>`; copyBox.querySelector('.partner-note')?.before(services);
    }
  };

  const baseAddCart = addCart;
  addCart = function(id){ const selected=document.querySelector('.size-row button.active')?.textContent?.trim(); baseAddCart(id); const item=cart.find(x=>x.id===id); if(item && selected)item.size=selected; renderCart(); syncMobileCounts(); };
  const baseRenderCart = renderCart;
  renderCart = function(){
    baseRenderCart();
    document.querySelectorAll('#cartItems .mini-item').forEach((row,i)=>{const item=cart[i]; const small=row.querySelector('small'); if(item?.size && small && !small.textContent.includes(item.size))small.textContent += ` · ${item.size}`;});
    if(!cart.length){document.getElementById('cartItems').innerHTML=`<div class="empty-polish"><strong>${locale==='fr'?'Votre panier est vide.':locale==='en'?'Your bag is empty.':'O seu carrinho está vazio.'}</strong><span>${locale==='fr'?'Ajoutez des pièces de différentes boutiques.':locale==='en'?'Add pieces from different boutiques.':'Adicione peças de diferentes boutiques.'}</span><br><button class="button dark" data-polish-shop>${t('shopNow')}</button></div>`; document.querySelector('[data-polish-shop]').onclick=()=>{closeDrawers();setFilter('all')}}
    syncMobileCounts();
  };
  const baseRenderWishlist = renderWishlist;
  renderWishlist = function(){baseRenderWishlist(); if(!wishlist.size){document.getElementById('wishlistItems').innerHTML=`<div class="empty-polish"><strong>${locale==='fr'?'Votre sélection est vide.':locale==='en'?'Your edit is empty.':'A sua seleção está vazia.'}</strong><span>${locale==='fr'?'Enregistrez les pièces que vous souhaitez retrouver.':locale==='en'?'Save pieces you want to revisit.':'Guarde as peças a que quer voltar.'}</span><br><button class="button dark" data-polish-wish-shop>${t('shopNow')}</button></div>`; document.querySelector('[data-polish-wish-shop]').onclick=()=>{closeDrawers();setFilter('all')}} syncMobileCounts(); };

  document.querySelectorAll('[data-search]').forEach(btn=>btn.addEventListener('click',()=>{const q=btn.dataset.search; document.getElementById('searchInput').value=q; search(q); document.getElementById('searchSuggestions').style.display='none';}));
  document.getElementById('searchInput')?.addEventListener('input',e=>{document.getElementById('searchSuggestions').style.display=e.target.value.trim()?'none':'flex'});

  document.getElementById('localeSelect')?.addEventListener('change',()=>setTimeout(()=>{applyPolishCopy();updateCount();renderCart();renderWishlist();},0));
  applyPolishCopy(); renderCart(); renderWishlist();
  window.Z_FASHION_FINAL_POLISH='PASS';
})();
