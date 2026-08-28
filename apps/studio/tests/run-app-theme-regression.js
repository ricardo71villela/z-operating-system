#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const targetFile = (() => {
  const idx = process.argv.findIndex(a => path.resolve(a) === path.resolve(__filename));
  return (idx >= 0 && process.argv[idx + 1]) || 'my-studio.html';
})();
const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(process.cwd(), targetFile);
const targetDir = path.dirname(targetPath);
const targetName = path.basename(targetPath);

if (!fs.existsSync(targetPath)) {
  console.error('❌ Não encontrei o ficheiro: ' + targetPath);
  process.exit(1);
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

function startServer(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(dir, pathname);
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(filePath);
        const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitForLoad(win) {
  return new Promise((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onFail = (_event, code, desc) => { cleanup(); reject(new Error(`load failed ${code}: ${desc}`)); };
    const cleanup = () => {
      win.webContents.removeListener('did-finish-load', onDone);
      win.webContents.removeListener('did-fail-load', onFail);
    };
    win.webContents.once('did-finish-load', onDone);
    win.webContents.once('did-fail-load', onFail);
  });
}

async function reload(win) {
  const pending = waitForLoad(win);
  win.reload();
  await pending;
}

async function snapshot(win) {
  return win.webContents.executeJavaScript(`(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const button = document.getElementById('btnAppTheme');
    const postBg = document.querySelector('#bgSeg button.active')?.dataset.bg || null;
    return {
      theme: root.getAttribute('data-zstudio-app-theme'),
      stored: localStorage.getItem('zstudio-app-theme-v1'),
      black: style.getPropertyValue('--black').trim().toUpperCase(),
      surface: style.getPropertyValue('--surface').trim().toUpperCase(),
      text: style.getPropertyValue('--text').trim().toUpperCase(),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null,
      statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') || null,
      buttonExists: !!button,
      pressed: button?.getAttribute('aria-pressed') || null,
      shellControl: button?.dataset.productShellControl || null,
      postBg,
      api: !!window.ZStudioAppTheme,
    };
  })()`, true);
}

async function main() {
  const server = await startServer(targetDir);
  const port = server.address().port;
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      sandbox: false,
    },
  });
  win.setContentSize(1440, 900, false);
  win.webContents.setZoomFactor(1);
  win.webContents.setFrameRate(30);
  win.webContents.on('paint', () => {});

  try {
    await win.loadURL('http://127.0.0.1:' + port + '/' + targetName);
    await win.webContents.executeJavaScript(`localStorage.removeItem('zstudio-app-theme-v1')`, true);
    await reload(win);

    const dark = await snapshot(win);
    assert.strictEqual(dark.theme, 'dark', 'default app theme must remain dark');
    assert.strictEqual(dark.stored, null, 'default dark boot must not require persistence');
    assert.strictEqual(dark.black, '#090A0B', 'dark background authority changed');
    assert.strictEqual(dark.surface, '#111315', 'dark surface authority changed');
    assert.strictEqual(dark.text, '#F2F2EF', 'dark text authority changed');
    assert.strictEqual(dark.themeColor.toUpperCase(), '#0A0A0A');
    assert.strictEqual(dark.statusBar, 'black-translucent');
    assert.strictEqual(dark.buttonExists, true, 'app theme toggle missing');
    assert.strictEqual(dark.pressed, 'false');
    assert.strictEqual(dark.shellControl, 'app-theme');
    assert.strictEqual(dark.api, true, 'window.ZStudioAppTheme API missing');

    await win.webContents.executeJavaScript(`
      window.__zstudioThemeEvents = 0;
      window.addEventListener('zstudio:app-theme-change', () => window.__zstudioThemeEvents++);
      document.getElementById('btnAppTheme').click();
    `, true);

    const light = await snapshot(win);
    const eventCount = await win.webContents.executeJavaScript('window.__zstudioThemeEvents', true);
    assert.strictEqual(light.theme, 'light');
    assert.strictEqual(light.stored, 'light');
    assert.strictEqual(light.black, '#F4F3EF');
    assert.strictEqual(light.surface, '#FFFFFF');
    assert.strictEqual(light.text, '#171819');
    assert.strictEqual(light.themeColor.toUpperCase(), '#F4F3EF');
    assert.strictEqual(light.statusBar, 'default');
    assert.strictEqual(light.pressed, 'true');
    assert.strictEqual(light.postBg, dark.postBg, 'app theme must not mutate post background selection');
    assert.strictEqual(eventCount, 1, 'theme change event must fire exactly once');

    await reload(win);
    const persisted = await snapshot(win);
    assert.strictEqual(persisted.theme, 'light', 'light app theme must survive reload');
    assert.strictEqual(persisted.stored, 'light');
    assert.strictEqual(persisted.postBg, dark.postBg, 'reload under light app theme must preserve independent post background');

    await win.webContents.executeJavaScript(`document.getElementById('btnAppTheme').click()`, true);
    const darkAgain = await snapshot(win);
    assert.strictEqual(darkAgain.theme, 'dark');
    assert.strictEqual(darkAgain.stored, 'dark');
    assert.strictEqual(darkAgain.black, '#090A0B');
    assert.strictEqual(darkAgain.surface, '#111315');
    assert.strictEqual(darkAgain.text, '#F2F2EF');
    assert.strictEqual(darkAgain.themeColor.toUpperCase(), '#0A0A0A');
    assert.strictEqual(darkAgain.postBg, dark.postBg, 'returning to dark app theme must not mutate post background');

    console.log('Z_STUDIO_APP_DARK_THEME_RUNTIME=PASS');
    console.log('Z_STUDIO_APP_LIGHT_THEME_RUNTIME=PASS');
    console.log('Z_STUDIO_APP_THEME_TOGGLE=PASS');
    console.log('Z_STUDIO_APP_THEME_PERSISTENCE=PASS');
    console.log('Z_STUDIO_APP_THEME_POST_BG_INDEPENDENCE=PASS');
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    app.exit(1);
  } finally {
    server.close();
  }
}

app.whenReady().then(main);
