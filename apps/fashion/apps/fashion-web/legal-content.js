/* ============================================================
   Z FASHION — legal and service texts (task 5)
   ============================================================
   One source for every legal page of the site and for the Partner
   terms the stores accept at sign-up. French is the binding language;
   in the other site languages the pages show the French text with a
   note saying so.

   {{...}} marks information that does not exist yet (the company that
   runs Z Fashion is not created, the consumer mediator is not chosen).
   Those parts are shown highlighted on the site, and
   apps/fashion/scripts/check-legal-ready.js fails while one is left:
   it must pass before the launch. A lawyer should read the texts
   before the launch as well.

   Pages: mentions légales, CGV (clients), conditions d'utilisation,
   confidentialité, cookies, consentement, conditions Partner,
   livraisons, retours et remboursements, aide.
   ============================================================ */

(function (root) {
  'use strict';

  var VERSION = {
    customer: 'cgv-client-2026-10',
    partner: 'cgv-partner-2026-10',
    updated: '17 octobre 2026',
  };

  var E = {
    company: '{{raison sociale de la société qui exploite Z Fashion}}',
    form: '{{forme juridique et capital social}}',
    address: '{{adresse du siège social}}',
    rcs: '{{numéro RCS et ville du greffe}}',
    vat: '{{numéro de TVA intracommunautaire}}',
    director: '{{nom du directeur de la publication}}',
    email: 'contact@zfashion.online',
    partnerEmail: 'partenaires@zfashion.online',
    privacyEmail: 'donnees@zfashion.online',
    mediator: '{{nom, adresse postale et site internet du médiateur de la consommation choisi par Z Fashion}}',
    court: '{{ville du tribunal de commerce du siège}}',
  };

  // ---------- documents
  // Each section: { h: heading, p: [paragraphs], ul: [items], box: true (framed) }

  var DOCS = {};

  DOCS.legalNotice = {
    title: 'Mentions légales',
    sections: [
      { h: 'Éditeur du site', p: [
        'Le site zfashion.online et les espaces associés (espace Partner, backoffice) sont édités par ' + E.company + ', ' + E.form + ', dont le siège est situé ' + E.address + ', immatriculée sous le ' + E.rcs + ', numéro de TVA ' + E.vat + '.',
        'Z Fashion est une marque de l’écosystème ZOS.',
        'Contact : ' + E.email + '.',
      ] },
      { h: 'Directeur de la publication', p: [E.director + '.'] },
      { h: 'Hébergement', p: [
        'Site et API : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com.',
        'Base de données, comptes et photos : Supabase Inc., données hébergées dans l’Union européenne (Irlande, centre de données Amazon Web Services eu-west-1) — supabase.com.',
      ] },
      { h: 'Paiements', p: [
        'Les paiements sont traités par Stripe Payments Europe Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin D02 H210, Irlande, établissement agréé par la Banque centrale d’Irlande. Z Fashion n’a jamais accès aux numéros de carte.',
      ] },
      { h: 'Place de marché', p: [
        'Z Fashion est une place de marché : les articles sont vendus par des boutiques indépendantes, professionnelles, dont le nom figure sur chaque fiche produit, dans le panier et sur la confirmation de commande. Les conditions applicables sont décrites dans les conditions générales de vente.',
      ] },
      { h: 'Propriété intellectuelle', p: [
        'La marque Z Fashion, le logo, la charte graphique et les textes du site sont protégés. Les photos et descriptions des articles appartiennent aux boutiques ou à leurs ayants droit. Toute reproduction sans autorisation est interdite.',
      ] },
      { h: 'Signaler un contenu illicite', p: [
        'Tout contenu ou article qui vous paraît illicite (contrefaçon, produit dangereux, contenu trompeur ou haineux) peut être signalé à ' + E.email + ' en indiquant l’adresse de la page, la raison du signalement et vos coordonnées. Chaque signalement est examiné et vous recevez une réponse motivée.',
      ] },
    ],
  };

  var GUARANTEE_BOX = [
    'Le consommateur dispose d’un délai de deux ans à compter de la délivrance du bien pour obtenir la mise en œuvre de la garantie légale de conformité en cas d’apparition d’un défaut de conformité. Durant ce délai, le consommateur n’est tenu d’établir que l’existence du défaut de conformité et non la date d’apparition de celui-ci.',
    'Lorsque le contrat de vente du bien prévoit la fourniture d’un contenu numérique ou d’un service numérique de manière continue pendant une durée supérieure à deux ans, la garantie légale est applicable à ce contenu numérique ou ce service numérique tout au long de la période de fourniture prévue. Durant ce délai, le consommateur n’est tenu d’établir que l’existence du défaut de conformité affectant le contenu numérique ou le service numérique et non la date d’apparition de celui-ci.',
    'La garantie légale de conformité emporte obligation pour le professionnel, le cas échéant, de fournir toutes les mises à jour nécessaires au maintien de la conformité du bien.',
    'La garantie légale de conformité donne au consommateur droit à la réparation ou au remplacement du bien dans un délai de trente jours suivant sa demande, sans frais et sans inconvénient majeur pour lui.',
    'Si le bien est réparé dans le cadre de la garantie légale de conformité, le consommateur bénéficie d’une extension de six mois de la garantie initiale.',
    'Si le consommateur demande la réparation du bien, mais que le vendeur impose le remplacement, la garantie légale de conformité est renouvelée pour une période de deux ans à compter de la date de remplacement du bien.',
    'Le consommateur peut obtenir une réduction du prix d’achat en conservant le bien ou mettre fin au contrat en se faisant rembourser intégralement contre restitution du bien, si : 1° Le professionnel refuse de réparer ou de remplacer le bien ; 2° La réparation ou le remplacement du bien intervient après un délai de trente jours ; 3° La réparation ou le remplacement du bien occasionne un inconvénient majeur pour le consommateur, notamment lorsque le consommateur supporte définitivement les frais de reprise ou d’enlèvement du bien non conforme, ou s’il supporte les frais d’installation du bien réparé ou de remplacement ; 4° La non-conformité du bien persiste en dépit de la tentative de mise en conformité du vendeur restée infructueuse.',
    'Le consommateur a également droit à une réduction du prix du bien ou à la résolution du contrat lorsque le défaut de conformité est si grave qu’il justifie que la réduction du prix ou la résolution du contrat soit immédiate. Le consommateur n’est alors pas tenu de demander la réparation ou le remplacement du bien au préalable.',
    'Le consommateur n’a pas droit à la résolution de la vente si le défaut de conformité est mineur.',
    'Toute période d’immobilisation du bien en vue de sa réparation ou de son remplacement suspend la garantie qui restait à courir jusqu’à la délivrance du bien remis en état.',
    'Les droits mentionnés ci-dessus résultent de l’application des articles L. 217-1 à L. 217-32 du code de la consommation.',
    'Le vendeur qui fait obstacle de mauvaise foi à la mise en œuvre de la garantie légale de conformité encourt une amende civile d’un montant maximal de 300 000 euros, qui peut être porté jusqu’à 10 % du chiffre d’affaires moyen annuel (article L. 241-5 du code de la consommation).',
    'Le consommateur bénéficie également de la garantie légale des vices cachés en application des articles 1641 à 1649 du code civil, pendant une durée de deux ans à compter de la découverte du défaut. Cette garantie donne droit à une réduction de prix si le bien est conservé ou à un remboursement intégral contre restitution du bien.',
  ];

  DOCS.termsSale = {
    title: 'Conditions générales de vente',
    version: VERSION.customer,
    sections: [
      { h: '1. Qui vend, qui fait quoi', p: [
        'Z Fashion (' + E.company + ', ci-après « Z Fashion ») exploite une place de marché en ligne sur laquelle des boutiques de mode indépendantes (ci-après les « Boutiques ») vendent leurs articles à des particuliers (ci-après le « Client »).',
        'Chaque article est vendu par une Boutique, commerçant professionnel immatriculé, dont le nom figure sur la fiche produit, dans le panier, sur le récapitulatif et sur la confirmation de commande. Le contrat de vente est conclu entre le Client et cette Boutique. Une commande comprenant des articles de plusieurs Boutiques donne lieu à un contrat avec chacune d’elles.',
        'Z Fashion met la place de marché à disposition, encaisse le prix au nom et pour le compte des Boutiques par l’intermédiaire de son prestataire de paiement, transmet les commandes, accompagne le Client et veille au respect des présentes conditions. Le Client bénéficie de tous les droits du consommateur (rétractation, garanties légales) vis-à-vis de la Boutique ; Z Fashion l’aide à les exercer.',
        'Les présentes conditions s’appliquent à toute commande passée sur zfashion.online par un Client majeur agissant à des fins non professionnelles. Elles sont acceptées à chaque commande. Version ' + VERSION.customer + ', mise à jour le ' + VERSION.updated + '.',
      ] },
      { h: '2. Présentation des articles et classement', p: [
        'Les fiches produits (photos, description, composition, taille, prix) sont établies par les Boutiques, sous leur responsabilité. Z Fashion vérifie chaque nouvel article avant sa première mise en ligne et peut retirer à tout moment un article non conforme aux règles de la place de marché.',
        'Par défaut, les articles sont présentés du plus récent au plus ancien. Le Client peut les trier par prix et les filtrer (rayon, taille, boutique). Aucune Boutique ne paie pour être mieux classée.',
        'La disponibilité affichée correspond au stock déclaré par la Boutique ; les articles du panier ne sont réservés qu’au moment de la commande.',
      ] },
      { h: '3. Prix et livraison', p: [
        'Les prix sont indiqués en euros, toutes taxes comprises. La livraison en France métropolitaine est incluse : aucun frais n’est ajouté au moment du paiement.',
        'Lorsqu’une réduction de prix est annoncée, le prix de référence est le prix le plus bas pratiqué par la Boutique sur Z Fashion au cours des trente jours précédant la réduction.',
      ] },
      { h: '4. Commande', p: [
        'Pour commander, le Client se connecte à son compte (un code à usage unique est envoyé à son adresse e-mail), choisit une adresse de livraison en France métropolitaine et vérifie le récapitulatif : articles, Boutiques, prix et total.',
        'En cochant la case d’acceptation des présentes conditions puis en cliquant sur « Commander et payer », le Client passe une commande avec obligation de paiement. Les articles sont réservés pendant 30 minutes pour lui permettre de payer ; passé ce délai sans paiement, ils sont remis en vente.',
        'La vente est conclue dès la confirmation du paiement. Le Client reçoit alors une confirmation par e-mail et retrouve sa commande dans son compte. Z Fashion conserve la commande et la met à disposition du Client dans son compte.',
      ] },
      { h: '5. Paiement', p: [
        'Le paiement s’effectue en ligne par carte bancaire, au moment de la commande, sur un formulaire sécurisé de Stripe Payments Europe Limited. Une authentification forte (3-D Secure) peut être demandée par la banque du Client. Z Fashion ne reçoit ni ne conserve les données de carte.',
        'Le prix est encaissé par Z Fashion au nom et pour le compte des Boutiques, qui le reçoivent ensuite déduction faite de la commission de la place de marché.',
      ] },
      { h: '6. Livraison', p: [
        'Chaque Boutique prépare et expédie ses articles dans un colis séparé, à l’adresse indiquée, en France métropolitaine. Le délai d’expédition est indiqué au moment de la commande ; sauf indication contraire, l’article est livré au plus tard 30 jours après la commande.',
        'Le Client suit chaque colis dans son compte. Les risques de perte ou d’endommagement lui sont transférés lorsqu’il prend physiquement possession de l’article. Il est invité à vérifier le colis à la réception et à signaler tout dommage dans les meilleurs délais.',
        'En cas de retard, le Client peut demander à la Boutique, par l’intermédiaire de Z Fashion, de livrer dans un délai supplémentaire raisonnable ; à défaut de livraison dans ce délai, il peut résoudre le contrat et être remboursé de toutes les sommes versées au plus tard dans les 14 jours.',
      ] },
      { h: '7. Droit de rétractation', p: [
        'Le Client dispose d’un délai de 14 jours pour se rétracter, sans avoir à se justifier. Ce délai court à compter du jour où il reçoit l’article ou, pour une commande d’une même Boutique livrée en plusieurs fois, le dernier article.',
        'Pour l’exercer, le Client informe Z Fashion avant la fin du délai, depuis la page « Retours » de son compte, par e-mail à ' + E.email + ' ou au moyen du formulaire figurant en annexe, en indiquant la référence de la commande et les articles concernés. Z Fashion transmet la demande à la Boutique et envoie au Client l’adresse et les instructions de retour.',
        'Le Client renvoie les articles au plus tard 14 jours après avoir communiqué sa décision. Les frais de retour sont à sa charge, sauf si l’article est défectueux, non conforme ou ne correspond pas à la commande. Les articles doivent être renvoyés complets ; la responsabilité du Client peut être engagée en cas de dépréciation due à des manipulations autres que celles nécessaires pour en établir la nature, les caractéristiques et le bon fonctionnement (essayage normal).',
        'Le remboursement de toutes les sommes versées intervient au plus tard 14 jours après que la Boutique a été informée de la rétractation, par le même moyen de paiement. Il peut être différé jusqu’à la réception des articles ou jusqu’à ce que le Client ait fourni une preuve de leur expédition.',
        'Conformément à l’article L. 221-28 du code de la consommation, le droit de rétractation ne s’applique pas aux articles qui ont été descellés après la livraison et ne peuvent être renvoyés pour des raisons d’hygiène ou de protection de la santé (cosmétiques ouverts, par exemple), ni aux articles confectionnés selon les spécifications du Client ou nettement personnalisés.',
      ] },
      { h: '8. Garanties légales', p: [
        'Chaque Boutique, en sa qualité de vendeur, est tenue de la garantie légale de conformité et de la garantie des vices cachés. Le Client les met en œuvre en contactant Z Fashion, qui transmet sa demande à la Boutique concernée.',
      ] },
      { h: 'Garanties légales — rappel', box: true, p: GUARANTEE_BOX },
      { h: '9. Service client et réclamations', p: [
        'Pour toute question ou réclamation : ' + E.email + ', ou la page Contact. Z Fashion répond dans un délai de 48 heures ouvrées et, lorsque la demande concerne une Boutique, la lui transmet et suit sa réponse.',
      ] },
      { h: '10. Médiation', p: [
        'En cas de litige non résolu par le service client, le Client peut recourir gratuitement au médiateur de la consommation dont relève la Boutique concernée, dont les coordonnées lui sont communiquées sur simple demande, ou, pour les litiges relatifs au service de la place de marché, au médiateur de Z Fashion : ' + E.mediator + '. Le Client doit au préalable avoir adressé une réclamation écrite.',
      ] },
      { h: '11. Données personnelles', p: [
        'Les données nécessaires à la commande sont traitées par Z Fashion et transmises à la Boutique concernée pour la préparation et l’expédition, dans les conditions décrites dans la politique de confidentialité.',
      ] },
      { h: '12. Droit applicable', p: [
        'Les présentes conditions sont soumises au droit français, sans priver le Client de la protection que lui assurent les dispositions impératives de la loi de son pays de résidence. En cas de litige, le Client peut saisir la juridiction du lieu où il demeurait au moment de la conclusion du contrat ou de la survenance du fait dommageable.',
      ] },
      { h: 'Annexe — formulaire de rétractation', box: true, p: [
        'Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.',
        'À l’attention de Z Fashion, pour le compte de la Boutique mentionnée sur la commande — ' + E.address + ' — ' + E.email + ' :',
        'Je/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la vente du bien (*) ci-dessous :',
        'Commandé le (*) / reçu le (*) :',
        'Référence de la commande :',
        'Nom du (des) consommateur(s) :',
        'Adresse du (des) consommateur(s) :',
        'Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :',
        'Date :',
        '(*) Rayez la mention inutile.',
      ] },
    ],
  };

  DOCS.termsUse = {
    title: 'Conditions d’utilisation',
    sections: [
      { h: '1. Objet', p: [
        'Les présentes conditions encadrent l’utilisation du site zfashion.online. Les achats sont régis par les conditions générales de vente ; les relations avec les boutiques partenaires par les conditions générales Partner.',
      ] },
      { h: '2. Compte', p: [
        'Le compte est créé à la première connexion, avec une adresse e-mail : un code à usage unique est envoyé à chaque connexion, sans mot de passe. Le titulaire du compte veille à la confidentialité de sa messagerie. Le compte est personnel et réservé aux personnes majeures.',
        'Le titulaire peut demander la suppression de son compte à tout moment à ' + E.privacyEmail + ' ; les commandes sont conservées pendant la durée imposée par la loi.',
      ] },
      { h: '3. Usage du site', p: [
        'Il est interdit d’utiliser le site de manière frauduleuse, de tenter d’en perturber le fonctionnement, d’en extraire le contenu de manière automatisée ou de passer des commandes sans intention de payer. Z Fashion peut suspendre un compte en cas de manquement, après en avoir informé son titulaire et l’avoir mis en mesure de s’expliquer, sauf urgence.',
      ] },
      { h: '4. Contrôle des articles', p: [
        'Z Fashion vérifie chaque nouvel article avant sa première mise en ligne et peut retirer à tout moment un article contrefait, dangereux, illicite, trompeur ou contraire aux règles de la place de marché. La Boutique concernée est informée de la raison du retrait.',
      ] },
      { h: '5. Signalement', p: [
        'Tout contenu ou article illicite peut être signalé à ' + E.email + ' (adresse de la page, motif, coordonnées). Chaque signalement reçoit une réponse motivée.',
      ] },
      { h: '6. Responsabilité', p: [
        'Z Fashion met en œuvre les moyens raisonnables pour assurer l’accès au site, sans pouvoir garantir une disponibilité permanente. Les fiches produits sont établies par les Boutiques sous leur responsabilité.',
      ] },
      { h: '7. Modifications et droit applicable', p: [
        'Ces conditions peuvent évoluer ; la version applicable est celle publiée sur le site lors de l’utilisation. Elles sont soumises au droit français.',
      ] },
    ],
  };

  DOCS.privacy = {
    title: 'Politique de confidentialité',
    sections: [
      { h: 'Responsable du traitement', p: [
        E.company + ', ' + E.address + '. Contact pour toute question relative à vos données : ' + E.privacyEmail + '.',
      ] },
      { h: 'Données traitées et finalités', ul: [
        'Compte : adresse e-mail et date de connexion — pour vous identifier (exécution du contrat).',
        'Commandes : articles, montants, adresse de livraison, nom du destinataire, suivi des colis, retours — pour exécuter la vente et le service client (exécution du contrat) et pour la comptabilité (obligation légale).',
        'Paiement : traité par Stripe ; Z Fashion reçoit uniquement le statut du paiement, sans numéro de carte — pour encaisser le prix (exécution du contrat) et prévenir la fraude (intérêt légitime).',
        'Échanges avec le service client — pour répondre à vos demandes (exécution du contrat, intérêt légitime).',
        'Données techniques (journaux de connexion, adresse IP) — pour la sécurité du service (intérêt légitime).',
        'Panier, favoris et langue : enregistrés dans votre navigateur ; les favoris sont aussi rattachés à votre compte lorsque vous êtes connecté.',
      ] },
      { h: 'Destinataires', ul: [
        'La Boutique qui vend l’article : nom du destinataire, adresse de livraison, articles commandés — uniquement pour préparer, expédier et gérer les retours. Elle ne peut pas les utiliser à d’autres fins.',
        'Stripe (paiement), Supabase (base de données, comptes, photos — données hébergées en Irlande), Vercel (hébergement du site), Resend (envoi des e-mails), agissant comme sous-traitants de Z Fashion.',
        'Les autorités, lorsque la loi l’impose.',
      ] },
      { h: 'Transferts hors de l’Union européenne', p: [
        'Certains prestataires (Vercel, Resend, et leurs sous-traitants) sont établis aux États-Unis. Ces transferts sont encadrés par le cadre de protection des données UE–États-Unis lorsque le prestataire y adhère, ou par les clauses contractuelles types de la Commission européenne.',
      ] },
      { h: 'Durées de conservation', ul: [
        'Compte : jusqu’à sa suppression, ou 3 ans après la dernière connexion.',
        'Commandes et factures : 10 ans (obligations comptables).',
        'Adresses de livraison : tant que le compte existe.',
        'Journaux techniques : 12 mois.',
      ] },
      { h: 'Vos droits', p: [
        'Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, de portabilité et d’opposition, ainsi que du droit de définir des directives sur le sort de vos données après votre décès. Écrivez à ' + E.privacyEmail + ' ; une réponse vous est apportée dans un délai d’un mois.',
        'Vous pouvez introduire une réclamation auprès de la CNIL (cnil.fr).',
        'Z Fashion n’envoie pas de prospection commerciale et ne vend pas vos données.',
      ] },
      { h: 'Données des boutiques partenaires', p: [
        'Pour l’adhésion et la gestion des boutiques, Z Fashion traite les données de l’entreprise et de son représentant (identité, coordonnées, SIRET, compte de versement auprès de Stripe) pour exécuter le contrat Partner, respecter ses obligations légales (notamment fiscales) et prévenir la fraude. Ces données sont conservées pendant la relation contractuelle puis 10 ans pour les pièces comptables.',
      ] },
    ],
  };

  DOCS.cookies = {
    title: 'Cookies et stockage local',
    sections: [
      { h: 'Ce que le site utilise', p: [
        'Z Fashion n’utilise aucun cookie de mesure d’audience, de publicité ou de réseaux sociaux. Le site n’enregistre sur votre appareil que ce qui est strictement nécessaire au service que vous demandez ; ces éléments ne nécessitent pas votre consentement.',
      ] },
      { h: 'Détail', ul: [
        'Session de connexion (stockage local du navigateur) : vous garder connecté à votre compte.',
        'Panier, favoris, langue, étape de commande (stockage local et de session) : conserver vos choix.',
        'Stripe, uniquement sur la page de paiement : cookies de prévention de la fraude, nécessaires pour sécuriser le paiement (__stripe_mid, __stripe_sid).',
      ] },
      { h: 'Les supprimer', p: [
        'Vous pouvez les effacer à tout moment depuis les réglages de votre navigateur ; vous serez alors déconnecté et votre panier sera vidé.',
      ] },
    ],
  };

  DOCS.consent = {
    title: 'Consentement',
    sections: [
      { h: 'Aucun traceur soumis à consentement', p: [
        'Z Fashion n’utilise aucun cookie ni traceur de mesure d’audience ou de publicité : il n’y a donc rien à accepter ni à refuser. Seuls les éléments strictement nécessaires au fonctionnement du site sont utilisés ; ils sont décrits sur la page Cookies.',
        'Si cela devait changer, votre accord vous serait demandé avant tout dépôt, et vous pourriez le retirer à tout moment sur cette page.',
      ] },
    ],
  };

  DOCS.partnerTerms = {
    title: 'Conditions générales Partner',
    version: VERSION.partner,
    sections: [
      { h: '1. Objet', p: [
        'Les présentes conditions régissent la relation entre ' + E.company + ' (« Z Fashion ») et toute entreprise qui vend ses articles sur la place de marché Z Fashion (le « Partner » ou la « Boutique »). Elles sont acceptées lors de la demande d’adhésion. Version ' + VERSION.partner + ', mise à jour le ' + VERSION.updated + '.',
      ] },
      { h: '2. Adhésion', p: [
        'Le Partner est une entreprise immatriculée, qui agit à des fins professionnelles. Sa demande d’adhésion (identité, SIRET, catégories vendues, coordonnées) est examinée par Z Fashion, qui peut demander des justificatifs et refuser une demande par une décision motivée. La Boutique est activée après approbation ; ses articles peuvent alors être mis en ligne.',
      ] },
      { h: '3. Services fournis', ul: [
        'Un espace Partner pour gérer le catalogue, les photos, les prix, le stock, la vitrine (« Corner »), les commandes et les versements.',
        'La présentation des articles aux clients de zfashion.online et l’encaissement du prix.',
        'Le service client de premier niveau et la transmission des demandes des clients.',
        'Le versement hebdomadaire des ventes clôturées.',
      ] },
      { h: '4. Engagements du Partner', ul: [
        'Ne vendre que des articles authentiques, neufs sauf indication contraire, conformes à la réglementation (sécurité des produits, étiquetage, composition) et qu’il est en droit de vendre ; aucune contrefaçon.',
        'Décrire les articles de façon exacte et loyale (photos réelles, composition, taille, état) et indiquer des prix TTC.',
        'Tenir le stock à jour afin de ne pas vendre un article indisponible.',
        'Expédier chaque commande payée dans un délai de 3 jours ouvrés, avec suivi, et renseigner le suivi dans l’espace Partner.',
        'Assumer, en tant que vendeur, le droit de rétractation et les garanties légales dus au client (accepter les retours dans les 14 jours, rembourser via Z Fashion, traiter les demandes de garantie).',
        'Répondre aux demandes transmises par Z Fashion dans un délai de 2 jours ouvrés.',
        'Pour les articles destinés aux enfants, détenir les certifications de sécurité déclarées.',
        'Établir la facture de vente au client lorsque la loi l’exige, et respecter ses obligations fiscales et sociales.',
      ] },
      { h: '5. Contrôle des articles', p: [
        'Chaque nouvel article est vérifié par Z Fashion avant sa première mise en ligne. Z Fashion peut refuser ou retirer à tout moment un article contrefait, dangereux, illicite, mal décrit ou contraire aux présentes conditions ; le Partner est informé du motif et peut corriger l’article puis demander un nouvel examen depuis son espace.',
      ] },
      { h: '6. Classement des articles', p: [
        'Par défaut, les articles sont présentés du plus récent au plus ancien ; le client peut les trier par prix et les filtrer par rayon, taille et boutique. Un article indisponible n’est pas proposé à l’achat. Aucun Partner ne peut payer pour être mieux classé.',
      ] },
      { h: '7. Conditions financières', ul: [
        'Abonnement mensuel, hors taxes, selon le nombre de catégories vendues : 1 catégorie, 39 € ; 2 catégories, 49 € ; 3 catégories ou plus, 59 €. Le premier mois suivant l’activation est offert. L’abonnement est facturé chaque mois à l’avance et réglé par carte bancaire ou prélèvement SEPA, sur une page sécurisée de Stripe.',
        'Commission par ticket (la partie d’une commande qui revient au Partner), calculée sur le montant TTC payé par le client pour ses articles : jusqu’à 100 €, 10 % ; de 100,01 € à 200 €, 8 % ; au-delà de 200 €, 6 %. Les taux s’entendent hors taxes ; la TVA applicable s’y ajoute et figure sur la facture de commission.',
        'Les frais de paiement Stripe sont pris en charge par Z Fashion.',
        'Versements : chaque semaine, Z Fashion verse au Partner ses ventes clôturées — articles livrés depuis plus de 14 jours sans retour en cours — déduction faite de la commission calculée sur ce que le client a conservé. Les versements sont effectués sur le compte de paiement Stripe du Partner, qu’il ouvre et vérifie depuis son espace.',
        'En cas de remboursement d’un client après versement, le montant correspondant est déduit des versements suivants.',
        'En cas de défaut de paiement de l’abonnement, Z Fashion relance le Partner ; à défaut de régularisation sous 15 jours, la Boutique peut être suspendue jusqu’au paiement.',
      ] },
      { h: '8. Encaissement pour le compte du Partner', p: [
        'Le Partner donne mandat à Z Fashion d’encaisser en son nom et pour son compte le prix payé par les clients, par l’intermédiaire de Stripe, et de procéder aux remboursements dus aux clients. Le paiement du client à Z Fashion vaut paiement au Partner.',
      ] },
      { h: '9. Durée, suspension et résiliation', ul: [
        'Le contrat est conclu pour une durée indéterminée.',
        'Le Partner peut le résilier à tout moment depuis son espace ou par e-mail ; la résiliation prend effet à la fin du mois en cours. Les commandes en cours sont honorées.',
        'Z Fashion peut le résilier en respectant un préavis de 30 jours, notifié avec ses motifs.',
        'En cas de manquement grave (contrefaçon, produit dangereux, fraude, manquements répétés aux engagements), ou lorsque la loi l’impose, Z Fashion peut suspendre ou résilier sans préavis, par une décision motivée notifiée au Partner, qui peut la contester par le système de réclamation.',
      ] },
      { h: '10. Données personnelles', p: [
        'Chaque partie est responsable des traitements qu’elle effectue. Le Partner n’utilise les données des clients (nom, adresse, articles) que pour préparer, expédier et gérer les retours de leurs commandes ; il ne les utilise pas à des fins de prospection et les protège par des mesures de sécurité appropriées. Il les supprime lorsqu’elles ne sont plus nécessaires, sous réserve de ses obligations légales.',
      ] },
      { h: '11. Contenus', p: [
        'Le Partner garantit disposer des droits sur les photos, textes et logos qu’il publie et concède à Z Fashion une licence gratuite, pour la durée du contrat, pour les afficher sur la place de marché et dans sa communication sur celle-ci.',
      ] },
      { h: '12. Obligations fiscales et sociales', p: [
        'Les revenus tirés des ventes sur Z Fashion sont soumis aux obligations fiscales et sociales du Partner. Des informations sont disponibles sur impots.gouv.fr et urssaf.fr. Conformément aux articles 242 bis et 1649 ter A du code général des impôts, Z Fashion adresse chaque année au Partner un récapitulatif des montants perçus et déclare ces informations à l’administration fiscale ; le Partner lui fournit les informations nécessaires.',
      ] },
      { h: '13. Réclamations et médiation', p: [
        'Le Partner peut adresser toute réclamation (décision de contrôle, suspension, versement, fonctionnement du service) à ' + E.partnerEmail + '. Z Fashion en accuse réception, l’examine et répond de façon motivée dans un délai de 15 jours. Les parties peuvent recourir à une médiation avant toute action en justice.',
      ] },
      { h: '14. Responsabilité', p: [
        'Le Partner est seul responsable des articles qu’il vend, de leur description, de leur conformité et de leur expédition. Z Fashion met en œuvre les moyens raisonnables pour assurer le fonctionnement de la place de marché ; sa responsabilité est limitée aux dommages directs et, sauf faute lourde, au montant des abonnements et commissions perçus sur les 12 derniers mois.',
      ] },
      { h: '15. Modifications', p: [
        'Z Fashion informe le Partner de toute modification des présentes conditions au moins 15 jours avant son entrée en vigueur ; le Partner qui ne l’accepte pas peut résilier le contrat avant cette date.',
      ] },
      { h: '16. Droit applicable', p: [
        'Les présentes conditions sont soumises au droit français. Tout litige relève, après tentative de règlement amiable, de la compétence du tribunal de commerce de ' + E.court + '.',
      ] },
    ],
  };

  // ---------- service pages (same rules, practical)

  DOCS.delivery = {
    title: 'Livraisons',
    sections: [
      { h: 'Livraison incluse', p: ['La livraison en France métropolitaine est incluse dans le prix : rien n’est ajouté au moment du paiement.'] },
      { h: 'Un colis par boutique', p: ['Chaque boutique prépare et expédie ses articles elle-même, dans un délai de 3 jours ouvrés après le paiement. Une commande passée auprès de plusieurs boutiques arrive donc en plusieurs colis.'] },
      { h: 'Suivi', p: ['Vous suivez chaque colis dans votre compte, rubrique « Mes commandes ».'] },
      { h: 'Zone de livraison', p: ['Z Fashion livre pour l’instant en France métropolitaine uniquement.'] },
      { h: 'Un problème ?', p: ['Colis en retard, endommagé ou incomplet : écrivez-nous à ' + E.email + ' avec la référence de la commande.'] },
    ],
  };

  DOCS.refunds = {
    title: 'Retours et remboursements',
    sections: [
      { h: '14 jours pour changer d’avis', p: ['Vous disposez de 14 jours à compter de la réception de votre colis pour retourner un article, sans avoir à vous justifier.'] },
      { h: 'Comment faire', ul: [
        'Indiquez-nous la référence de la commande et les articles concernés, depuis la page « Retours » de votre compte ou à ' + E.email + '.',
        'Nous vous transmettons l’adresse et les instructions de la boutique qui a expédié l’article.',
        'Renvoyez l’article dans les 14 jours, complet et dans son état d’origine (essayage normal).',
      ] },
      { h: 'Frais de retour', p: ['Les frais de retour sont à votre charge, sauf si l’article est défectueux, non conforme ou ne correspond pas à votre commande.'] },
      { h: 'Remboursement', p: ['Vous êtes remboursé sur votre carte au plus tard 14 jours après votre demande ; le remboursement peut attendre la réception de l’article par la boutique ou la preuve de son expédition.'] },
      { h: 'Exceptions', p: ['Les cosmétiques ouverts et les articles descellés qui ne peuvent être renvoyés pour des raisons d’hygiène ne peuvent pas être retournés, ni les articles personnalisés.'] },
      { h: 'Article défectueux', p: ['Les garanties légales de conformité (2 ans) et des vices cachés s’appliquent : écrivez-nous, nous transmettons votre demande à la boutique. Le détail figure dans les conditions générales de vente.'] },
    ],
  };

  DOCS.help = {
    title: 'Aide',
    faq: [
      ['Qui vend les articles ?', 'Des boutiques de mode indépendantes. Le nom de la boutique figure sur chaque article, dans le panier et sur votre confirmation de commande. Z Fashion gère la place de marché, le paiement et le service client.'],
      ['Puis-je commander auprès de plusieurs boutiques ?', 'Oui, en un seul paiement. Chaque boutique expédie son propre colis.'],
      ['Combien coûte la livraison ?', 'Rien : la livraison en France métropolitaine est incluse.'],
      ['Comment payer ?', 'Par carte bancaire, sur un formulaire sécurisé de Stripe. Z Fashion ne voit jamais vos données de carte.'],
      ['Comment me connecter ?', 'Avec votre adresse e-mail : vous recevez un code à 6 chiffres. Votre compte est créé à la première connexion, sans mot de passe.'],
      ['Comment suivre ma commande ?', 'Dans votre compte, rubrique « Mes commandes » : chaque colis y est suivi, boutique par boutique.'],
      ['Comment retourner un article ?', 'Vous avez 14 jours après réception. Écrivez-nous avec la référence de la commande : nous vous envoyons les instructions de la boutique.'],
      ['Vous livrez hors de France ?', 'Pas pour l’instant : uniquement en France métropolitaine.'],
      ['Comment vous contacter ?', 'À ' + E.email + ' ou depuis la page Contact. Nous répondons sous 48 heures ouvrées.'],
    ],
    sections: [],
  };

  // Shown above the French text when the site is in another language.
  var FRENCH_ONLY = {
    pt: 'Este documento está redigido em francês, que é a versão que faz fé.',
    en: 'This document is written in French, which is the binding version.',
    es: 'Este documento está redactado en francés, que es la versión que da fe.',
    it: 'Questo documento è redatto in francese, che è la versione facente fede.',
    de: 'Dieses Dokument ist auf Französisch verfasst; die französische Fassung ist maßgeblich.',
  };

  var PLACEHOLDER = /\{\{([^}]+)\}\}/g;

  function allText() {
    var out = [];
    Object.keys(DOCS).forEach(function (id) {
      var d = DOCS[id];
      out.push(d.title);
      (d.sections || []).forEach(function (s) { out.push(s.h); (s.p || []).concat(s.ul || []).forEach(function (x) { out.push(x); }); });
      (d.faq || []).forEach(function (qa) { out.push(qa[0], qa[1]); });
    });
    return out.join('\n');
  }

  function placeholders() {
    var found = {}; var m; var text = allText();
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(text))) found[m[1]] = true;
    return Object.keys(found);
  }

  var api = { VERSION: VERSION, ENTITY: E, DOCS: DOCS, FRENCH_ONLY: FRENCH_ONLY, PLACEHOLDER: PLACEHOLDER, placeholders: placeholders };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ZFashionLegal = api;
})(typeof window !== 'undefined' ? window : null);
