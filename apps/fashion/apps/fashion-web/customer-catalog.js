(() => {
  const partners = [
    {id:'atelier-27',name:'Atelier 27',city:'Porto',country:'Portugal',image:'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=84',specialty:{fr:'Mode contemporaine & sport',pt:'Moda contemporânea & desporto',en:'Contemporary fashion & sport',es:'Moda contemporánea & deporte',it:'Moda contemporanea & sport',de:'Zeitgenössische Mode & Sport'}},
    {id:'maison-nord',name:'Maison Nord',city:'Paris',country:'France',image:'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?auto=format&fit=crop&w=1200&q=84',specialty:{fr:'Essentiels contemporains',pt:'Essenciais contemporâneos',en:'Contemporary essentials',es:'Esenciales contemporáneos',it:'Essenziali contemporanei',de:'Zeitgenössische Essentials'}},
    {id:'linea-44',name:'Linea 44',city:'Milan',country:'Italia',image:'https://images.unsplash.com/photo-1555529771-35a38d0d73c6?auto=format&fit=crop&w=1200&q=84',specialty:{fr:'Cuir, accessoires & beauté',pt:'Pele, acessórios & beleza',en:'Leather, accessories & beauty',es:'Piel, accesorios & belleza',it:'Pelle, accessori & beauty',de:'Leder, Accessoires & Beauty'}}
  ];

  const products = [
    {
      id:'p1',slug:'blazer-aster-structure',brand:'Aster Studio',category:'women',price:289,partnerId:'atelier-27',sizes:['34','36','38','40'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Blazer structuré en laine',description:'Blazer à la construction épurée, épaule souple et laine froide. Une pièce de transition pensée pour le quotidien.'},
        pt:{name:'Blazer estruturado em lã',description:'Blazer de construção limpa, ombro suave e lã fria. Uma peça de transição pensada para o quotidiano.'},
        en:{name:'Structured wool blazer',description:'Cleanly constructed blazer with a soft shoulder and cool wool, designed as an effortless transitional layer.'},
        es:{name:'Blazer estructurada de lana',description:'Blazer de construcción depurada, hombro suave y lana fresca, pensada como pieza de transición para el día a día.'},
        it:{name:'Blazer strutturato in lana',description:'Blazer dalla costruzione pulita, spalla morbida e lana fresca, pensato come capo di transizione quotidiano.'},
        de:{name:'Strukturierter Wollblazer',description:'Klar konstruierter Blazer mit weicher Schulter und kühler Wolle – als vielseitiger Übergangs-Layer gedacht.'}
      }
    },
    {
      id:'p2',slug:'manteau-maison-nord-minimal',brand:'Maison Nord',category:'women',price:420,partnerId:'maison-nord',sizes:['XS','S','M','L'],badge:'private',isNew:false,sale:false,privateSale:true,
      image:'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Manteau minimaliste en laine',description:'Manteau aux lignes longues et à la finition minimaliste, sélectionné par Maison Nord pour une silhouette précise.'},
        pt:{name:'Casaco minimalista em lã',description:'Casaco de linhas longas e acabamento minimalista, selecionado pela Maison Nord para uma silhueta precisa.'},
        en:{name:'Minimal wool coat',description:'Long-line wool coat with a minimal finish, selected by Maison Nord for a precise contemporary silhouette.'},
        es:{name:'Abrigo minimalista de lana',description:'Abrigo de líneas largas y acabado minimalista, seleccionado por Maison Nord para una silueta precisa.'},
        it:{name:'Cappotto minimal in lana',description:'Cappotto dalle linee lunghe e finitura minimale, selezionato da Maison Nord per una silhouette precisa.'},
        de:{name:'Minimalistischer Wollmantel',description:'Lang geschnittener Wollmantel mit reduziertem Finish, von Maison Nord für eine präzise Silhouette ausgewählt.'}
      }
    },
    {
      id:'p3',slug:'surchemise-noma-technique',brand:'NOMA',category:'men',price:198,partnerId:'maison-nord',sizes:['S','M','L','XL'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Surchemise technique',description:'Surchemise légère à construction technique et volume décontracté, idéale pour les superpositions.'},
        pt:{name:'Overshirt técnica',description:'Overshirt leve com construção técnica e volume descontraído, ideal para sobreposição.'},
        en:{name:'Technical overshirt',description:'Light technical overshirt with a relaxed volume, designed for easy seasonal layering.'},
        es:{name:'Sobrecamisa técnica',description:'Sobrecamisa ligera de construcción técnica y volumen relajado, ideal para superposiciones.'},
        it:{name:'Overshirt tecnica',description:'Overshirt leggera dalla costruzione tecnica e volume rilassato, ideale per il layering.'},
        de:{name:'Technisches Overshirt',description:'Leichtes technisches Overshirt mit entspanntem Volumen, ideal für unkomplizierte Layering-Looks.'}
      }
    },
    {
      id:'p4',slug:'sac-linea-44-arc',brand:'Linea 44',category:'accessories',price:355,partnerId:'linea-44',sizes:['U'],badge:'icon',isNew:false,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Sac Arc en cuir',description:'Sac compact en cuir à structure courbe, finitions discrètes et bandoulière réglable.'},
        pt:{name:'Mala Arc em pele',description:'Mala compacta em pele com estrutura curva, acabamentos discretos e alça ajustável.'},
        en:{name:'Arc leather bag',description:'Compact leather bag with a curved structure, discreet hardware and adjustable strap.'},
        es:{name:'Bolso Arc de piel',description:'Bolso compacto de piel con estructura curva, acabados discretos y correa ajustable.'},
        it:{name:'Borsa Arc in pelle',description:'Borsa compatta in pelle dalla struttura curva, finiture discrete e tracolla regolabile.'},
        de:{name:'Arc Ledertasche',description:'Kompakte Ledertasche mit geschwungener Form, dezenten Details und verstellbarem Riemen.'}
      }
    },
    {
      id:'p5',slug:'runform-runner-02',brand:'Runform',category:'sport',price:165,partnerId:'atelier-27',sizes:['38','39','40','41','42','43'],badge:'fresh',isNew:true,sale:true,privateSale:false,compareAt:195,
      image:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Runner 02',description:'Sneaker de course urbaine au profil léger, semelle réactive et construction respirante.'},
        pt:{name:'Runner 02',description:'Sapatilha de corrida urbana com perfil leve, sola responsiva e construção respirável.'},
        en:{name:'Runner 02',description:'Light urban running sneaker with a responsive sole and breathable construction.'},
        es:{name:'Runner 02',description:'Zapatilla de running urbano ligera, con suela reactiva y construcción transpirable.'},
        it:{name:'Runner 02',description:'Sneaker running urbana leggera, con suola reattiva e costruzione traspirante.'},
        de:{name:'Runner 02',description:'Leichter Urban-Running-Sneaker mit reaktionsfreudiger Sohle und atmungsaktiver Konstruktion.'}
      }
    },
    {
      id:'p6',slug:'robe-aster-colonne',brand:'Aster Studio',category:'women',price:245,partnerId:'atelier-27',sizes:['34','36','38','40'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Robe colonne',description:'Robe longue à encolure épurée et tissu fluide au toucher sec.'},
        pt:{name:'Vestido coluna',description:'Vestido de silhueta longa com decote depurado e tecido fluido de toque seco.'},
        en:{name:'Column dress',description:'Long column dress with a clean neckline and fluid, dry-touch fabric.'},
        es:{name:'Vestido columna',description:'Vestido largo de silueta columna, escote limpio y tejido fluido de tacto seco.'},
        it:{name:'Abito colonna',description:'Abito lungo dalla linea a colonna, scollo pulito e tessuto fluido dal tocco asciutto.'},
        de:{name:'Column-Kleid',description:'Langes Column-Kleid mit klarem Ausschnitt und fließendem Stoff mit trockenem Griff.'}
      }
    },
    {
      id:'p7',slug:'bomber-northline-daim',brand:'Northline',category:'men',price:510,partnerId:'maison-nord',sizes:['S','M','L','XL'],badge:'limited',isNew:false,sale:false,privateSale:true,
      image:'https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Bomber en daim',description:'Bomber en daim souple à finition mate et proportions contemporaines.'},
        pt:{name:'Bomber em camurça',description:'Bomber em camurça suave com acabamento mate e proporções contemporâneas.'},
        en:{name:'Suede bomber',description:'Soft suede bomber with a matte finish and contemporary proportions.'},
        es:{name:'Bomber de ante',description:'Bomber de ante suave con acabado mate y proporciones contemporáneas.'},
        it:{name:'Bomber in suede',description:'Bomber in suede morbido con finitura opaca e proporzioni contemporanee.'},
        de:{name:'Bomberjacke aus Veloursleder',description:'Weiche Veloursleder-Bomberjacke mit mattem Finish und zeitgemäßen Proportionen.'}
      }
    },
    {
      id:'p8',slug:'mocassin-linea-44-19',brand:'Linea 44',category:'accessories',price:285,partnerId:'linea-44',sizes:['36','37','38','39','40','41'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Mocassin 19',description:'Mocassin de construction classique réinterprété avec semelle fine et bout allongé.'},
        pt:{name:'Loafer 19',description:'Loafer de construção clássica reinterpretado com sola fina e biqueira alongada.'},
        en:{name:'Loafer 19',description:'Classic loafer construction reinterpreted with a slim sole and elongated toe.'},
        es:{name:'Mocasín 19',description:'Mocasín de construcción clásica reinterpretado con suela fina y puntera alargada.'},
        it:{name:'Mocassino 19',description:'Mocassino classico reinterpretato con suola sottile e punta allungata.'},
        de:{name:'Loafer 19',description:'Klassischer Loafer, neu interpretiert mit schlanker Sohle und verlängerter Zehenpartie.'}
      }
    },
    {
      id:'p9',slug:'mini-parka-petit-nord',brand:'Petit Nord',category:'kids',price:119,partnerId:'maison-nord',sizes:['4A','6A','8A','10A'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Mini parka légère',description:'Parka enfant légère, résistante et facile à superposer, dans une palette neutre.'},
        pt:{name:'Mini parka leve',description:'Parka infantil leve, resistente e fácil de sobrepor, numa paleta neutra.'},
        en:{name:'Lightweight mini parka',description:'Light, durable kids parka designed for easy layering in a neutral palette.'},
        es:{name:'Mini parka ligera',description:'Parka infantil ligera y resistente, fácil de superponer y en una paleta neutra.'},
        it:{name:'Mini parka leggero',description:'Parka bambino leggero e resistente, facile da sovrapporre e in palette neutra.'},
        de:{name:'Leichter Mini-Parka',description:'Leichter, robuster Kinderparka für unkompliziertes Layering in neutraler Farbpalette.'}
      }
    },
    {
      id:'p10',slug:'sneaker-mini-runform',brand:'Runform Mini',category:'kids',price:89,partnerId:'atelier-27',sizes:['28','29','30','31','32','33'],badge:'fresh',isNew:false,sale:true,privateSale:false,compareAt:110,
      image:'https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Mini Runner',description:'Sneaker enfant souple et légère avec semelle amortissante et fermeture facile.'},
        pt:{name:'Mini Runner',description:'Sapatilha infantil leve e flexível com sola amortecida e fecho simples.'},
        en:{name:'Mini Runner',description:'Flexible lightweight kids sneaker with cushioned sole and easy fastening.'},
        es:{name:'Mini Runner',description:'Zapatilla infantil ligera y flexible con suela amortiguada y cierre sencillo.'},
        it:{name:'Mini Runner',description:'Sneaker bambino leggera e flessibile con suola ammortizzata e chiusura facile.'},
        de:{name:'Mini Runner',description:'Flexibler, leichter Kinder-Sneaker mit gedämpfter Sohle und einfachem Verschluss.'}
      }
    },
    {
      id:'p11',slug:'serum-linea-44-lumiere',brand:'Linea 44 Beauty',category:'beauty',price:68,partnerId:'linea-44',sizes:['30 ml'],badge:'new',isNew:true,sale:false,privateSale:false,
      image:'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Sérum Lumière 01',description:'Sérum hydratant à texture légère, présenté ici comme référence beauté démonstrative.'},
        pt:{name:'Sérum Lumière 01',description:'Sérum hidratante de textura leve, apresentado aqui como referência de beleza demonstrativa.'},
        en:{name:'Lumière Serum 01',description:'Lightweight hydrating serum presented here as a demonstrative beauty reference.'},
        es:{name:'Sérum Lumière 01',description:'Sérum hidratante de textura ligera, presentado como referencia de belleza demostrativa.'},
        it:{name:'Siero Lumière 01',description:'Siero idratante dalla texture leggera, presentato come referenza beauty dimostrativa.'},
        de:{name:'Lumière Serum 01',description:'Leichtes Feuchtigkeitsserum, hier als demonstrative Beauty-Referenz präsentiert.'}
      }
    },
    {
      id:'p12',slug:'baume-linea-44-nuit',brand:'Linea 44 Beauty',category:'beauty',price:52,partnerId:'linea-44',sizes:['50 ml'],badge:'private',isNew:false,sale:true,privateSale:true,compareAt:65,
      image:'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1000&q=86',
      copy:{
        fr:{name:'Baume Nuit 02',description:'Baume nourrissant à la texture enveloppante, sélectionné pour la Vente privée Preview.'},
        pt:{name:'Bálsamo Nuit 02',description:'Bálsamo nutritivo de textura envolvente, selecionado para a Venda privada Preview.'},
        en:{name:'Nuit Balm 02',description:'Nourishing balm with an enveloping texture, selected for the Private Sale Preview.'},
        es:{name:'Bálsamo Nuit 02',description:'Bálsamo nutritivo de textura envolvente, seleccionado para la Venta privada Preview.'},
        it:{name:'Balsamo Nuit 02',description:'Balsamo nutriente dalla texture avvolgente, selezionato per la Vendita privata Preview.'},
        de:{name:'Nuit Balm 02',description:'Pflegender Balm mit umhüllender Textur, ausgewählt für die Private-Sale-Preview.'}
      }
    }
  ];

  const badges = {
    fr:{new:'Nouveau',private:'Privé',icon:'Icône',fresh:'Nouveau',limited:'Édition limitée',sale:'Soldes'},
    pt:{new:'Novo',private:'Privado',icon:'Ícone',fresh:'Novidade',limited:'Edição limitada',sale:'Saldos'},
    en:{new:'New',private:'Private',icon:'Icon',fresh:'Fresh',limited:'Limited',sale:'Sale'},
    es:{new:'Nuevo',private:'Privado',icon:'Icono',fresh:'Novedad',limited:'Edición limitada',sale:'Rebajas'},
    it:{new:'Nuovo',private:'Privato',icon:'Icona',fresh:'Novità',limited:'Edizione limitata',sale:'Saldi'},
    de:{new:'Neu',private:'Privat',icon:'Ikone',fresh:'Neu',limited:'Limitiert',sale:'Sale'}
  };

  const categories = {
    women:['p1','p2','p6'],men:['p3','p7'],kids:['p9','p10'],sport:['p5'],accessories:['p4','p8'],beauty:['p11','p12']
  };

  window.ZFashionCustomerCatalog = {partners,products,badges,categories};
})();
