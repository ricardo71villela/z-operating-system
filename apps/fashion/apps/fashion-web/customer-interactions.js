(() => {
  const AUTH=window.ZFashionCustomerRoutes;
  const CATALOG=window.ZFashionCustomerCatalog;
  const STATE=window.ZFashionCustomerState;
  const AREA=window.ZFashionCustomerArea;
  const route=AUTH.routes.find(r=>r.path===location.pathname||(r.pattern&&new RegExp(r.pattern).test(location.pathname)))||null;
  const page=document.getElementById('pageContent');

  const copy={
    fr:{add:'Ajouter au panier Preview',added:'Ajouté au panier Preview',choose:'Choisissez une taille.',save:'Ajouter aux favoris',saved:'Ajouté aux favoris',removed:'Retiré des favoris'},
    pt:{add:'Adicionar ao carrinho Preview',added:'Adicionado ao carrinho Preview',choose:'Escolha um tamanho.',save:'Adicionar aos favoritos',saved:'Adicionado aos favoritos',removed:'Removido dos favoritos'},
    en:{add:'Add to Preview bag',added:'Added to Preview bag',choose:'Choose a size.',save:'Add to favourites',saved:'Added to favourites',removed:'Removed from favourites'},
    es:{add:'Añadir al carrito Preview',added:'Añadido al carrito Preview',choose:'Elige una talla.',save:'Añadir a favoritos',saved:'Añadido a favoritos',removed:'Eliminado de favoritos'},
    it:{add:'Aggiungi al carrello Preview',added:'Aggiunto al carrello Preview',choose:'Scegli una taglia.',save:'Aggiungi ai preferiti',saved:'Aggiunto ai preferiti',removed:'Rimosso dai preferiti'},
    de:{add:'Zum Preview-Warenkorb',added:'Zum Preview-Warenkorb hinzugefügt',choose:'Bitte Größe wählen.',save:'Zu Favoriten',saved:'Zu Favoriten hinzugefügt',removed:'Aus Favoriten entfernt'}
  };
  const locale=()=>document.documentElement.dataset.locale||'fr';
  const t=key=>copy[locale()]?.[key]||copy.fr[key];
  const productFromPath=()=>CATALOG.products.find(p=>p.slug===decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||''));

  const toast=message=>{
    const el=document.getElementById('customerToast');if(!el)return;
    el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true},1800);
  };
  document.addEventListener('zfashion:toast',e=>toast(e.detail));

  const syncCounts=()=>{
    const state=STATE.snapshot();
    const bag=state.bag.reduce((n,item)=>n+item.qty,0);
    for(const [id,value] of [['headerFavouriteCount',state.favourites.length],['mobileFavouriteCount',state.favourites.length],['headerBagCount',bag],['mobileBagCount',bag]]){
      const el=document.getElementById(id);if(el){el.textContent=String(value);el.hidden=value===0;}
    }
  };

  const favouriteButton=(productId,compact=false)=>{
    const active=STATE.snapshot().favourites.includes(productId);
    return `<button type="button" class="favourite-toggle ${active?'active':''}" data-preview-favourite="${productId}" aria-label="${t('save')}">${active?'♥':'♡'}</button>`;
  };

  const bindFavouriteButtons=()=>document.querySelectorAll('[data-preview-favourite]').forEach(btn=>{
    if(btn.dataset.bound==='1')return;btn.dataset.bound='1';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const active=STATE.toggleFavourite(btn.dataset.previewFavourite);btn.classList.toggle('active',active);btn.textContent=active?'♥':'♡';syncCounts();toast(active?t('saved'):t('removed'));});
  });

  const enhanceCards=()=>{
    document.querySelectorAll('.commerce-product-card[data-product]').forEach(card=>{
      if(card.querySelector('[data-preview-favourite]'))return;
      card.insertAdjacentHTML('afterbegin',favouriteButton(card.dataset.product,true));
    });
    bindFavouriteButtons();
  };

  const enhanceProductDetail=()=>{
    if(route?.type!=='product')return;
    const product=productFromPath();const actions=document.querySelector('.commerce-detail-actions');
    if(!product||!actions||actions.dataset.previewEnhanced==='1')return;
    actions.dataset.previewEnhanced='1';
    actions.innerHTML=`<button class="route-button" type="button" data-preview-add-bag="${product.id}">${t('add')}</button><button class="route-button secondary" type="button" data-preview-favourite="${product.id}">${STATE.snapshot().favourites.includes(product.id)?'♥':'♡'} ${t('save')}</button>`;
    const add=actions.querySelector('[data-preview-add-bag]');
    add.addEventListener('click',()=>{const selected=document.querySelector('[data-size].selected');if(!selected){toast(t('choose'));return;}STATE.addBag(product.id,selected.dataset.size,1);syncCounts();toast(t('added'));});
    bindFavouriteButtons();
  };

  const enhanceCommerce=()=>{if(route?.group!=='commerce')return;enhanceCards();enhanceProductDetail();};

  const renderCustomerArea=()=>{
    if(route?.group!=='customer'||!AREA)return;
    page.innerHTML=AREA.render(route,locale());
    AREA.wire(route,locale(),renderCustomerArea);
  };

  const observer=new MutationObserver(()=>enhanceCommerce());
  observer.observe(page,{childList:true,subtree:true});
  document.getElementById('localeSelect')?.addEventListener('change',()=>queueMicrotask(()=>{if(route?.group==='customer')renderCustomerArea();enhanceCommerce();syncCounts();}));
  document.addEventListener('zfashion:preview-state',syncCounts);

  renderCustomerArea();enhanceCommerce();syncCounts();
  window.Z_FASHION_CUSTOMER_INTERACTIONS='PREVIEW_PASS';
})();
