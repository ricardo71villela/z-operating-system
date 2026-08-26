const {
  app,
  BrowserWindow
} = require('electron');

const fs =
  require('fs');

const path =
  require('path');

app.commandLine.appendSwitch(
  'disable-gpu'
);

app.disableHardwareAcceleration();

const OUT =
  process.env.ZSTUDIO_P2_GOLDENS_OUT;

const URL =
  process.env.ZSTUDIO_P2_URL;

if (!OUT || !URL) {
  throw new Error(
    'missing P2 generator environment'
  );
}

fs.mkdirSync(
  OUT,
  {
    recursive:true
  }
);

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function timeout(
  promise,
  label,
  ms = 15000
) {
  let timer;

  const guard =
    new Promise(
      (
        resolve,
        reject
      ) => {
        timer =
          setTimeout(
            () =>
              reject(
                new Error(
                  'TIMEOUT: ' +
                  label +
                  ' after ' +
                  ms +
                  'ms'
                )
              ),
            ms
          );
      }
    );

  return Promise.race([
    promise,
    guard
  ]).finally(
    () =>
      clearTimeout(timer)
  );
}

async function phase(
  label,
  operation,
  ms = 15000
) {
  console.log(
    'PHASE_START=' +
    label
  );

  const value =
    await timeout(
      Promise.resolve()
        .then(operation),
      label,
      ms
    );

  console.log(
    'PHASE_PASS=' +
    label
  );

  return value;
}

async function exec(
  win,
  label,
  code,
  ms = 15000
) {
  return phase(
    label,
    () =>
      win.webContents
        .executeJavaScript(
          code,
          true
        ),
    ms
  );
}

async function setViewport(
  win,
  width,
  height,
  label
) {
  console.log(
    'VIEWPORT_REQUEST=' +
    width +
    'x' +
    height
  );

  win.setContentSize(
    width,
    height
  );

  await sleep(120);

  const size =
    await exec(
      win,
      label,
      `({
        width:window.innerWidth,
        height:window.innerHeight
      })`
    );

  console.log(
    'VIEWPORT_ACTUAL=' +
    size.width +
    'x' +
    size.height
  );

  if (
    size.width !== width ||
    size.height !== height
  ) {
    throw new Error(
      'viewport mismatch: expected ' +
      width +
      'x' +
      height +
      ', got ' +
      size.width +
      'x' +
      size.height
    );
  }
}

async function canvasShot(
  win,
  name
) {
  await exec(
    win,
    'draw_' + name,
    'draw()'
  );

  await sleep(180);

  const dataUrl =
    await exec(
      win,
      'canvas_data_' + name,
      `document
        .getElementById('preview')
        .toDataURL('image/png')`
    );

  const base64 =
    dataUrl.replace(
      /^data:image\/png;base64,/,
      ''
    );

  fs.writeFileSync(
    path.join(
      OUT,
      name + '.png'
    ),
    Buffer.from(
      base64,
      'base64'
    )
  );

  console.log(
    'P2_CAPTURE=' +
    name
  );
}

async function elementShot(
  win,
  name,
  selector
) {
  const rect =
    await exec(
      win,
      'rect_' + name,
      `(() => {
        const el =
          document.querySelector(
            ${JSON.stringify(selector)}
          );

        if (!el) {
          throw new Error(
            'missing selector: ' +
            ${JSON.stringify(selector)}
          );
        }

        el.scrollIntoView({
          block:'start',
          inline:'nearest'
        });

        const r =
          el.getBoundingClientRect();

        return {
          x:Math.floor(r.left),
          y:Math.floor(r.top),
          width:Math.ceil(r.width),
          height:Math.ceil(r.height)
        };
      })()`
    );

  console.log(
    'CAPTURE_RECT_' +
    name +
    '=' +
    JSON.stringify(rect)
  );

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(
      'invalid capture rect: ' +
      name
    );
  }

  await sleep(150);

  const image =
    await phase(
      'capture_' + name,
      () =>
        win.webContents
          .capturePage(rect)
    );

  fs.writeFileSync(
    path.join(
      OUT,
      name + '.png'
    ),
    image.toPNG()
  );

  console.log(
    'P2_CAPTURE=' +
    name
  );
}

async function main() {
  console.log(
    'P2_GENERATOR_BOOT=PASS'
  );

  const win =
    new BrowserWindow({
      width:1200,
      height:1000,
      show:false,
      webPreferences:{
        offscreen:true,
        contextIsolation:false,
        sandbox:false
      }
    });

  win.webContents.setFrameRate(
    30
  );

  win.webContents.on(
    'paint',
    () => {}
  );

  try {
    await phase(
      'load_app',
      () =>
        win.loadURL(URL),
      20000
    );

    await setViewport(
      win,
      1200,
      1000,
      'viewport_desktop_initial'
    );

    const fontState =
      await exec(
        win,
        'font_probe',
        `Promise.race([
          document.fonts.ready
            .then(
              () => ({
                ready:true,
                status:
                  document.fonts.status
              })
            ),
          new Promise(
            resolve =>
              setTimeout(
                () =>
                  resolve({
                    ready:false,
                    status:
                      document.fonts.status
                  }),
                5000
              )
          )
        ])`,
        7000
      );

    console.log(
      'FONT_STATE=' +
      JSON.stringify(
        fontState
      )
    );

    await exec(
      win,
      'initialize_deterministic_photo',
      `(async () => {
        setLang('en');

        const c =
          document.createElement(
            'canvas'
          );

        c.width = 1200;
        c.height = 900;

        const ctx =
          c.getContext('2d');

        const g =
          ctx.createLinearGradient(
            0,
            0,
            1200,
            900
          );

        g.addColorStop(
          0,
          '#77523d'
        );

        g.addColorStop(
          0.5,
          '#31425d'
        );

        g.addColorStop(
          1,
          '#15110f'
        );

        ctx.fillStyle = g;

        ctx.fillRect(
          0,
          0,
          1200,
          900
        );

        ctx.strokeStyle =
          'rgba(255,255,255,0.18)';

        ctx.lineWidth = 4;

        for (
          let i = 1;
          i < 6;
          i++
        ) {
          const x =
            1200 *
            i /
            6;

          ctx.beginPath();

          ctx.moveTo(
            x,
            0
          );

          ctx.lineTo(
            x,
            900
          );

          ctx.stroke();
        }

        const url =
          c.toDataURL(
            'image/png'
          );

        state.photos = [
          url
        ];

        state.carPhotos = [
          url
        ];

        state.photo = url;

        state.img =
          await loadImg(
            url
          );

        state._styleCustomized =
          true;

        state.brand.accent =
          '#B8935A';

        setGoldVar(
          '#B8935A'
        );

        state.bg = 'dark';
        state.filter = 'auto';
        state.smartCrop = true;
        state.showSpecs = true;

        state.title =
          'Architectural Residence With Exceptional Natural Light';

        state.price =
          '1.245.000€';

        state.loc =
          'Porto · Foz do Douro';

        state.badge =
          'Selected';

        return {
          imgWidth:
            state.img &&
            state.img.naturalWidth,
          imgHeight:
            state.img &&
            state.img.naturalHeight
        };
      })()`,
      15000
    );

    await exec(
      win,
      'setup_minimal_story',
      `setFormat('story');
       setTemplate('minimalista');
       state.showSpecs=true;`
    );

    await canvasShot(
      win,
      'p2-minimalista-story'
    );

    for (
      const template
      of [
        'classico',
        'editorial'
      ]
    ) {
      await exec(
        win,
        'setup_metadata_' +
        template,
        `setFormat('story');
         setTemplate(${JSON.stringify(template)});
         state.showSpecs=true;
         state.spec=[
           {
             label:'Interior area',
             value:'245 m² plus private storage'
           },
           {
             label:'Bedrooms',
             value:'Four bedrooms plus independent office'
           },
           {
             label:'Outdoor space',
             value:'Private terrace and landscaped garden'
           },
           {
             label:'Energy rating',
             value:'Class A high-efficiency building'
           }
         ];`
      );

      await canvasShot(
        win,
        'p2-metadata-' +
        template +
        '-story-long'
      );
    }

    await setViewport(
      win,
      390,
      1000,
      'viewport_mobile_gastronomia'
    );

    await exec(
      win,
      'setup_gastronomia_mobile',
      `setLang('en');
       state.category='gastronomia';
       state.price='48';
       state.allergens=[
         'gluten',
         'lactose'
       ];
       state.starRating=0;
       state.sizes=[];
       renderCategoryExtras();
       window.scrollTo(0,0);`
    );

    await elementShot(
      win,
      'p2-ui-gastronomia-mobile',
      '#categoryExtras'
    );

    await setViewport(
      win,
      1200,
      1000,
      'viewport_finance_desktop'
    );

    await exec(
      win,
      'setup_finance_en_desktop',
      `setLang('en');
       state.category='carros';
       state.price='450000';
       state.financeMonths=60;
       state.financeDownPct=20;
       state.financeAPR=7.9;
       renderCategoryExtras();
       applyFinanceAdaptiveLabelRail(
         document.getElementById(
           'categoryExtras'
         )
       );
       window.scrollTo(0,0);`
    );

    await elementShot(
      win,
      'p2-ui-finance-en-desktop',
      '#categoryExtras'
    );

    await setViewport(
      win,
      390,
      1000,
      'viewport_finance_fr_mobile'
    );

    await exec(
      win,
      'setup_finance_fr_mobile',
      `setLang('fr');
       state.category='carros';
       state.price='450000';
       state.financeMonths=60;
       state.financeDownPct=20;
       state.financeAPR=7.9;
       renderCategoryExtras();
       applyFinanceAdaptiveLabelRail(
         document.getElementById(
           'categoryExtras'
         )
       );
       window.scrollTo(0,0);`
    );

    await elementShot(
      win,
      'p2-ui-finance-fr-mobile',
      '#categoryExtras'
    );

    const files =
      fs.readdirSync(OUT)
        .filter(
          name =>
            name.endsWith(
              '.png'
            )
        )
        .sort();

    const expected = [
      'p2-metadata-classico-story-long.png',
      'p2-metadata-editorial-story-long.png',
      'p2-minimalista-story.png',
      'p2-ui-finance-en-desktop.png',
      'p2-ui-finance-fr-mobile.png',
      'p2-ui-gastronomia-mobile.png'
    ];

    if (
      JSON.stringify(files) !==
      JSON.stringify(expected)
    ) {
      throw new Error(
        'unexpected P2 matrix: ' +
        JSON.stringify(files)
      );
    }

    console.log(
      'P2_VISUAL_CANDIDATES=6_OF_6_PASS'
    );

  } finally {
    if (
      win &&
      !win.isDestroyed()
    ) {
      win.destroy();
    }
  }

  app.exit(0);
}

app.whenReady()
  .then(main)
  .catch(
    error => {
      console.error(
        'P2_GENERATOR_ERROR=' +
        (
          error &&
          error.stack
            ? error.stack
            : error
        )
      );

      app.exit(1);
    }
  );
