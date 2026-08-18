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
