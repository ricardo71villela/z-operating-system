(() => {
  const launchFr = {
    preview:'Catalogue de démonstration · aucun paiement réel',
    search:'Rechercher', account:'Compte', allSale:'Toute la sélection', women:'Femme', men:'Homme', children:'Enfant', sports:'Sport', accessories:'Accessoires', beauty:'Beauté', sale:'Soldes',
    newSeason:'Nouvelle saison · 2026', heroTitle:'Découvrir le style.<br>Acheter mieux.', heroCopy:'Boutiques, marques et collections dans une expérience unique — avec sélection éditoriale, stock partenaire et finalisation de commande Z Fashion.',
    shopNow:'Découvrir la sélection', exploreCorners:'Explorer les Corners', multiBoutique:'Multi-boutiques', multiBoutiqueCopy:'Un panier, plusieurs boutiques', freshStock:'Stock actualisé', freshStockCopy:'Disponibilité par boutique', easyReturns:'Retours simplifiés', easyReturnsCopy:'Conditions claires par commande',
    zosIdentity:'Compte unique', zosIdentityCopy:'Préférences et favoris réunis', editWomen:'Éditorial', womenEditTitle:'Luxe discret, nouveau rythme', editMen:'Homme', menEditTitle:'Coupe structurée sans effort', editNew:'Nouveautés', newEditTitle:'Les pièces qui définissent la saison', discover:'Découvrir',
    allSaleTitle:'Toute la sélection', allSaleCopy:'Une sélection transversale de plusieurs boutiques. Dans cet aperçu, les produits sont démonstratifs.', all:'Tout', partnerBoutiques:'Boutiques partenaires', cornersTitle:'Corners', cornersCopy:'Chaque partenaire conserve son identité, sa sélection et son stock dans l’expérience Z Fashion.', viewAll:'Voir tout', enterCorner:'Entrer dans le Corner',
    privateSale:'Vente privée', campaignTitle:'Une sélection réservée aux membres.', campaignCopy:'Aperçu des campagnes Z Fashion : l’accès, le stock et les conditions commerciales restent définis par boutique et par marché.', memberAccess:'Accès membre', support:'Aide', delivery:'Livraisons', returns:'Retours', contact:'Contact',
    footerPreview:'Aperçu produit. Aucun paiement réel, aucune donnée de paiement et aucune modification de la base ZOS.', cart:'Panier', checkoutPreview:'Paiement indisponible dans cet aperçu', close:'Fermer'
  };

  const polishFr = {
    sortBy:'Trier', featured:'Sélection', priceAsc:'Prix ↑', priceDesc:'Prix ↓', partnerFulfilment:'Lors de la commande réelle, les expéditions et les retours seront identifiés par boutique.',
    oneIdentity:'Un compte. Une expérience continue.', accountTitle:'Votre compte vous accompagne également dans Z Fashion.', accountCopy:'Favoris, boutiques suivies, adresses et préférences restent liés au même compte, selon les autorisations de chaque produit.', savedStyle:'Enregistrer styles et favoris', followCorners:'Suivre les Corners et les boutiques', sharedAddresses:'Réutiliser les adresses autorisées', signinPreview:'Connexion disponible après activation', accountBoundary:'Aperçu : aucune session réelle n’est ouverte.', home:'Accueil', popularSearches:'Recherches populaires'
  };

  const productFr = {
    p1:['Blazer structuré en laine','Blazer à la construction épurée, épaule souple et laine froide. Une pièce de transition pensée pour le quotidien.'],
    p2:['Manteau minimaliste en laine','Manteau aux lignes longues et à la finition minimaliste, sélectionné par Maison Nord.'],
    p3:['Surchemise technique','Surchemise légère à construction technique et volume décontracté, idéale pour les superpositions.'],
    p4:['Sac Arc en cuir','Sac compact en cuir à structure courbe, finitions discrètes et bandoulière réglable.'],
    p5:['Runner 02','Sneaker de course urbaine au profil léger, semelle réactive et construction respirante.'],
    p6:['Robe colonne','Robe longue à encolure épurée et tissu fluide au toucher sec.'],
    p7:['Bomber en daim','Bomber en daim souple à finition mate et proportions contemporaines.'],
    p8:['Mocassin 19','Mocassin de construction classique réinterprété avec semelle fine et bout allongé.']
  };

  locale='fr';
  localStorage.setItem('zfashion_locale','fr');
  document.documentElement.lang='fr';
  document.documentElement.dataset.locale='fr';
  if (typeof translations !== 'undefined') Object.assign(translations.fr, launchFr);
  if (typeof products !== 'undefined') products.forEach(p => { const tr=productFr[p.id]; if(tr){p.name=tr[0];p.description=tr[1];} });

  applyLocale('fr');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const value=launchFr[el.dataset.i18n] ?? polishFr[el.dataset.i18n];
    if(value !== undefined) el.innerHTML=value;
  });
  const input=document.getElementById('searchInput'); if(input) input.placeholder='Rechercher marques, pièces, boutiques…';
  document.querySelectorAll('.corner-card p').forEach((el,i)=>{el.textContent=['Mode femme contemporaine','Essentiels contemporains','Cuir & accessoires'][i]||el.textContent;});

  const originalToast=toast;
  toast=function(message){
    const map={'Adicionado ao carrinho':'Ajouté au panier','Conta ZOS · autenticação live ainda não ativada':'Compte · authentification réelle pas encore activée','Venda Privada · Preview':'Vente privée · aperçu'};
    originalToast(map[message] || message);
  };

  const originalOpenProduct=openProduct;
  openProduct=function(id){
    originalOpenProduct(id);
    const add=document.querySelector('[data-add]'); if(add) add.textContent='Ajouter au panier';
    const note=document.querySelector('.partner-note');
    if(note){const p=products.find(x=>x.id===id);note.textContent=`Stock de démonstration · ${p?.corner || 'boutique'}. Le stock réel appartient à la boutique et sera vérifié lors de la finalisation de commande après activation du backend.`;}
  };

  renderProducts(); renderCart(); renderWishlist();
  window.Z_FASHION_FRANCE_LAUNCH='PASS';
})();
