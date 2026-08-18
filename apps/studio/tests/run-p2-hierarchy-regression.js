const {
  app,
  BrowserWindow
} = require('electron');

const fs = require('fs');
const http = require('http');
const path = require('path');

app.commandLine.appendSwitch(
  'disable-gpu'
);

app.disableHardwareAcceleration();

const htmlArg =
  process.argv.find(
    arg =>
      /\.html$/i.test(arg)
  );

const htmlPath =
  path.resolve(
    htmlArg ||
    path.join(
      __dirname,
      '..',
      'app',
      'my-studio.html'
    )
  );

const root =
  path.dirname(
    htmlPath
  );

const htmlName =
  path.basename(
    htmlPath
  );

function startServer() {
  return new Promise(resolve => {
    const server =
      http.createServer(
        (req, res) => {
          const pathname =
            decodeURIComponent(
              req.url.split('?')[0]
            );

          const rel =
            pathname === '/'
              ? htmlName
              : pathname.replace(
                  /^\/+/,
                  ''
                );

          const file =
            path.resolve(
              root,
              rel
            );

          if (
            file !== htmlPath &&
            !file.startsWith(
              root +
              path.sep
            )
          ) {
            res.writeHead(403);
            res.end();
            return;
          }

          fs.readFile(
            file,
            (err, data) => {
              if (err) {
                res.writeHead(404);
                res.end();
                return;
              }

              res.writeHead(200);
              res.end(data);
            }
          );
        }
      );

    server.listen(
      0,
      '127.0.0.1',
      () => resolve(server)
    );
  });
}

const CONTRACT = String.raw`
(async () => {
  await document.fonts.ready;

  const results = [];

  const check =
    (
      name,
      pass,
      detail = null
    ) => {
      results.push({
        name,
        pass: !!pass,
        detail
      });
    };

  function fontPx(font) {
    const match =
      String(font).match(
        /([0-9.]+)px/
      );

    return match
      ? Number(match[1])
      : 0;
  }

  function callLeft(call) {
    if (
      call.align ===
      'right'
    ) {
      return (
        call.x -
        call.width
      );
    }

    if (
      call.align ===
      'center'
    ) {
      return (
        call.x -
        call.width / 2
      );
    }

    return call.x;
  }

  function callBox(call) {
    const size =
      call.fontPx || 0;

    const left =
      callLeft(call);

    const ascent =
      call.actualAscent > 0
        ? call.actualAscent
        : size * 0.80;

    const descent =
      call.actualDescent >= 0
        ? call.actualDescent
        : size * 0.20;

    return {
      left,
      right:
        left +
        call.width,
      top:
        call.y -
        ascent,
      bottom:
        call.y +
        descent
    };
  }

  function overlaps(
    a,
    b
  ) {
    return !(
      a.right <= b.left ||
      b.right <= a.left ||
      a.bottom <= b.top ||
      b.bottom <= a.top
    );
  }

  async function renderCase(
    format,
    template,
    setup
  ) {
    state.lang = 'en';
    state.format = format;
    state.template = template;
    state.bg = 'dark';

    state.img = null;
    state.photo = null;
    state.photos = [];
    state.carPhotos = [];

    state.title =
      'Architectural Residence With Exceptional Natural Light';

    state.price =
      '1.245.000€';

    state.loc =
      'Porto · Foz do Douro';

    state.badge =
      'Selected';

    state.showSpecs =
      true;

    state.spec = [
      {
        label:'META-A',
        value:'245 m² interior'
      },
      {
        label:'META-B',
        value:'4 bedrooms + office'
      },
      {
        label:'META-C',
        value:'Private terrace and garden'
      },
      {
        label:'META-D',
        value:'Energy class A'
      }
    ];

    if (setup) {
      setup();
    }

    const [W, H] =
      FORMATS[format];

    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width = W;
    canvas.height = H;

    const ctx =
      canvas.getContext(
        '2d'
      );

    const calls = [];

    const original =
      ctx.fillText.bind(
        ctx
      );

    ctx.fillText =
      function(
        text,
        x,
        y,
        ...rest
      ) {
        const value =
          String(text);

        const measured =
          ctx.measureText(
            value
          );

        calls.push({
          text:value,
          x:Number(x),
          y:Number(y),
          width:
            measured.width,
          actualAscent:
            Number(
              measured.actualBoundingBoxAscent ||
              0
            ),
          actualDescent:
            Number(
              measured.actualBoundingBoxDescent ||
              0
            ),
          font:
            String(ctx.font),
          fontPx:
            fontPx(ctx.font),
          align:
            String(
              ctx.textAlign
            ),
          alpha:
            Number(
              ctx.globalAlpha
            )
        });

        return original(
          value,
          x,
          y,
          ...rest
        );
      };

    let error = null;

    try {
      await drawListing(
        ctx,
        W,
        H
      );

    } catch (e) {
      error =
        String(
          e &&
          e.stack
            ? e.stack
            : e
        );
    }

    return {
      calls,
      error
    };
  }

  check(
    'P2 hierarchy marker carregado',
    document.documentElement
      .innerHTML
      .includes(
        'ZSTUDIO_P2_VISUAL_HIERARCHY_V1'
      )
  );

  check(
    'P2 multiline helper existe',
    typeof fitWrappedText ===
      'function'
  );

  check(
    'Finance V4 adaptive rail existe',
    typeof applyFinanceAdaptiveLabelRail ===
      'function'
  );

  // ========================================================
  // P2.1 EMPTY
  // ========================================================

  for (
    const format
    of [
      'feed45',
      'story'
    ]
  ) {
    const result =
      await renderCase(
        format,
        'classico',
        () => {
          state.title = '';
          state.price = '';
          state.loc = '';
          state.badge = '';
          state.showSpecs =
            false;
        }
      );

    const t =
      I18N.en;

    const primary =
      result.calls.find(
        call =>
          call.text ===
          t.emptyHint1
      );

    const secondary =
      result.calls.find(
        call =>
          call.text ===
          t.emptyHint2
      );

    check(
      'P2 empty ' +
      format +
      ' render sem exceção',
      !result.error,
      result.error
    );

    check(
      'P2 empty ' +
      format +
      ' primary alpha 0.82',
      !!primary &&
      Math.abs(
        primary.alpha -
        0.82
      ) < 0.001,
      primary
    );

    check(
      'P2 empty ' +
      format +
      ' secondary alpha 0.60',
      !!secondary &&
      Math.abs(
        secondary.alpha -
        0.60
      ) < 0.001,
      secondary
    );
  }

  // ========================================================
  // P2.3A MINIMALIST
  // ========================================================

  const longTitle =
    'Architectural Residence With Exceptional Natural Light';

  for (
    const format
    of [
      'feed45',
      'story',
      'wide'
    ]
  ) {
    const result =
      await renderCase(
        format,
        'minimalista'
      );

    const titleCalls =
      result.calls.filter(
        call =>
          call.text.length > 4 &&
          longTitle.includes(
            call.text
          )
      );

    const price =
      result.calls.find(
        call =>
          call.text ===
          '1.245.000€'
      );

    const collision =
      !!price &&
      titleCalls.some(
        call =>
          overlaps(
            callBox(call),
            callBox(price)
          )
      );

    check(
      'P2 Minimalist ' +
      format +
      ' render sem exceção',
      !result.error,
      result.error
    );

    check(
      'P2 Minimalist ' +
      format +
      ' título 1–2 linhas',
      titleCalls.length >= 1 &&
      titleCalls.length <= 2,
      titleCalls
    );

    check(
      'P2 Minimalist ' +
      format +
      ' título/preço sem colisão',
      !!price &&
      !collision,
      {
        titleCalls,
        price
      }
    );

    if (
      format === 'feed45' ||
      format === 'story'
    ) {
      const firstTitleY =
        Math.min(
          ...titleCalls.map(
            call =>
              call.y
          )
        );

      check(
        'P2 Minimalist ' +
        format +
        ' preço fica na header row',
        !!price &&
        price.y <
          firstTitleY -
          15,
        {
          firstTitleY,
          priceY:
            price &&
            price.y
        }
      );
    }
  }

  // ========================================================
  // P2.3B METADATA
  // ========================================================

  for (
    const format
    of [
      'feed45',
      'story',
      'wide'
    ]
  ) {
    for (
      const template
      of [
        'classico',
        'editorial'
      ]
    ) {
      const result =
        await renderCase(
          format,
          template
        );

      const specs =
        result.calls.filter(
          call =>
            /META-[A-D]/
              .test(
                call.text
              )
        );

      const minFont =
        specs.length
          ? Math.min(
              ...specs.map(
                call =>
                  call.fontPx
              )
            )
          : 0;

      check(
        'P2 metadata ' +
        format +
        '/' +
        template +
        ' render sem exceção',
        !result.error,
        result.error
      );

      check(
        'P2 metadata ' +
        format +
        '/' +
        template +
        ' usa 1–2 linhas',
        specs.length >= 1 &&
        specs.length <= 2,
        specs
      );

      check(
        'P2 metadata ' +
        format +
        '/' +
        template +
        ' nunca desce de 20px',
        minFont >= 20,
        {
          minFont,
          specs
        }
      );
    }
  }

  // ========================================================
  // P2.4 NON-FINANCE CATEGORY EXTRAS — MOBILE
  // ========================================================

  function setupCategory(
    category
  ) {
    state.lang = 'en';
    state.category =
      category;

    state.price =
      '450000';

    state.energyRating =
      'A';

    state.starRating =
      4;

    state.allergens =
      [
        'gluten',
        'milk'
      ];

    state.sizes =
      [
        'M',
        'L'
      ];

    renderCategoryExtras();

    return document.getElementById(
      'categoryExtras'
    );
  }

  for (
    const category
    of [
      'imoveis',
      'gastronomia',
      'moda'
    ]
  ) {
    const root =
      setupCategory(
        category
      );

    const chips =
      [
        ...root.querySelectorAll(
          '.chip'
        )
      ];

    const minFont =
      chips.length
        ? Math.min(
            ...chips.map(
              chip =>
                parseFloat(
                  getComputedStyle(
                    chip
                  ).fontSize
                )
            )
          )
        : 0;

    const minHeight =
      chips.length
        ? Math.min(
            ...chips.map(
              chip =>
                chip
                  .getBoundingClientRect()
                  .height
            )
          )
        : 0;

    check(
      'P2 ' +
      category +
      ' mobile chip font >=13px',
      minFont >= 13,
      {
        minFont
      }
    );

    check(
      'P2 ' +
      category +
      ' mobile chip target >=42px',
      minHeight >= 42,
      {
        minHeight
      }
    );
  }

  {
    const root =
      setupCategory(
        'viagens'
      );

    const stars =
      [
        ...root.querySelectorAll(
          '.star-pick span'
        )
      ];

    const minHeight =
      stars.length
        ? Math.min(
            ...stars.map(
              star =>
                star
                  .getBoundingClientRect()
                  .height
            )
          )
        : 0;

    check(
      'P2 viagens mobile stars >=44px',
      minHeight >= 44,
      {
        minHeight
      }
    );
  }

  // ========================================================
  // FINANCE V4 — SIX LANGUAGES, MOBILE HARD CASE
  // ========================================================

  const languages =
    [
      'pt',
      'en',
      'fr',
      'es',
      'de',
      'it'
    ];

  for (
    const lang
    of languages
  ) {
    state.lang = lang;
    state.category =
      'carros';

    state.price =
      '450000';

    state.financeMonths =
      60;

    state.financeDownPct =
      20;

    state.financeAPR =
      7.9;

    renderCategoryExtras();

    const root =
      document.getElementById(
        'categoryExtras'
      );

    const grid =
      root.querySelector(
        '.finance-grid'
      );

    const labels =
      [
        ...grid.querySelectorAll(
          '.finance-label'
        )
      ];

    const inputs =
      [
        ...grid.querySelectorAll(
          '.finance-input'
        )
      ];

    const tops =
      inputs.map(
        input =>
          input
            .getBoundingClientRect()
            .top
      );

    const delta =
      Math.max(...tops) -
      Math.min(...tops);

    const maxLines =
      Math.max(
        ...labels.map(
          label =>
            financeRenderedLineCount(
              label
            )
        )
      );

    const inputFonts =
      inputs.map(
        input =>
          parseFloat(
            getComputedStyle(
              input
            ).fontSize
          )
      );

    const inputHeights =
      inputs.map(
        input =>
          input
            .getBoundingClientRect()
            .height
      );

    check(
      'Finance V4 ' +
      lang +
      ' sem overflow horizontal',
      root.scrollWidth <=
        root.clientWidth + 1,
      {
        scrollWidth:
          root.scrollWidth,
        clientWidth:
          root.clientWidth
      }
    );

    check(
      'Finance V4 ' +
      lang +
      ' labels <=2 linhas',
      maxLines <= 2,
      {
        maxLines,
        labels:
          labels.map(
            label =>
              label.textContent
          )
      }
    );

    check(
      'Finance V4 ' +
      lang +
      ' inputs alinhados',
      delta <= 1.5,
      {
        delta
      }
    );

    check(
      'Finance V4 ' +
      lang +
      ' input mobile >=15px',
      Math.min(
        ...inputFonts
      ) >= 15,
      inputFonts
    );

    check(
      'Finance V4 ' +
      lang +
      ' input mobile >=36px',
      Math.min(
        ...inputHeights
      ) >= 36,
      inputHeights
    );
  }

  // Prove the fallback itself even if current translations
  // all happen to fit one line at 390px.
  state.lang = 'en';
  state.category =
    'carros';

  renderCategoryExtras();

  {
    const root =
      document.getElementById(
        'categoryExtras'
      );

    const labels =
      [
        ...root.querySelectorAll(
          '.finance-label'
        )
      ];

    labels[2].textContent =
      'Extremely long translated interest rate percentage label';

    applyFinanceAdaptiveLabelRail(
      root
    );

    const grid =
      root.querySelector(
        '.finance-grid'
      );

    check(
      'Finance V4 ativa rail adaptativo quando necessário',
      grid.classList.contains(
        'finance-two-line'
      )
    );
  }

  return results;
})()
`;

async function main() {
  if (
    !fs.existsSync(
      htmlPath
    )
  ) {
    console.error(
      '❌ HTML ausente: ' +
      htmlPath
    );

    app.exit(1);
    return;
  }

  const server =
    await startServer();

  const port =
    server.address().port;

  const win =
    new BrowserWindow({
      width:390,
      height:1800,
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

  // Normalize the Chromium content viewport explicitly.
  // BrowserWindow outer bounds are platform-dependent;
  // the P2 mobile contract authority is exactly 390 CSS px.
  win.setContentSize(
    390,
    1800
  );

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        100
      )
  );

  try {
    await win.loadURL(
      'http://127.0.0.1:' +
      port +
      '/' +
      htmlName
    );

    const innerWidth =
      await win.webContents
        .executeJavaScript(
          'window.innerWidth',
          true
        );

    if (
      innerWidth !== 390
    ) {
      throw new Error(
        'P2 viewport mismatch: expected 390 CSS px, got ' +
        innerWidth
      );
    }

    console.log(
      'P2_VIEWPORT_INNER_WIDTH=' +
      innerWidth
    );

    const results =
      await win.webContents
        .executeJavaScript(
          CONTRACT,
          true
        );

    const failed =
      results.filter(
        result =>
          !result.pass
      );

    const passed =
      results.filter(
        result =>
          result.pass
      );

    console.log(
      '\n' +
      '════════════════════════════════════════════════'
    );

    console.log(
      'Z STUDIO — P2 VISUAL HIERARCHY CONTRACT'
    );

    console.log(
      'RESULTADO: ' +
      passed.length +
      ' passaram, ' +
      failed.length +
      ' falharam (de ' +
      results.length +
      ')'
    );

    console.log(
      '════════════════════════════════════════════════\n'
    );

    for (
      const result
      of results
    ) {
      console.log(
        (
          result.pass
            ? '✅ '
            : '❌ '
        ) +
        result.name +
        (
          !result.pass &&
          result.detail !== null
            ? '  →  ' +
              JSON.stringify(
                result.detail
              )
            : ''
        )
      );
    }

    server.close();

    if (
      !win.isDestroyed()
    ) {
      win.destroy();
    }

    app.exit(
      failed.length
        ? 1
        : 0
    );

  } catch (error) {
    console.error(
      error &&
      error.stack
        ? error.stack
        : error
    );

    server.close();

    if (
      !win.isDestroyed()
    ) {
      win.destroy();
    }

    app.exit(1);
  }
}

app.whenReady().then(
  main
);
