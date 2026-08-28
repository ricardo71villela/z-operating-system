#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const target = path.resolve(__dirname, process.argv[2] || '../app/my-studio.html');

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
  })()`);
}

(async () => {
  app.commandLine.appendSwitch('disable-gpu');
  await app.whenReady();

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadFile(target);
  await win.webContents.executeJavaScript(`localStorage.removeItem('zstudio-app-theme-v1')`);
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
  `);

  const light = await snapshot(win);
  const eventCount = await win.webContents.executeJavaScript('window.__zstudioThemeEvents');
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

  await win.webContents.executeJavaScript(`document.getElementById('btnAppTheme').click()`);
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

  win.destroy();
  await app.quit();
})().catch(async (error) => {
  console.error(error.stack || error);
  try { await app.quit(); } catch (_) {}
  process.exitCode = 1;
});
