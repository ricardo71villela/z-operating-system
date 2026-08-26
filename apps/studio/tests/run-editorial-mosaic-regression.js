const {
  app,
  BrowserWindow
} = require('electron');

const fs = require('fs');
const http = require('http');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const htmlArg =
  process.argv.find(
    arg => /\.html$/i.test(arg)
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
  path.dirname(htmlPath);

const htmlName =
  path.basename(htmlPath);

function startServer() {
  return new Promise(resolve => {
    const server =
      http.createServer((req, res) => {
        const pathname =
          decodeURIComponent(
            req.url.split('?')[0]
          );

        const rel =
          pathname === '/'
            ? htmlName
            : pathname.replace(/^\/+/, '');

        const file =
          path.resolve(root, rel);

        if (
          file !== htmlPath &&
          !file.startsWith(root + path.sep)
        ) {
          res.writeHead(403);
          res.end();
          return;
        }

        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end();
            return;
          }

          res.writeHead(200);
          res.end(data);
        });
      });

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
    (name, pass, detail = null) => {
      results.push({
        name,
        pass: !!pass,
        detail
      });
    };

  check(
    'editorial mosaic marker carregado',
    document.documentElement
      .innerHTML
      .includes(
        'ZSTUDIO_COLLAGE_EDITORIAL_MOSAIC_V1'
      )
  );

  check(
    'P0.2 Story safe-bottom rejeitado permanece ausente',
    typeof STORY_CLASSIC_SAFE_BOTTOM_INSET ===
      'undefined'
  );

  const expectedFamilies = {
    story: 'vertical',
    pin: 'vertical',
    feed45: 'standard',
    square: 'standard',
    wide: 'wide'
  };

  const formats = [
    'story',
    'pin',
    'feed45',
    'square',
    'wide'
  ];

  const counts = [6, 7, 8];

  function makePhoto(index) {
    const canvas =
      document.createElement('canvas');

    const mode =
      index % 3;

    canvas.width =
      mode === 0
        ? 1200
        : mode === 1
          ? 720
          : 1500;

    canvas.height =
      mode === 0
        ? 900
        : mode === 1
          ? 1280
          : 760;

    const ctx =
      canvas.getContext('2d');

    ctx.fillStyle =
      'hsl(' +
      ((index * 43) % 360) +
      ' 45% 40%)';

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      'rgba(255,255,255,0.92)';

    ctx.beginPath();

    ctx.arc(
      canvas.width *
        (0.28 + (index % 4) * 0.14),
      canvas.height *
        (0.30 + (index % 3) * 0.17),
      Math.min(
        canvas.width,
        canvas.height
      ) * 0.09,
      0,
      Math.PI * 2
    );

    ctx.fill();

    return canvas.toDataURL('image/png');
  }

  const urls =
    Array.from(
      { length: 8 },
      (_, index) => makePhoto(index)
    );

  state.title =
    'Renderer Layer 2 Contract';

  state.price = '123.456€';
  state.loc = 'Porto';
  state.badge = 'Selected';
  state.showSpecs = true;
  state.bg = 'dark';

  state.spec = [
    { label: 'A', value: '1' },
    { label: 'B', value: '2' },
    { label: 'C', value: '3' },
    { label: 'D', value: '4' }
  ];

  state.photos = urls.slice();

  function occupancy(recipe) {
    const matrix =
      Array.from(
        { length: recipe.rows },
        () =>
          Array(recipe.cols).fill(null)
      );

    let overlap = false;
    let outOfBounds = false;

    recipe.tiles.forEach(
      ([imgIdx, col, row, spanW, spanH]) => {
        if (
          col < 0 ||
          row < 0 ||
          col + spanW > recipe.cols ||
          row + spanH > recipe.rows
        ) {
          outOfBounds = true;
          return;
        }

        for (
          let r = row;
          r < row + spanH;
          r++
        ) {
          for (
            let c = col;
            c < col + spanW;
            c++
          ) {
            if (matrix[r][c] !== null) {
              overlap = true;
            }

            matrix[r][c] = imgIdx;
          }
        }
      }
    );

    return {
      overlap,
      outOfBounds,
      holes:
        matrix
          .flat()
          .filter(v => v === null)
          .length
    };
  }

  function priority(recipe) {
    const areas =
      recipe.tiles.map(
        tile =>
          tile[3] * tile[4]
      );

    return {
      areas,
      valid:
        areas.every(
          (area, index) =>
            index === 0 ||
            areas[index - 1] >= area
        )
    };
  }

  let runtimeCases = 0;

  for (const format of formats) {
    const [W, H] =
      FORMATS[format];

    const story =
      format === 'story';

    const FS =
      (
        format === 'wide' ||
        format === 'pin'
      )
        ? Math.sqrt(
            (W * H) /
            (1080 * 1350)
          )
        : 1;

    const barH =
      (
        story
          ? 300
          : 230
      ) * FS;

    const gridH =
      H - barH;

    const family =
      getCollageEditorialFamily(
        W,
        gridH
      );

    check(
      format +
        ' usa família ' +
        expectedFamilies[format],
      family === expectedFamilies[format],
      {
        family,
        ratio: W / gridH
      }
    );

    for (const count of counts) {
      runtimeCases++;

      const recipe =
        getCollageEditorialRecipe(
          W,
          gridH,
          count
        );

      check(
        format +
          '/' +
          count +
          ' recipe existe',
        !!recipe
      );

      if (!recipe) continue;

      check(
        format +
          '/' +
          count +
          ' usa exatamente ' +
          count +
          ' tiles',
        recipe.tiles.length === count,
        recipe.tiles.length
      );

      const order =
        recipe.tiles.map(
          tile => tile[0]
        );

      const expectedOrder =
        Array.from(
          { length: count },
          (_, index) => index
        );

      check(
        format +
          '/' +
          count +
          ' preserva drag order',
        JSON.stringify(order) ===
          JSON.stringify(expectedOrder),
        order
      );

      const occ =
        occupancy(recipe);

      check(
        format +
          '/' +
          count +
          ' sem overlap',
        !occ.overlap,
        occ
      );

      check(
        format +
          '/' +
          count +
          ' dentro da matriz',
        !occ.outOfBounds,
        occ
      );

      check(
        format +
          '/' +
          count +
          ' cobre matriz completa',
        occ.holes === 0,
        occ
      );

      const pri =
        priority(recipe);

      check(
        format +
          '/' +
          count +
          ' prioridade visual não aumenta',
        pri.valid,
        pri.areas
      );

      state.format = format;
      state.template = 'colagem';

      state.carPhotos =
        urls.slice(0, count);

      state.photo =
        state.carPhotos[0];

      state.img =
        await loadImg(state.photo);

      state.slides = [];
      state.slideIdx = 0;

      const canvas =
        document.createElement('canvas');

      canvas.width = W;
      canvas.height = H;

      let error = null;

      try {
        await drawListing(
          canvas.getContext('2d'),
          W,
          H
        );
      } catch (e) {
        error =
          String(
            e && e.stack
              ? e.stack
              : e
          );
      }

      check(
        format +
          '/' +
          count +
          ' renderiza sem exceção',
        error === null,
        error
      );
    }
  }

  check(
    '15 casos editoriais executados',
    runtimeCases === 15,
    runtimeCases
  );

  const originalFillText =
    CanvasRenderingContext2D.prototype.fillText;

  const pinEvents = [];

  CanvasRenderingContext2D.prototype.fillText =
    function(text, ...args) {
      if (
        String(text).includes('📍')
      ) {
        pinEvents.push(String(text));
      }

      return originalFillText.call(
        this,
        text,
        ...args
      );
    };

  try {
    state.format = 'feed45';
    state.template = 'colagem';
    state.loc = '';

    state.carPhotos =
      urls.slice(0, 6);

    state.photo =
      state.carPhotos[0];

    state.img =
      await loadImg(state.photo);

    const canvas =
      document.createElement('canvas');

    canvas.width = 1080;
    canvas.height = 1350;

    await drawListing(
      canvas.getContext('2d'),
      1080,
      1350
    );

    check(
      'P0.1 localização vazia não desenha pin',
      pinEvents.length === 0,
      pinEvents
    );

  } catch (e) {
    check(
      'P0.1 runtime executa sem exceção',
      false,
      String(e)
    );

  } finally {
    CanvasRenderingContext2D.prototype.fillText =
      originalFillText;
  }


  // ───────────────────────────────────────────────────────────
  // P1.2 — Wide portrait Cinematic Right V2
  // ───────────────────────────────────────────────────────────

  check(
    'P1.2 Cinematic Right V2 marker carregado',
    document.documentElement
      .innerHTML
      .includes(
        'ZSTUDIO_WIDE_PORTRAIT_CINEMATIC_RIGHT_V2'
      )
  );

  check(
    'P1.2 background visível não desenha cópia reconhecível da foto',
    !drawWidePortraitCinematicRight
      .toString()
      .includes('ctx.drawImage(')
  );

  check(
    'P1.2 foreground preserva smartCover/filter/manual-adjust',
    drawWidePortraitCinematicRight
      .toString()
      .includes('smartCoverDraw(')
  );

  function makeP12Photo(
    width,
    height,
    top,
    bottom
  ) {
    const canvas =
      document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext('2d');

    const gradient =
      ctx.createLinearGradient(
        0,
        0,
        width,
        height
      );

    gradient.addColorStop(
      0,
      top
    );

    gradient.addColorStop(
      1,
      bottom
    );

    ctx.fillStyle =
      gradient;

    ctx.fillRect(
      0,
      0,
      width,
      height
    );

    const points = [
      0.12,
      0.50,
      0.88
    ];

    for (
      const py
      of points
    ) {
      ctx.fillStyle =
        '#ffffff';

      ctx.beginPath();

      ctx.arc(
        width * 0.50,
        height * py,
        Math.min(
          width,
          height
        ) * 0.06,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    return canvas.toDataURL(
      'image/png'
    );
  }

  const p12Sources = {
    portrait916:
      makeP12Photo(
        900,
        1600,
        '#24396d',
        '#98587c'
      ),

    portrait45:
      makeP12Photo(
        1000,
        1250,
        '#40552e',
        '#a88131'
      ),

    landscape:
      makeP12Photo(
        1600,
        1000,
        '#383963',
        '#37869a'
      )
  };

  const p12Images = {
    portrait916:
      await loadImg(
        p12Sources.portrait916
      ),

    portrait45:
      await loadImg(
        p12Sources.portrait45
      ),

    landscape:
      await loadImg(
        p12Sources.landscape
      )
  };

  const p12Templates = [
    'classico',
    'editorial',
    'minimalista'
  ];

  const p12Portraits = [
    'portrait916',
    'portrait45'
  ];

  const [p12W, p12H] =
    FORMATS.wide;

  const p12FS =
    Math.sqrt(
      (p12W * p12H) /
      (1080 * 1350)
    );

  function p12TargetHeight(
    template
  ) {
    if (
      template ===
      'classico'
    ) {
      return p12H;
    }

    if (
      template ===
      'minimalista'
    ) {
      return (
        p12H -
        220 * p12FS
      );
    }

    return p12H * 0.62;
  }

  let p12RuntimeCases = 0;

  for (
    const template
    of p12Templates
  ) {
    for (
      const photoKey
      of p12Portraits
    ) {
      p12RuntimeCases++;

      const img =
        p12Images[photoKey];

      state.format = 'wide';
      state.template = template;
      state.photo =
        p12Sources[photoKey];
      state.img = img;
      state.photos = [
        p12Sources[photoKey]
      ];
      state.carPhotos = [
        p12Sources[photoKey]
      ];
      state.cropAdjust = {};
      state.filter = 'auto';
      state.smartCrop = true;
      state.loc = 'Porto';

      const targetH =
        p12TargetHeight(
          template
        );

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' é elegível',
        isWidePortraitCinematicEligible(
          img
        )
      );

      const geometry =
        getWidePortraitCinematicGeometry(
          img,
          0,
          0,
          p12W,
          targetH
        );

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' preserva 100% da fonte',
        geometry.sourceVisiblePct ===
          100,
        geometry
      );

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' usa pelo menos 90% da altura',
        geometry.heightOccupancyPct >=
          90,
        geometry
      );

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' foreground fica dentro da área',
        (
          geometry.x >= 0 &&
          geometry.y >= 0 &&
          geometry.x +
            geometry.w <=
            p12W + 0.01 &&
          geometry.y +
            geometry.h <=
            targetH + 0.01
        ),
        geometry
      );

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' foreground está alinhado à metade direita',
        (
          geometry.x +
          geometry.w / 2
        ) >
          p12W / 2,
        geometry
      );

      const canvas =
        document.createElement(
          'canvas'
        );

      canvas.width = p12W;
      canvas.height = p12H;

      let p12Error = null;

      try {
        await drawListing(
          canvas.getContext('2d'),
          p12W,
          p12H
        );

      } catch (error) {
        p12Error =
          String(
            error &&
            error.stack
              ? error.stack
              : error
          );
      }

      check(
        'P1.2 ' +
          template +
          '/' +
          photoKey +
          ' renderer real completa sem exceção',
        p12Error === null,
        p12Error
      );
    }
  }

  check(
    'P1.2 executa 6 casos portrait reais',
    p12RuntimeCases === 6,
    p12RuntimeCases
  );

  // Landscape must use the legacy path byte-for-byte.
  for (
    const template
    of p12Templates
  ) {
    state.format = 'wide';
    state.template = template;
    state.photo =
      p12Sources.landscape;
    state.img =
      p12Images.landscape;
    state.cropAdjust = {};
    state.filter = 'auto';
    state.smartCrop = true;

    const targetH =
      p12TargetHeight(
        template
      );

    const legacy =
      document.createElement(
        'canvas'
      );

    legacy.width = p12W;
    legacy.height = p12H;

    const routed =
      document.createElement(
        'canvas'
      );

    routed.width = p12W;
    routed.height = p12H;

    const legacyCtx =
      legacy.getContext('2d');

    const routedCtx =
      routed.getContext('2d');

    smartCoverDraw(
      legacyCtx,
      p12Images.landscape,
      0,
      0,
      p12W,
      targetH,
      true
    );

    drawPrimaryTemplatePhoto(
      routedCtx,
      p12Images.landscape,
      0,
      0,
      p12W,
      targetH,
      true,
      template
    );

    const legacyPixels =
      legacyCtx
        .getImageData(
          0,
          0,
          p12W,
          p12H
        )
        .data;

    const routedPixels =
      routedCtx
        .getImageData(
          0,
          0,
          p12W,
          p12H
        )
        .data;

    let identical = true;

    for (
      let i = 0;
      i < legacyPixels.length;
      i++
    ) {
      if (
        legacyPixels[i] !==
        routedPixels[i]
      ) {
        identical = false;
        break;
      }
    }

    check(
      'P1.2 ' +
        template +
        ' landscape mantém legacy byte-identical',
      identical
    );
  }

  // Portrait outside Wide must also delegate to legacy rendering.
  state.format = 'feed45';
  state.template = 'classico';
  state.photo =
    p12Sources.portrait916;
  state.img =
    p12Images.portrait916;
  state.cropAdjust = {};
  state.filter = 'auto';
  state.smartCrop = true;

  check(
    'P1.2 portrait fora de Wide não é elegível',
    !isWidePortraitCinematicEligible(
      p12Images.portrait916
    )
  );

  return results;
})()
`;

async function main() {
  const server =
    await startServer();

  const port =
    server.address().port;

  const win =
    new BrowserWindow({
      width: 1400,
      height: 1000,
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: false,
        sandbox: false
      }
    });

  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});

  try {
    await win.loadURL(
      'http://127.0.0.1:' +
      port +
      '/' +
      htmlName
    );

    await new Promise(
      resolve => setTimeout(resolve, 500)
    );

    const results =
      await win.webContents
        .executeJavaScript(
          CONTRACT,
          true
        );

    const failed =
      results.filter(
        result => !result.pass
      );

    console.log('');
    console.log(
      '════════════════════════════════════════════════'
    );
    console.log(
      'Z STUDIO — RENDERER LAYER 2 CONTRACT'
    );
    console.log(
      'RESULTADO: ' +
      (results.length - failed.length) +
      ' passaram, ' +
      failed.length +
      ' falharam (de ' +
      results.length +
      ')'
    );
    console.log(
      '════════════════════════════════════════════════'
    );
    console.log('');

    for (const result of results) {
      console.log(
        (result.pass ? '✅ ' : '❌ ') +
        result.name +
        (
          result.pass
            ? ''
            : ' → ' +
              JSON.stringify(result.detail)
        )
      );
    }

    server.close();

    if (!win.isDestroyed()) {
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

    if (!win.isDestroyed()) {
      win.destroy();
    }

    app.exit(1);
  }
}

app.whenReady().then(main);
