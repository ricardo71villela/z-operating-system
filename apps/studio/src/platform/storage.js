// src/platform/storage.js — guardar ficheiros: caminho diferente em browser
// (<a download>) vs. contexto nativo Capacitor (@capacitor/filesystem).
// Depende de IS_NATIVE_PLATFORM e toast(), definidos em src/main.js — seguro
// por estarem no mesmo script final montado (declarações de topo já avaliadas
// antes de qualquer chamada destas funções, que só acontece por ação da
// pessoa a usar a app). Extraído na Phase 2 (continuação) da auditoria.

// ═══ platform/web vs platform/capacitor — saveBlob() ═══
// Em contexto nativo, "<a download>" não existe como conceito (não há
// pasta de transferências do browser) — usa-se o plugin oficial
// @capacitor/filesystem, acedido via window.Capacitor.Plugins (sem bundler,
// esta app não tem import de módulos ES, por isso usa-se o runtime global
// que o próprio Capacitor injeta na WebView nativa).
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function saveBlobNative(b, name) {
  const { Filesystem, Directory } = window.Capacitor.Plugins;
  const base64 = await blobToBase64(b);
  await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Documents });
  toast('Guardado em Documentos: ' + name);
}
function saveBlobWeb(b, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function saveBlob(b, name) {
  if (IS_NATIVE_PLATFORM && window.Capacitor?.Plugins?.Filesystem) {
    try { await saveBlobNative(b, name); return; }
    catch (e) { console.error('[platform/capacitor] Filesystem falhou, a usar fallback web:', e); }
  }
  saveBlobWeb(b, name);
}

