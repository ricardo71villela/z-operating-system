(() => {
  const routes = [
    {id:'new',path:'/nouveautes',group:'commerce',type:'category'},
    {id:'women',path:'/femme',group:'commerce',type:'category'},
    {id:'men',path:'/homme',group:'commerce',type:'category'},
    {id:'kids',path:'/enfant',group:'commerce',type:'category'},
    {id:'sport',path:'/sport',group:'commerce',type:'category'},
    {id:'accessories',path:'/accessoires',group:'commerce',type:'category'},
    {id:'beauty',path:'/beaute',group:'commerce',type:'category'},
    {id:'sale',path:'/soldes',group:'commerce',type:'category'},
    {id:'search',path:'/recherche',group:'commerce',type:'search'},
    {id:'product',pattern:'^/produit/[^/]+$',group:'commerce',type:'product'},
    {id:'corners',path:'/corners',group:'commerce',type:'corners'},
    {id:'corner',pattern:'^/corner/[^/]+$',group:'commerce',type:'corner'},
    {id:'privateSale',path:'/vente-privee',group:'commerce',type:'privateSale'},

    {id:'favourites',path:'/favoris',group:'customer',type:'favourites'},
    {id:'bag',path:'/panier',group:'customer',type:'bag'},
    {id:'login',path:'/connexion',group:'customer',type:'login'},
    {id:'account',path:'/compte',group:'customer',type:'account'},
    {id:'profile',path:'/compte/profil',group:'customer',type:'accountDetail'},
    {id:'addresses',path:'/compte/adresses',group:'customer',type:'accountDetail'},
    {id:'orders',path:'/compte/commandes',group:'customer',type:'orders'},
    {id:'order',pattern:'^/compte/commandes/[^/]+$',group:'customer',type:'order'},
    {id:'returns',path:'/compte/retours',group:'customer',type:'accountDetail'},
    {id:'tracking',path:'/compte/suivi',group:'customer',type:'tracking'},

    {id:'checkoutIdentify',path:'/checkout',group:'checkout',type:'checkout'},
    {id:'checkoutDelivery',path:'/checkout/livraison',group:'checkout',type:'checkout'},
    {id:'checkoutPayment',path:'/checkout/paiement',group:'checkout',type:'checkout'},
    {id:'checkoutReview',path:'/checkout/revision',group:'checkout',type:'checkout'},
    {id:'checkoutConfirmation',path:'/checkout/confirmation',group:'checkout',type:'checkout'},

    {id:'delivery',path:'/livraisons',group:'service',type:'service'},
    {id:'refunds',path:'/retours-remboursements',group:'service',type:'service'},
    {id:'help',path:'/aide',group:'service',type:'help'},
    {id:'contact',path:'/contact',group:'service',type:'contact'},

    {id:'legalNotice',path:'/mentions-legales',group:'legal',type:'legal'},
    {id:'termsSale',path:'/cgv',group:'legal',type:'legal'},
    {id:'termsUse',path:'/conditions-utilisation',group:'legal',type:'legal'},
    {id:'privacy',path:'/confidentialite',group:'legal',type:'legal'},
    {id:'cookies',path:'/cookies',group:'legal',type:'legal'},
    {id:'consent',path:'/consentement',group:'legal',type:'consent'}
  ];

  const titles = {
    fr:{new:'Nouveautés',women:'Femme',men:'Homme',kids:'Enfant',sport:'Sport',accessories:'Accessoires',beauty:'Beauté',sale:'Soldes',search:'Recherche',product:'Détail du produit',corners:'Corners',corner:'Boutique partenaire',privateSale:'Vente privée',favourites:'Favoris',bag:'Panier',login:'Connexion',account:'Mon compte',profile:'Profil',addresses:'Adresses',orders:'Commandes',order:'Détail de la commande',returns:'Retours',tracking:'Suivi de commande',checkoutIdentify:'Identification',checkoutDelivery:'Livraison',checkoutPayment:'Paiement',checkoutReview:'Révision de la commande',checkoutConfirmation:'Confirmation',delivery:'Livraisons',refunds:'Retours & remboursements',help:'Aide',contact:'Contact',legalNotice:'Mentions légales',termsSale:'Conditions Générales de Vente',termsUse:'Conditions d’utilisation',privacy:'Politique de confidentialité',cookies:'Politique de cookies',consent:'Gestion du consentement'},
    pt:{new:'Novidades',women:'Mulher',men:'Homem',kids:'Criança',sport:'Desporto',accessories:'Acessórios',beauty:'Beleza',sale:'Saldos',search:'Pesquisa',product:'Detalhe do produto',corners:'Corners',corner:'Boutique parceira',privateSale:'Venda privada',favourites:'Favoritos',bag:'Carrinho',login:'Entrar',account:'A minha conta',profile:'Perfil',addresses:'Moradas',orders:'Encomendas',order:'Detalhe da encomenda',returns:'Devoluções',tracking:'Seguir encomenda',checkoutIdentify:'Identificação',checkoutDelivery:'Entrega',checkoutPayment:'Pagamento',checkoutReview:'Revisão da encomenda',checkoutConfirmation:'Confirmação',delivery:'Entregas',refunds:'Devoluções e reembolsos',help:'Ajuda',contact:'Contacto',legalNotice:'Aviso legal',termsSale:'Condições Gerais de Venda',termsUse:'Condições de utilização',privacy:'Política de privacidade',cookies:'Política de cookies',consent:'Gestão de consentimento'},
    en:{new:'New arrivals',women:'Women',men:'Men',kids:'Kids',sport:'Sport',accessories:'Accessories',beauty:'Beauty',sale:'Sale',search:'Search',product:'Product detail',corners:'Corners',corner:'Partner boutique',privateSale:'Private sale',favourites:'Favourites',bag:'Bag',login:'Sign in',account:'My account',profile:'Profile',addresses:'Addresses',orders:'Orders',order:'Order detail',returns:'Returns',tracking:'Order tracking',checkoutIdentify:'Identification',checkoutDelivery:'Delivery',checkoutPayment:'Payment',checkoutReview:'Order review',checkoutConfirmation:'Confirmation',delivery:'Delivery',refunds:'Returns & refunds',help:'Help',contact:'Contact',legalNotice:'Legal notice',termsSale:'Terms of sale',termsUse:'Terms of use',privacy:'Privacy policy',cookies:'Cookie policy',consent:'Consent management'},
    es:{new:'Novedades',women:'Mujer',men:'Hombre',kids:'Niños',sport:'Deporte',accessories:'Accesorios',beauty:'Belleza',sale:'Rebajas',search:'Buscar',product:'Detalle del producto',corners:'Corners',corner:'Boutique colaboradora',privateSale:'Venta privada',favourites:'Favoritos',bag:'Carrito',login:'Acceder',account:'Mi cuenta',profile:'Perfil',addresses:'Direcciones',orders:'Pedidos',order:'Detalle del pedido',returns:'Devoluciones',tracking:'Seguimiento del pedido',checkoutIdentify:'Identificación',checkoutDelivery:'Entrega',checkoutPayment:'Pago',checkoutReview:'Revisión del pedido',checkoutConfirmation:'Confirmación',delivery:'Entregas',refunds:'Devoluciones y reembolsos',help:'Ayuda',contact:'Contacto',legalNotice:'Aviso legal',termsSale:'Condiciones Generales de Venta',termsUse:'Condiciones de uso',privacy:'Política de privacidad',cookies:'Política de cookies',consent:'Gestión del consentimiento'},
    it:{new:'Novità',women:'Donna',men:'Uomo',kids:'Bambini',sport:'Sport',accessories:'Accessori',beauty:'Beauty',sale:'Saldi',search:'Ricerca',product:'Dettaglio prodotto',corners:'Corners',corner:'Boutique partner',privateSale:'Vendita privata',favourites:'Preferiti',bag:'Carrello',login:'Accedi',account:'Il mio account',profile:'Profilo',addresses:'Indirizzi',orders:'Ordini',order:'Dettaglio ordine',returns:'Resi',tracking:'Tracciamento ordine',checkoutIdentify:'Identificazione',checkoutDelivery:'Consegna',checkoutPayment:'Pagamento',checkoutReview:'Riepilogo ordine',checkoutConfirmation:'Conferma',delivery:'Consegne',refunds:'Resi e rimborsi',help:'Aiuto',contact:'Contatti',legalNotice:'Note legali',termsSale:'Condizioni Generali di Vendita',termsUse:'Condizioni d’uso',privacy:'Informativa sulla privacy',cookies:'Politica sui cookie',consent:'Gestione del consenso'},
    de:{new:'Neuheiten',women:'Damen',men:'Herren',kids:'Kinder',sport:'Sport',accessories:'Accessoires',beauty:'Beauty',sale:'Sale',search:'Suche',product:'Produktdetails',corners:'Corners',corner:'Partner-Boutique',privateSale:'Private Sale',favourites:'Favoriten',bag:'Warenkorb',login:'Anmelden',account:'Mein Konto',profile:'Profil',addresses:'Adressen',orders:'Bestellungen',order:'Bestelldetails',returns:'Rücksendungen',tracking:'Sendungsverfolgung',checkoutIdentify:'Identifikation',checkoutDelivery:'Lieferung',checkoutPayment:'Zahlung',checkoutReview:'Bestellprüfung',checkoutConfirmation:'Bestätigung',delivery:'Lieferung',refunds:'Rücksendungen & Erstattungen',help:'Hilfe',contact:'Kontakt',legalNotice:'Impressum',termsSale:'Allgemeine Verkaufsbedingungen',termsUse:'Nutzungsbedingungen',privacy:'Datenschutzerklärung',cookies:'Cookie-Richtlinie',consent:'Einwilligungsverwaltung'}
  };

  const shell = {
    fr:{skip:'Aller au contenu',preview:'Site client en construction · aucun paiement réel',search:'Rechercher',account:'Compte',bag:'Panier',language:'Langue',discover:'Découvrir',help:'Aide',delivery:'Livraisons',returns:'Retours',contact:'Contact',home:'Accueil',favourites:'Favoris',open:'Ouvrir',continue:'Continuer',back:'Retour',previewOnly:'Aperçu uniquement',empty:'Aucune donnée réelle n’est chargée dans cet aperçu.',brand:'Une marque de l’écosystème ZOS'},
    pt:{skip:'Ir para o conteúdo',preview:'Site cliente em construção · sem pagamentos reais',search:'Pesquisar',account:'Conta',bag:'Carrinho',language:'Idioma',discover:'Descobrir',help:'Ajuda',delivery:'Entregas',returns:'Devoluções',contact:'Contacto',home:'Início',favourites:'Favoritos',open:'Abrir',continue:'Continuar',back:'Voltar',previewOnly:'Apenas Preview',empty:'Nenhum dado real é carregado neste Preview.',brand:'Uma marca do ecossistema ZOS'},
    en:{skip:'Skip to content',preview:'Customer site in development · no live payments',search:'Search',account:'Account',bag:'Bag',language:'Language',discover:'Discover',help:'Help',delivery:'Delivery',returns:'Returns',contact:'Contact',home:'Home',favourites:'Favourites',open:'Open',continue:'Continue',back:'Back',previewOnly:'Preview only',empty:'No live data is loaded in this Preview.',brand:'A brand of the ZOS ecosystem'},
    es:{skip:'Ir al contenido',preview:'Sitio de cliente en construcción · sin pagos reales',search:'Buscar',account:'Cuenta',bag:'Carrito',language:'Idioma',discover:'Descubrir',help:'Ayuda',delivery:'Entregas',returns:'Devoluciones',contact:'Contacto',home:'Inicio',favourites:'Favoritos',open:'Abrir',continue:'Continuar',back:'Volver',previewOnly:'Solo Preview',empty:'No se cargan datos reales en este Preview.',brand:'Una marca del ecosistema ZOS'},
    it:{skip:'Vai al contenuto',preview:'Sito cliente in sviluppo · nessun pagamento reale',search:'Cerca',account:'Account',bag:'Carrello',language:'Lingua',discover:'Scopri',help:'Aiuto',delivery:'Consegne',returns:'Resi',contact:'Contatti',home:'Home',favourites:'Preferiti',open:'Apri',continue:'Continua',back:'Indietro',previewOnly:'Solo Preview',empty:'Nessun dato reale viene caricato in questa Preview.',brand:'Un marchio dell’ecosistema ZOS'},
    de:{skip:'Zum Inhalt',preview:'Kundenseite im Aufbau · keine echten Zahlungen',search:'Suchen',account:'Konto',bag:'Warenkorb',language:'Sprache',discover:'Entdecken',help:'Hilfe',delivery:'Lieferung',returns:'Rücksendungen',contact:'Kontakt',home:'Start',favourites:'Favoriten',open:'Öffnen',continue:'Weiter',back:'Zurück',previewOnly:'Nur Preview',empty:'In dieser Preview werden keine Live-Daten geladen.',brand:'Eine Marke des ZOS-Ökosystems'}
  };

  const groupIntro = {
    fr:{commerce:'Découvrez la sélection Z Fashion dans une page dédiée, avec une navigation et des filtres propres à cette destination.',customer:'Votre espace client Z Fashion, préparé pour accueillir vos données dès l’activation sécurisée des services live.',checkout:'Parcours de commande Z Fashion préparé en mode Preview. Aucun paiement, stock ou ordre réel n’est créé.',service:'Informations et assistance Z Fashion dans une page dédiée.',legal:'Cadre juridique et confidentialité préparés pour le lancement. Le contenu final fera l’objet d’une validation juridique avant Production.'},
    pt:{commerce:'Descubra a seleção Z Fashion numa página própria, com navegação e filtros dedicados.',customer:'O seu espaço cliente Z Fashion, preparado para receber os seus dados quando os serviços live forem ativados em segurança.',checkout:'Percurso de compra Z Fashion preparado em Preview. Nenhum pagamento, stock ou encomenda real é criado.',service:'Informação e apoio Z Fashion numa página dedicada.',legal:'Enquadramento jurídico e privacidade preparados para lançamento. O conteúdo final será validado juridicamente antes de Produção.'},
    en:{commerce:'Discover the Z Fashion selection on a dedicated page with navigation and filters specific to this destination.',customer:'Your Z Fashion customer area, ready to receive your data once live services are securely activated.',checkout:'Z Fashion checkout journey prepared in Preview mode. No real payment, stock reservation or order is created.',service:'Z Fashion information and support on a dedicated page.',legal:'Legal and privacy framework prepared for launch. Final wording remains subject to legal validation before Production.'},
    es:{commerce:'Descubre la selección Z Fashion en una página propia, con navegación y filtros específicos.',customer:'Tu espacio de cliente Z Fashion, preparado para recibir tus datos cuando se activen de forma segura los servicios live.',checkout:'Proceso de compra Z Fashion preparado en modo Preview. No se crea ningún pago, reserva de stock ni pedido real.',service:'Información y asistencia Z Fashion en una página dedicada.',legal:'Marco legal y de privacidad preparado para el lanzamiento. El texto final deberá validarse jurídicamente antes de Producción.'},
    it:{commerce:'Scopri la selezione Z Fashion in una pagina dedicata, con navigazione e filtri specifici.',customer:'La tua area cliente Z Fashion, pronta a ricevere i tuoi dati quando i servizi live saranno attivati in sicurezza.',checkout:'Percorso checkout Z Fashion predisposto in modalità Preview. Non vengono creati pagamenti, riserve di stock o ordini reali.',service:'Informazioni e assistenza Z Fashion in una pagina dedicata.',legal:'Quadro legale e privacy predisposti per il lancio. I testi finali saranno sottoposti a validazione legale prima della Produzione.'},
    de:{commerce:'Entdecken Sie die Z Fashion Auswahl auf einer eigenen Seite mit passender Navigation und Filtern.',customer:'Ihr Z Fashion Kundenbereich, bereit für Ihre Daten, sobald die Live-Dienste sicher aktiviert sind.',checkout:'Z Fashion Checkout im Preview-Modus. Es werden keine echten Zahlungen, Reservierungen oder Bestellungen erstellt.',service:'Z Fashion Informationen und Support auf einer eigenen Seite.',legal:'Rechtlicher und datenschutzbezogener Rahmen für den Launch vorbereitet. Die finalen Texte werden vor Produktion rechtlich geprüft.'}
  };

  window.ZFashionCustomerRoutes = {routes,titles,shell,groupIntro};
})();
