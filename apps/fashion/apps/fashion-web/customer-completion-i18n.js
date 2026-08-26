(() => {
  const AUTH = window.ZFashionCustomerRoutes;
  if (!AUTH) return;

  const route = AUTH.routes.find(r => r.path === location.pathname || (r.pattern && new RegExp(r.pattern).test(location.pathname)));
  if (!route || !['service','legal'].includes(route.group)) return;

  const locale = () => document.documentElement.dataset.locale || 'fr';
  const title = id => AUTH.titles[locale()]?.[id] || AUTH.titles.fr[id] || id;

  const SERVICE = {
    es:{
      lead:'Información de servicio preparada para el lanzamiento France-first.',
      deliveryTitle:'Entregas Z Fashion', returnsTitle:'Devoluciones y reembolsos', helpTitle:'¿Cómo podemos ayudarte?', contactTitle:'Contactar Z Fashion', send:'Enviar en Preview', sent:'Mensaje Preview guardado localmente. No se ha enviado nada.',
      delivery:[['Entrega estándar','2–4 días laborables en Francia metropolitana en la simulación de lanzamiento.'],['Entrega exprés','Opción acelerada mostrada en checkout cuando la boutique la ofrece.'],['Pedido multi-boutiques','Cada boutique puede generar su propio paquete, seguimiento y ventana de entrega.']],
      returns:[['01 · Declarar','Selecciona el pedido y los artículos correspondientes desde la cuenta de cliente.'],['02 · Preparar','Las instrucciones y la etiqueta permanecen asociadas a la boutique expedidora.'],['03 · Reembolsar','El reembolso real solo se iniciará tras validar la devolución según las condiciones aplicables.']],
      faq:[['¿Puedo comprar en varias boutiques?','Sí. El carrito Z Fashion reúne varias boutiques manteniendo el fulfilment por cada socio.'],['¿Cómo sigo mi pedido?','La cuenta de cliente muestra el seguimiento por paquete y por boutique.'],['¿Puedo devolver un artículo?','Sí, sujeto a las condiciones aplicables al producto, mercado y boutique.'],['¿Qué métodos de pago habrá?','La selección final aparecerá en checkout después de activar los proveedores de pago.']]
    },
    it:{
      lead:'Informazioni di servizio predisposte per il lancio France-first.',
      deliveryTitle:'Consegne Z Fashion', returnsTitle:'Resi e rimborsi', helpTitle:'Come possiamo aiutarti?', contactTitle:'Contatta Z Fashion', send:'Invia in Preview', sent:'Messaggio Preview salvato localmente. Nessun invio reale.',
      delivery:[['Consegna standard','2–4 giorni lavorativi nella Francia metropolitana nella simulazione di lancio.'],['Consegna express','Opzione accelerata mostrata al checkout quando disponibile presso la boutique.'],['Ordine multi-boutique','Ogni boutique può generare il proprio pacco, tracking e finestra di consegna.']],
      returns:[['01 · Dichiara','Seleziona l’ordine e gli articoli interessati nell’area cliente.'],['02 · Prepara','Istruzioni ed etichetta restano associate alla boutique che ha spedito.'],['03 · Rimborso','Il rimborso reale sarà avviato solo dopo la convalida del reso secondo le condizioni applicabili.']],
      faq:[['Posso acquistare da più boutique?','Sì. Il carrello Z Fashion riunisce più boutique preservando il fulfilment di ciascun partner.'],['Come posso seguire il mio ordine?','L’account cliente mostra il tracking per pacco e per boutique.'],['Posso restituire un articolo?','Sì, in base alle condizioni applicabili al prodotto, mercato e boutique.'],['Quali metodi di pagamento saranno disponibili?','La selezione finale apparirà al checkout dopo l’attivazione dei provider di pagamento.']]
    },
    de:{
      lead:'Serviceinformationen für den France-first Launch vorbereitet.',
      deliveryTitle:'Z Fashion Lieferung', returnsTitle:'Rücksendungen & Erstattungen', helpTitle:'Wie können wir helfen?', contactTitle:'Z Fashion kontaktieren', send:'In Preview senden', sent:'Preview-Nachricht lokal gespeichert. Es wurde nichts gesendet.',
      delivery:[['Standardlieferung','2–4 Werktage im französischen Festland in der Launch-Simulation.'],['Expresslieferung','Beschleunigte Option im Checkout, wenn die Boutique sie anbietet.'],['Multi-Boutique-Bestellung','Jede Boutique kann ein eigenes Paket, Tracking und Lieferfenster erzeugen.']],
      returns:[['01 · Anmelden','Bestellung und betroffene Artikel im Kundenkonto auswählen.'],['02 · Vorbereiten','Anweisungen und Etikett bleiben der versendenden Boutique zugeordnet.'],['03 · Erstatten','Eine echte Erstattung wird erst nach Prüfung der Rücksendung gemäß den geltenden Bedingungen ausgelöst.']],
      faq:[['Kann ich bei mehreren Boutiquen einkaufen?','Ja. Der Z Fashion Warenkorb bündelt mehrere Boutiquen und erhält das Fulfilment je Partner.'],['Wie verfolge ich meine Bestellung?','Das Kundenkonto zeigt das Tracking je Paket und Boutique.'],['Kann ich einen Artikel zurückgeben?','Ja, vorbehaltlich der Bedingungen für Produkt, Markt und Boutique.'],['Welche Zahlungsmethoden werden angeboten?','Die endgültige Auswahl erscheint im Checkout nach Aktivierung der Zahlungsanbieter.']]
    }
  };

  const LEGAL = {
    es:{
      preview:'Versión Preview — no contractual. Validación jurídica obligatoria antes de Producción.',
      consentIntro:'Estos ajustes se guardan únicamente en este navegador Preview y no activan ningún rastreador.',
      essential:'Esenciales', analytics:'Medición de audiencia', marketing:'Personalización de marketing', always:'Siempre activos', optional:'Opcional', save:'Guardar preferencias Preview', saved:'Preferencias Preview guardadas localmente.',
      legalNotice:[['Editor','Z Fashion — marca del ecosistema ZOS. Los datos de entidad jurídica, domicilio, registro y responsable de publicación se completarán antes de Producción.'],['Alojamiento','La información de alojamiento se confirmará en la versión contractual de lanzamiento.'],['Contacto','Los datos legales y de soporte se consolidarán antes del lanzamiento comercial.']],
      termsSale:[['Objeto','Estructura de las condiciones que regulan la venta multi-boutiques, formación del contrato, precios y confirmación del pedido.'],['Pago','Métodos, autorizaciones, capturas y reembolsos se describirán según los proveedores efectivamente activados.'],['Entrega y devoluciones','Obligaciones, plazos, desistimiento, excepciones y reembolsos se alinearán con la normativa aplicable y el modelo final de socios.']],
      termsUse:[['Acceso al servicio','Condiciones de acceso, disponibilidad del servicio y conducta esperada de los usuarios.'],['Cuenta','Reglas sobre creación, seguridad y uso de la cuenta de cliente.'],['Propiedad intelectual','Protección de marcas, contenidos, imágenes, datos e interfaces de Z Fashion y sus socios.']],
      privacy:[['Datos tratados','Identidad, contacto, preferencias, actividad de cuenta, pedidos y datos necesarios para la relación con el cliente según los servicios activados.'],['Finalidades y bases legales','Ejecución contractual, obligaciones legales, intereses legítimos y consentimiento según cada tratamiento.'],['Derechos','Acceso, rectificación, supresión, limitación, oposición, portabilidad y retirada del consentimiento conforme al RGPD.']],
      cookies:[['Esenciales','Funciones estrictamente necesarias para el servicio, seguridad y preferencias solicitadas.'],['Medición de audiencia','Activación únicamente según el mecanismo de consentimiento elegido para el lanzamiento.'],['Marketing','No se activará ningún rastreador de marketing antes del consentimiento cuando sea obligatorio.']]
    },
    it:{
      preview:'Versione Preview — non contrattuale. Validazione legale obbligatoria prima della Produzione.',
      consentIntro:'Queste preferenze sono memorizzate solo in questo browser Preview e non attivano alcun tracker.',
      essential:'Essenziali', analytics:'Misurazione audience', marketing:'Personalizzazione marketing', always:'Sempre attivi', optional:'Opzionale', save:'Salva preferenze Preview', saved:'Preferenze Preview salvate localmente.',
      legalNotice:[['Editore','Z Fashion — marchio dell’ecosistema ZOS. Entità giuridica, sede, registrazione e responsabile editoriale saranno completati prima della Produzione.'],['Hosting','Le informazioni di hosting saranno confermate nella versione contrattuale di lancio.'],['Contatti','I riferimenti legali e di assistenza saranno finalizzati prima del lancio commerciale.']],
      termsSale:[['Oggetto','Struttura delle condizioni che regolano vendita multi-boutique, formazione del contratto, prezzi e conferma dell’ordine.'],['Pagamento','Metodi, autorizzazioni, acquisizioni e rimborsi saranno descritti in base ai provider effettivamente attivati.'],['Consegna e resi','Obblighi, tempi, diritto di recesso, eccezioni e rimborsi saranno allineati alla normativa applicabile e al modello partner finale.']],
      termsUse:[['Accesso al servizio','Condizioni di accesso, disponibilità del servizio e comportamento atteso dagli utenti.'],['Account','Regole relative a creazione, sicurezza e utilizzo dell’account cliente.'],['Proprietà intellettuale','Protezione di marchi, contenuti, immagini, dati e interfacce Z Fashion e partner.']],
      privacy:[['Dati trattati','Identità, contatti, preferenze, attività account, ordini e dati necessari alla relazione cliente secondo i servizi attivati.'],['Finalità e basi giuridiche','Esecuzione del contratto, obblighi legali, interessi legittimi e consenso secondo il trattamento.'],['Diritti','Accesso, rettifica, cancellazione, limitazione, opposizione, portabilità e revoca del consenso ai sensi del GDPR.']],
      cookies:[['Essenziali','Funzioni strettamente necessarie a servizio, sicurezza e preferenze richieste.'],['Misurazione audience','Attivazione solo secondo il meccanismo di consenso scelto per il lancio.'],['Marketing','Nessun tracker marketing sarà attivato prima del consenso quando richiesto.']]
    },
    de:{
      preview:'Preview-Version — nicht verbindlich. Rechtliche Prüfung vor Production erforderlich.',
      consentIntro:'Diese Einstellungen werden nur in diesem Preview-Browser gespeichert und aktivieren keine Tracker.',
      essential:'Notwendig', analytics:'Reichweitenmessung', marketing:'Marketing-Personalisierung', always:'Immer aktiv', optional:'Optional', save:'Preview-Einstellungen speichern', saved:'Preview-Einstellungen lokal gespeichert.',
      legalNotice:[['Herausgeber','Z Fashion — eine Marke des ZOS-Ökosystems. Rechtsträger, Sitz, Registrierung und redaktionelle Verantwortung werden vor Production ergänzt.'],['Hosting','Hosting-Angaben werden in der vertraglichen Launch-Version bestätigt.'],['Kontakt','Rechtliche und Support-Kontaktdaten werden vor dem kommerziellen Start finalisiert.']],
      termsSale:[['Gegenstand','Struktur der Bedingungen für Multi-Boutique-Verkauf, Vertragsschluss, Preise und Bestellbestätigung.'],['Zahlung','Methoden, Autorisierungen, Belastungen und Erstattungen richten sich nach den tatsächlich aktivierten Anbietern.'],['Lieferung und Rückgabe','Pflichten, Fristen, Widerrufsrechte, Ausnahmen und Erstattungen werden an geltendes Recht und das finale Partnermodell angepasst.']],
      termsUse:[['Dienstzugang','Bedingungen für Zugang, Verfügbarkeit und erwartetes Nutzerverhalten.'],['Konto','Regeln für Erstellung, Sicherheit und Nutzung des Kundenkontos.'],['Geistiges Eigentum','Schutz von Marken, Inhalten, Bildern, Daten und Interfaces von Z Fashion und Partnern.']],
      privacy:[['Verarbeitete Daten','Identität, Kontaktdaten, Präferenzen, Kontoaktivität, Bestellungen und erforderliche Kundendaten gemäß aktivierten Diensten.'],['Zwecke und Rechtsgrundlagen','Vertragserfüllung, gesetzliche Pflichten, berechtigte Interessen und Einwilligung je Verarbeitung.'],['Rechte','Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Portabilität und Widerruf der Einwilligung nach DSGVO.']],
      cookies:[['Notwendig','Funktionen, die für Dienst, Sicherheit und angeforderte Präferenzen zwingend erforderlich sind.'],['Reichweitenmessung','Aktivierung nur gemäß dem für den Launch gewählten Einwilligungsmechanismus.'],['Marketing','Marketing-Tracker werden nicht vor erforderlicher Einwilligung aktiviert.']]
    }
  };

  const consentKey='zfashion_preview_consent_v1';
  const service = () => SERVICE[locale()];
  const legal = () => LEGAL[locale()];
  const content = () => document.getElementById('pageContent');

  const renderService = data => {
    if (route.id==='delivery') return `<div class="service-intro"><h2>${data.deliveryTitle}</h2><p>${data.lead}</p></div><div class="service-card-grid">${data.delivery.map(([h,p],i)=>`<article><span>0${i+1}</span><h3>${h}</h3><p>${p}</p></article>`).join('')}</div><div class="service-banner"><strong>France-first</strong><span>Les délais, tarifs et transporteurs finaux seront contractualisés avant Production.</span></div>`;
    if (route.id==='refunds') return `<div class="service-intro"><h2>${data.returnsTitle}</h2><p>${data.lead}</p></div><div class="return-steps">${data.returns.map(([h,p])=>`<article><h3>${h}</h3><p>${p}</p></article>`).join('')}</div><div class="service-policy"><h3>Preview</h3><p>${data.lead}</p></div>`;
    if (route.id==='help') return `<div class="service-intro"><h2>${data.helpTitle}</h2><p>${data.lead}</p></div><div class="faq-list">${data.faq.map(([q,a],i)=>`<details ${i===0?'open':''}><summary>${q}<span>+</span></summary><p>${a}</p></details>`).join('')}</div><div class="service-contact-cta"><h3>${data.contactTitle}</h3><a class="route-button secondary" href="/contact">${data.contactTitle} →</a></div>`;
    return `<div class="service-intro"><h2>${data.contactTitle}</h2><p>${data.lead}</p></div><form class="completion-form contact-form" id="localizedPreviewContact"><div class="completion-two"><label>Nome<input name="firstName" value="Camille"></label><label>Cognome<input name="lastName" value="Martin"></label></div><label>Email<input name="email" type="email" value="camille.preview@example.com"></label><label>Message<textarea name="message" placeholder="Z Fashion…"></textarea></label><button class="route-button" type="submit">${data.send}</button><p class="completion-note" id="localizedContactStatus"></p></form>`;
  };

  const renderLegal = data => {
    if(route.id==='consent'){
      let pref={analytics:false,marketing:false}; try{pref=JSON.parse(localStorage.getItem(consentKey)||JSON.stringify(pref))}catch(_){}
      return `<div class="legal-warning">${data.preview}</div><div class="consent-panel"><div><h2>${title('consent')}</h2><p>${data.consentIntro}</p></div><form id="localizedConsent"><label><span><strong>${data.essential}</strong><small>${data.always}</small></span><input type="checkbox" checked disabled></label><label><span><strong>${data.analytics}</strong><small>${data.optional}</small></span><input name="analytics" type="checkbox" ${pref.analytics?'checked':''}></label><label><span><strong>${data.marketing}</strong><small>${data.optional}</small></span><input name="marketing" type="checkbox" ${pref.marketing?'checked':''}></label><button class="route-button" type="submit">${data.save}</button><p class="completion-note" id="localizedConsentStatus"></p></form></div>`;
    }
    const sections=data[route.id]||[];
    return `<div class="legal-warning">${data.preview}</div><article class="legal-document"><aside><strong>Z FASHION</strong><span>${title(route.id)}</span><a href="/consentement">${title('consent')} →</a></aside><div>${sections.map(([h,p])=>`<section><h2>${h}</h2><p>${p}</p></section>`).join('')}<section><h2>Validation</h2><p>${data.preview}</p></section></div></article>`;
  };

  const wire = data => {
    document.getElementById('localizedPreviewContact')?.addEventListener('submit',e=>{e.preventDefault();document.getElementById('localizedContactStatus').textContent=data.sent});
    document.getElementById('localizedConsent')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const pref={analytics:fd.get('analytics')==='on',marketing:fd.get('marketing')==='on'};try{localStorage.setItem(consentKey,JSON.stringify(pref))}catch(_){}document.getElementById('localizedConsentStatus').textContent=data.saved});
  };

  const render = () => {
    const target=content(); if(!target) return;
    const lang=locale(); if(!['es','it','de'].includes(lang)) return;
    const data=route.group==='service'?service():legal();
    target.innerHTML=route.group==='service'?renderService(data):renderLegal(data);
    wire(data);
  };

  document.getElementById('localeSelect')?.addEventListener('change',()=>queueMicrotask(render));
  queueMicrotask(render);
  window.Z_FASHION_COMPLETION_I18N = 'SIX_LOCALE_DETAIL_PASS';
})();
