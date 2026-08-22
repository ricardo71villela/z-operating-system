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

// ============================================================
// ZSTUDIO_CONTENT_PERSISTENCE_V1
// Cloud project persistence + My Creations library.
//
// IndexedDB remains the offline/cache safety net. When authenticated, the
// durable authority becomes the user's private Studio project in Supabase.
// Opening a cloud project rehydrates the already-proven local draft format,
// avoiding a second renderer/state model.
// ============================================================
const ZSTUDIO_CONTENT_PERSISTENCE_V1 = true;
const ZSTUDIO_PROJECT_BUCKET = 'zstudio-projects';
const ZSTUDIO_CLOUD_BINDING_KEY = 'zstudio-cloud-project-v1';
const ZSTUDIO_CLOUD_OWNER_KEY = 'zstudio-cloud-owner-v1';
const ZSTUDIO_CLOUD_AUTOSAVE_MS = 2200;

const ZSTUDIO_CLOUD_STRINGS = Object.freeze({
  pt: {
    library: 'As minhas criações', newCreation: 'Nova criação', saveCurrent: 'Guardar criação atual',
    open: 'Abrir', archive: 'Arquivar', current: 'Atual', empty: 'Ainda não tens criações guardadas.',
    emptyHelp: 'Cria conteúdo no Studio e ele aparecerá aqui automaticamente.',
    saved: 'Guardado na cloud', saving: 'A guardar…', offline: 'Guardado localmente — cloud indisponível',
    restored: 'Criação recuperada', conflict: 'Foi encontrada uma versão mais recente. O teu trabalho foi preservado numa cópia recuperada.',
    archiveConfirm: 'Arquivar esta criação? Ela deixará de aparecer na biblioteca ativa.',
    close: 'Fechar', localReady: 'Existe um rascunho local que ainda não está associado à tua conta.',
    otherOwner: 'Este dispositivo contém um rascunho local de outra conta. Ele não será enviado para esta conta.',
    recoveredSuffix: '— cópia recuperada'
  },
  en: {
    library: 'My Creations', newCreation: 'New creation', saveCurrent: 'Save current creation',
    open: 'Open', archive: 'Archive', current: 'Current', empty: 'You do not have any saved creations yet.',
    emptyHelp: 'Create content in Studio and it will appear here automatically.',
    saved: 'Saved to cloud', saving: 'Saving…', offline: 'Saved locally — cloud unavailable',
    restored: 'Creation restored', conflict: 'A newer version was found. Your work was preserved as a recovered copy.',
    archiveConfirm: 'Archive this creation? It will leave your active library.',
    close: 'Close', localReady: 'A local draft is available but is not linked to your account yet.',
    otherOwner: 'This device contains a local draft from another account. It will not be uploaded to this account.',
    recoveredSuffix: '— recovered copy'
  },
  fr: {
    library: 'Mes créations', newCreation: 'Nouvelle création', saveCurrent: 'Enregistrer la création actuelle',
    open: 'Ouvrir', archive: 'Archiver', current: 'Actuelle', empty: 'Vous n’avez encore aucune création enregistrée.',
    emptyHelp: 'Créez du contenu dans Studio : il apparaîtra ici automatiquement.',
    saved: 'Enregistré dans le cloud', saving: 'Enregistrement…', offline: 'Enregistré localement — cloud indisponible',
    restored: 'Création récupérée', conflict: 'Une version plus récente existe. Votre travail a été conservé dans une copie récupérée.',
    archiveConfirm: 'Archiver cette création ? Elle quittera la bibliothèque active.',
    close: 'Fermer', localReady: 'Un brouillon local existe mais n’est pas encore lié à votre compte.',
    otherOwner: 'Cet appareil contient un brouillon local d’un autre compte. Il ne sera pas envoyé vers ce compte.',
    recoveredSuffix: '— copie récupérée'
  },
  es: {
    library: 'Mis creaciones', newCreation: 'Nueva creación', saveCurrent: 'Guardar creación actual',
    open: 'Abrir', archive: 'Archivar', current: 'Actual', empty: 'Todavía no tienes creaciones guardadas.',
    emptyHelp: 'Crea contenido en Studio y aparecerá aquí automáticamente.',
    saved: 'Guardado en la nube', saving: 'Guardando…', offline: 'Guardado localmente — nube no disponible',
    restored: 'Creación recuperada', conflict: 'Existe una versión más reciente. Tu trabajo se conservó como copia recuperada.',
    archiveConfirm: '¿Archivar esta creación? Dejará de aparecer en la biblioteca activa.',
    close: 'Cerrar', localReady: 'Hay un borrador local que aún no está asociado a tu cuenta.',
    otherOwner: 'Este dispositivo contiene un borrador local de otra cuenta. No se subirá a esta cuenta.',
    recoveredSuffix: '— copia recuperada'
  },
  de: {
    library: 'Meine Kreationen', newCreation: 'Neue Kreation', saveCurrent: 'Aktuelle Kreation speichern',
    open: 'Öffnen', archive: 'Archivieren', current: 'Aktuell', empty: 'Du hast noch keine gespeicherten Kreationen.',
    emptyHelp: 'Erstelle Inhalte in Studio; sie erscheinen automatisch hier.',
    saved: 'In der Cloud gespeichert', saving: 'Wird gespeichert…', offline: 'Lokal gespeichert — Cloud nicht verfügbar',
    restored: 'Kreation wiederhergestellt', conflict: 'Eine neuere Version wurde gefunden. Deine Arbeit wurde als wiederhergestellte Kopie gesichert.',
    archiveConfirm: 'Diese Kreation archivieren? Sie wird aus der aktiven Bibliothek entfernt.',
    close: 'Schließen', localReady: 'Ein lokaler Entwurf ist vorhanden, aber noch nicht mit deinem Konto verknüpft.',
    otherOwner: 'Dieses Gerät enthält einen lokalen Entwurf eines anderen Kontos. Er wird nicht in dieses Konto hochgeladen.',
    recoveredSuffix: '— wiederhergestellte Kopie'
  },
  it: {
    library: 'Le mie creazioni', newCreation: 'Nuova creazione', saveCurrent: 'Salva creazione attuale',
    open: 'Apri', archive: 'Archivia', current: 'Attuale', empty: 'Non hai ancora creazioni salvate.',
    emptyHelp: 'Crea contenuti in Studio e appariranno qui automaticamente.',
    saved: 'Salvato nel cloud', saving: 'Salvataggio…', offline: 'Salvato localmente — cloud non disponibile',
    restored: 'Creazione recuperata', conflict: 'È stata trovata una versione più recente. Il tuo lavoro è stato conservato come copia recuperata.',
    archiveConfirm: 'Archiviare questa creazione? Non apparirà più nella libreria attiva.',
    close: 'Chiudi', localReady: 'Esiste una bozza locale non ancora associata al tuo account.',
    otherOwner: 'Questo dispositivo contiene una bozza locale di un altro account. Non verrà caricata su questo account.',
    recoveredSuffix: '— copia recuperata'
  }
});

let zstudioCloudSession = null;
let zstudioCloudBinding = null;
let zstudioCloudAutosaveTimer = null;
let zstudioCloudFlushPromise = null;
let zstudioCloudHandledUserId = '';
let zstudioCloudLibraryUi = null;
let zstudioCloudLibraryUrls = [];
let zstudioCloudLastSignature = '';
let zstudioCloudPatched = false;

function zstudioCloudLang() {
  const lang = (typeof state === 'object' && state && state.lang) || 'en';
  return ZSTUDIO_CLOUD_STRINGS[lang] ? lang : 'en';
}
function zstudioCloudT(key) {
  const dict = ZSTUDIO_CLOUD_STRINGS[zstudioCloudLang()] || ZSTUDIO_CLOUD_STRINGS.en;
  return dict[key] || ZSTUDIO_CLOUD_STRINGS.en[key] || key;
}
function zstudioCloudToast(message) {
  if (typeof toast === 'function') toast(message);
}
function zstudioCloudFirst(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}
function zstudioCloudUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function zstudioCloudAssetExt(blob) {
  const type = String(blob?.type || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('webm')) return 'webm';
  if (type.includes('quicktime')) return 'mov';
  return type.startsWith('video/') ? 'bin' : 'jpg';
}
function zstudioCloudFingerprint(blob, kind) {
  if (!blob) return '';
  return [
    kind || 'photo', blob.size || 0, blob.type || '', blob.name || '', blob.lastModified || 0
  ].join(':');
}
function zstudioCloudAssetKind(blob) {
  return String(blob?.type || '').startsWith('video/') ? 'video' : 'photo';
}
function zstudioCloudProjectTitle(meta) {
  const contentTitle = String(meta?.content?.title || '').trim();
  const brandName = String(meta?.brand?.name || '').trim();
  return (contentTitle || brandName || 'Untitled creation').slice(0, 160);
}
function zstudioCloudSignature(meta, photos, logo) {
  return JSON.stringify(meta || {}) + '|' + (photos || []).map((b) => zstudioCloudFingerprint(b, zstudioCloudAssetKind(b))).join('|') + '|logo:' + zstudioCloudFingerprint(logo, 'logo');
}

function zstudioCloudSetStatus(text, tone) {
  const el = document.getElementById('zstudioCloudSyncStatus');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.tone = tone || 'quiet';
}

async function zstudioCloudClient() {
  if (typeof zstudioGetAuthClient !== 'function') throw new Error('AUTH_CLIENT_UNAVAILABLE');
  return zstudioGetAuthClient();
}

async function zstudioCloudReadLocalDraft() {
  const meta = await idbGet('meta').catch(() => null);
  if (!meta) return null;
  let photos = [];
  if (typeof state === 'object' && state && Array.isArray(state.photoFiles) && state.photoFiles.length) {
    photos = state.photoFiles.slice();
  } else {
    photos = (await idbGet('photos').catch(() => null)) || [];
  }
  let logo = null;
  if (typeof state === 'object' && state && state._customLogoFile) logo = state._customLogoFile;
  if (!logo) logo = await idbGet('logo').catch(() => null);
  return { meta, photos, logo };
}

async function zstudioCloudListProjects() {
  const client = await zstudioCloudClient();
  const { data, error } = await client.rpc('zstudio_list_projects');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function zstudioCloudSaveProjectRow(client, local, forceNew) {
  const uid = zstudioCloudSession?.user?.id || '';
  if (!uid) throw new Error('AUTH_REQUIRED');
  const title = zstudioCloudProjectTitle(local.meta);
  const bindingIsCurrent = !forceNew && zstudioCloudBinding?.ownerId === uid && zstudioCloudBinding?.projectId;
  const payload = {
    p_project_id: bindingIsCurrent ? zstudioCloudBinding.projectId : null,
    p_expected_revision: bindingIsCurrent ? Number(zstudioCloudBinding.revision || 0) : null,
    p_title: title,
    p_state: local.meta,
  };

  let { data, error } = await client.rpc('zstudio_save_project', payload);
  if (error && bindingIsCurrent && (error.code === '40001' || String(error.message || '').includes('ZSTUDIO_PROJECT_CONFLICT'))) {
    const recoveredTitle = (title + ' ' + zstudioCloudT('recoveredSuffix')).slice(0, 160);
    ({ data, error } = await client.rpc('zstudio_save_project', {
      p_project_id: null,
      p_expected_revision: null,
      p_title: recoveredTitle,
      p_state: local.meta,
    }));
    if (!error) zstudioCloudToast(zstudioCloudT('conflict'));
  }
  if (error) throw error;
  const row = zstudioCloudFirst(data);
  if (!row?.project_id) throw new Error('PROJECT_SAVE_RESPONSE_INVALID');
  return row;
}

function zstudioCloudFindReusableAsset(previousAssets, kind, fingerprint, usedPaths) {
  const candidates = Array.isArray(previousAssets) ? previousAssets : [];
  return candidates.find((a) =>
    a && a.kind === kind && a.fingerprint === fingerprint && a.path && !usedPaths.has(a.path)
  ) || null;
}

async function zstudioCloudUploadAsset(client, uid, projectId, blob, kind) {
  if (!blob) return null;
  if (Number(blob.size || 0) > 52428800) throw new Error('ASSET_TOO_LARGE');
  const folder = kind === 'logo' ? 'logo' : (kind === 'video' ? 'videos' : 'photos');
  const path = `${uid}/${projectId}/${folder}/${zstudioCloudUuid()}.${zstudioCloudAssetExt(blob)}`;
  const { error } = await client.storage.from(ZSTUDIO_PROJECT_BUCKET).upload(path, blob, {
    contentType: blob.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function zstudioCloudRegisterAsset(client, projectId, path, kind, position, blob) {
  const { error } = await client.rpc('zstudio_register_project_asset', {
    p_project_id: projectId,
    p_storage_path: path,
    p_kind: kind,
    p_position: position,
    p_mime_type: blob?.type || null,
    p_byte_size: Number(blob?.size || 0),
  });
  if (error) throw error;
}

async function zstudioCloudSyncAssets(client, uid, projectId, local, previousAssets) {
  const nextAssets = [];
  const keepPaths = [];
  const usedPaths = new Set();

  for (let i = 0; i < local.photos.length; i += 1) {
    const blob = local.photos[i];
    const kind = zstudioCloudAssetKind(blob);
    const fingerprint = zstudioCloudFingerprint(blob, kind);
    const reusable = zstudioCloudFindReusableAsset(previousAssets, kind, fingerprint, usedPaths);
    const path = reusable?.path || await zstudioCloudUploadAsset(client, uid, projectId, blob, kind);
    usedPaths.add(path);
    keepPaths.push(path);
    await zstudioCloudRegisterAsset(client, projectId, path, kind, i, blob);
    nextAssets.push({ path, kind, position: i, fingerprint });
  }

  if (local.logo) {
    const fingerprint = zstudioCloudFingerprint(local.logo, 'logo');
    const reusable = zstudioCloudFindReusableAsset(previousAssets, 'logo', fingerprint, usedPaths);
    const path = reusable?.path || await zstudioCloudUploadAsset(client, uid, projectId, local.logo, 'logo');
    usedPaths.add(path);
    keepPaths.push(path);
    await zstudioCloudRegisterAsset(client, projectId, path, 'logo', 0, local.logo);
    nextAssets.push({ path, kind: 'logo', position: 0, fingerprint });
  }

  const { data: removedData, error: pruneError } = await client.rpc('zstudio_prune_project_assets', {
    p_project_id: projectId,
    p_keep_paths: keepPaths,
  });
  if (pruneError) throw pruneError;

  let removed = Array.isArray(removedData) ? removedData : [];
  if (removed.length === 1 && Array.isArray(removed[0])) removed = removed[0];
  removed = removed.filter((p) => typeof p === 'string' && p.startsWith(uid + '/' + projectId + '/'));
  if (removed.length) await client.storage.from(ZSTUDIO_PROJECT_BUCKET).remove(removed).catch(() => {});

  const firstVisual = nextAssets.find((a) => a.kind === 'photo' || a.kind === 'video');
  const { error: coverError } = await client.rpc('zstudio_set_project_cover', {
    p_project_id: projectId,
    p_cover_asset_path: firstVisual?.path || null,
  });
  if (coverError) throw coverError;
  return nextAssets;
}

async function zstudioCloudFlush({ force = false, claim = false } = {}) {
  if (zstudioCloudFlushPromise) return zstudioCloudFlushPromise;
  zstudioCloudFlushPromise = (async () => {
    const session = zstudioCloudSession || (typeof zstudioAuthSession !== 'undefined' ? zstudioAuthSession : null);
    const uid = session?.user?.id || '';
    if (!uid) return false;
    zstudioCloudSession = session;

    const local = await zstudioCloudReadLocalDraft();
    if (!local) return false;

    const owner = await idbGet(ZSTUDIO_CLOUD_OWNER_KEY).catch(() => null);
    if (owner && owner !== uid && !claim) {
      zstudioCloudSetStatus(zstudioCloudT('otherOwner'), 'warn');
      return false;
    }
    if (!owner || claim) await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);

    const signature = zstudioCloudSignature(local.meta, local.photos, local.logo);
    if (!force && signature === zstudioCloudLastSignature && zstudioCloudBinding?.ownerId === uid) return true;

    zstudioCloudSetStatus(zstudioCloudT('saving'), 'busy');
    const client = await zstudioCloudClient();
    await zstudioEnsureStudioAccount(client);

    const row = await zstudioCloudSaveProjectRow(client, local, false);
    const sameProject = zstudioCloudBinding?.ownerId === uid && zstudioCloudBinding?.projectId === row.project_id;
    const previousAssets = sameProject ? (zstudioCloudBinding.assets || []) : [];
    const assets = await zstudioCloudSyncAssets(client, uid, row.project_id, local, previousAssets);

    zstudioCloudBinding = {
      ownerId: uid,
      projectId: row.project_id,
      revision: Number(row.revision || 1),
      updatedAt: row.updated_at || new Date().toISOString(),
      assets,
    };
    await idbSet(ZSTUDIO_CLOUD_BINDING_KEY, zstudioCloudBinding);
    await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
    zstudioCloudLastSignature = signature;
    zstudioCloudSetStatus(zstudioCloudT('saved'), 'ok');
    return true;
  })().catch((error) => {
    console.warn('[Z Studio cloud] sync falhou:', error);
    zstudioCloudSetStatus(zstudioCloudT('offline'), 'warn');
    return false;
  }).finally(() => {
    zstudioCloudFlushPromise = null;
  });
  return zstudioCloudFlushPromise;
}

function zstudioCloudSchedule() {
  clearTimeout(zstudioCloudAutosaveTimer);
  zstudioCloudAutosaveTimer = setTimeout(() => zstudioCloudFlush(), ZSTUDIO_CLOUD_AUTOSAVE_MS);
}

async function zstudioCloudDownloadAsset(client, path) {
  const { data, error } = await client.storage.from(ZSTUDIO_PROJECT_BUCKET).download(path);
  if (error) throw error;
  return data;
}

async function zstudioCloudOpenProject(projectId, { automatic = false } = {}) {
  const uid = zstudioCloudSession?.user?.id || '';
  if (!uid || !projectId) return false;
  const client = await zstudioCloudClient();
  const { data, error } = await client.rpc('zstudio_get_project', { p_project_id: projectId });
  if (error) throw error;
  const project = zstudioCloudFirst(data);
  if (!project?.project_id || !project?.state_json) throw new Error('PROJECT_LOAD_RESPONSE_INVALID');

  const manifest = Array.isArray(project.asset_manifest) ? project.asset_manifest : [];
  const visuals = manifest
    .filter((a) => a && (a.kind === 'photo' || a.kind === 'video') && a.path)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  const logoAsset = manifest.find((a) => a?.kind === 'logo' && a.path) || null;

  const photos = [];
  const bindingAssets = [];
  for (const asset of visuals) {
    const blob = await zstudioCloudDownloadAsset(client, asset.path);
    photos.push(blob);
    bindingAssets.push({
      path: asset.path,
      kind: asset.kind,
      position: Number(asset.position || 0),
      fingerprint: zstudioCloudFingerprint(blob, asset.kind),
    });
  }
  let logo = null;
  if (logoAsset) {
    logo = await zstudioCloudDownloadAsset(client, logoAsset.path);
    bindingAssets.push({
      path: logoAsset.path,
      kind: 'logo',
      position: 0,
      fingerprint: zstudioCloudFingerprint(logo, 'logo'),
    });
  }

  await idbSet('meta', project.state_json);
  if (photos.length) await idbSet('photos', photos); else await idbDelete('photos').catch(() => {});
  if (logo) await idbSet('logo', logo); else await idbDelete('logo').catch(() => {});
  zstudioCloudBinding = {
    ownerId: uid,
    projectId: project.project_id,
    revision: Number(project.revision || 1),
    updatedAt: project.updated_at || new Date().toISOString(),
    assets: bindingAssets,
  };
  await idbSet(ZSTUDIO_CLOUD_BINDING_KEY, zstudioCloudBinding);
  await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
  if (!automatic) zstudioCloudToast(zstudioCloudT('restored'));
  window.location.reload();
  return true;
}

function zstudioCloudRevokeLibraryUrls() {
  zstudioCloudLibraryUrls.forEach((u) => URL.revokeObjectURL(u));
  zstudioCloudLibraryUrls = [];
}

function zstudioCloudInjectStyles() {
  if (document.getElementById('zstudioCloudStyles')) return;
  const style = document.createElement('style');
  style.id = 'zstudioCloudStyles';
  style.textContent = `
    .zstudio-cloud-account{width:100%;margin:0 0 8px}
    .zstudio-cloud-sync{font-size:.67rem;line-height:1.45;color:var(--text3);margin:0 0 10px;min-height:1em}
    .zstudio-cloud-sync[data-tone="ok"]{color:#a9cbb9}.zstudio-cloud-sync[data-tone="warn"]{color:#d5ad7c}
    .zstudio-library-overlay{position:fixed;inset:0;z-index:1250;background:rgba(8,9,10,.88);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px}
    .zstudio-library-card{width:min(980px,100%);max-height:min(780px,90vh);overflow:auto;background:#111416;border:1px solid rgba(210,214,216,.18);border-radius:8px;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.58)}
    .zstudio-library-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
    .zstudio-library-title{font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:500;color:#f2f2ee}
    .zstudio-library-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
    .zstudio-library-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .zstudio-library-item{position:relative;border:1px solid rgba(210,214,216,.16);border-radius:7px;background:#0d1012;overflow:hidden;min-width:0}
    .zstudio-library-item.current{border-color:transparent;background:linear-gradient(#0d1012,#0d1012) padding-box,linear-gradient(90deg,rgba(255,92,113,.66),rgba(236,190,78,.62),rgba(95,194,145,.60),rgba(76,157,225,.62),rgba(139,104,220,.66)) border-box}
    .zstudio-library-cover{aspect-ratio:4/3;background:#171a1c;display:flex;align-items:center;justify-content:center;color:#697076;font-size:.68rem;overflow:hidden}
    .zstudio-library-cover img{width:100%;height:100%;object-fit:cover;display:block}
    .zstudio-library-meta{padding:12px}.zstudio-library-name{font-size:.83rem;color:#f0f1ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.zstudio-library-date{margin-top:5px;font-size:.63rem;color:#777f84}
    .zstudio-library-item-actions{display:flex;gap:7px;padding:0 12px 12px}.zstudio-library-item-actions .btn{flex:1;min-width:0;min-height:34px;font-size:.61rem}
    .zstudio-library-badge{position:absolute;top:8px;right:8px;padding:4px 7px;border-radius:999px;background:rgba(12,14,15,.86);border:1px solid rgba(255,255,255,.16);font-size:.56rem;color:#eef0ed;letter-spacing:.08em;text-transform:uppercase}
    .zstudio-library-empty{padding:42px 16px;text-align:center;border:1px dashed rgba(210,214,216,.16);border-radius:7px;color:#9ba1a5}.zstudio-library-empty strong{display:block;color:#e8eae7;font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:500;margin-bottom:5px}
    @media(max-width:760px){.zstudio-library-overlay{padding:10px;align-items:flex-end}.zstudio-library-card{max-height:88vh;border-radius:9px 9px 0 0;padding:16px}.zstudio-library-title{font-size:1.5rem}.zstudio-library-grid{grid-template-columns:1fr}.zstudio-library-actions .btn{flex:1}.zstudio-library-head{margin-bottom:14px}}
  `;
  document.head.appendChild(style);
}

function zstudioCloudBuildLibraryUi() {
  if (zstudioCloudLibraryUi) return zstudioCloudLibraryUi;
  zstudioCloudInjectStyles();
  const overlay = document.createElement('div');
  overlay.className = 'zstudio-library-overlay hide';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const card = document.createElement('section'); card.className = 'zstudio-library-card';
  const head = document.createElement('div'); head.className = 'zstudio-library-head';
  const title = document.createElement('h2'); title.className = 'zstudio-library-title';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-line';
  close.addEventListener('click', () => { overlay.classList.add('hide'); zstudioCloudRevokeLibraryUrls(); });
  head.append(title, close);
  const actions = document.createElement('div'); actions.className = 'zstudio-library-actions';
  const saveCurrent = document.createElement('button'); saveCurrent.type = 'button'; saveCurrent.className = 'btn btn-line';
  saveCurrent.addEventListener('click', async () => {
    const uid = zstudioCloudSession?.user?.id || '';
    if (!uid) return;
    await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
    const ok = await zstudioCloudFlush({ force: true, claim: true });
    if (ok) await zstudioCloudRenderLibrary();
  });
  const newCreation = document.createElement('button'); newCreation.type = 'button'; newCreation.className = 'btn btn-line';
  newCreation.addEventListener('click', async () => {
    await zstudioCloudFlush({ force: true });
    overlay.classList.add('hide');
    zstudioCloudRevokeLibraryUrls();
    if (typeof clearDraft === 'function') await clearDraft();
  });
  actions.append(saveCurrent, newCreation);
  const grid = document.createElement('div'); grid.className = 'zstudio-library-grid';
  card.append(head, actions, grid); overlay.appendChild(card); document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) { overlay.classList.add('hide'); zstudioCloudRevokeLibraryUrls(); } });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.classList.contains('hide')) { overlay.classList.add('hide'); zstudioCloudRevokeLibraryUrls(); } });
  zstudioCloudLibraryUi = { overlay, card, title, close, actions, saveCurrent, newCreation, grid };
  return zstudioCloudLibraryUi;
}

async function zstudioCloudLoadCover(client, path, coverEl) {
  if (!path || !coverEl) return;
  try {
    const blob = await zstudioCloudDownloadAsset(client, path);
    const url = URL.createObjectURL(blob); zstudioCloudLibraryUrls.push(url);
    const img = document.createElement('img'); img.src = url; img.alt = '';
    coverEl.textContent = ''; coverEl.appendChild(img);
  } catch (_error) { /* keep neutral placeholder */ }
}

async function zstudioCloudArchiveProject(projectId) {
  if (!confirm(zstudioCloudT('archiveConfirm'))) return;
  const client = await zstudioCloudClient();
  const { error } = await client.rpc('zstudio_archive_project', { p_project_id: projectId });
  if (error) throw error;
  if (zstudioCloudBinding?.projectId === projectId) {
    zstudioCloudBinding = null;
    await idbDelete(ZSTUDIO_CLOUD_BINDING_KEY).catch(() => {});
    zstudioCloudLastSignature = '';
  }
  await zstudioCloudRenderLibrary();
}

async function zstudioCloudRenderLibrary() {
  const ui = zstudioCloudBuildLibraryUi();
  ui.title.textContent = zstudioCloudT('library');
  ui.close.textContent = zstudioCloudT('close');
  ui.newCreation.textContent = '+ ' + zstudioCloudT('newCreation');
  ui.saveCurrent.textContent = zstudioCloudT('saveCurrent');
  const local = await zstudioCloudReadLocalDraft();
  const owner = await idbGet(ZSTUDIO_CLOUD_OWNER_KEY).catch(() => null);
  const uid = zstudioCloudSession?.user?.id || '';
  ui.saveCurrent.classList.toggle('hide', !local || (owner && owner !== uid) || (zstudioCloudBinding?.ownerId === uid && zstudioCloudBinding?.projectId));
  ui.grid.textContent = '';
  zstudioCloudRevokeLibraryUrls();

  const client = await zstudioCloudClient();
  const projects = await zstudioCloudListProjects();
  if (!projects.length) {
    const empty = document.createElement('div'); empty.className = 'zstudio-library-empty'; empty.style.gridColumn = '1 / -1';
    const strong = document.createElement('strong'); strong.textContent = zstudioCloudT('empty');
    const help = document.createElement('span'); help.textContent = zstudioCloudT('emptyHelp');
    empty.append(strong, help); ui.grid.appendChild(empty); return;
  }

  projects.forEach((project) => {
    const item = document.createElement('article'); item.className = 'zstudio-library-item';
    if (zstudioCloudBinding?.projectId === project.project_id) item.classList.add('current');
    const cover = document.createElement('div'); cover.className = 'zstudio-library-cover'; cover.textContent = 'Z Studio';
    const meta = document.createElement('div'); meta.className = 'zstudio-library-meta';
    const name = document.createElement('div'); name.className = 'zstudio-library-name'; name.textContent = project.title || 'Untitled creation';
    const date = document.createElement('div'); date.className = 'zstudio-library-date';
    try { date.textContent = new Intl.DateTimeFormat(zstudioCloudLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(project.updated_at)); }
    catch (_error) { date.textContent = String(project.updated_at || ''); }
    meta.append(name, date);
    if (zstudioCloudBinding?.projectId === project.project_id) {
      const badge = document.createElement('div'); badge.className = 'zstudio-library-badge'; badge.textContent = zstudioCloudT('current'); item.appendChild(badge);
    }
    const row = document.createElement('div'); row.className = 'zstudio-library-item-actions';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'btn btn-line'; open.textContent = zstudioCloudT('open');
    open.addEventListener('click', () => zstudioCloudOpenProject(project.project_id).catch((e) => { console.warn(e); zstudioCloudSetStatus(zstudioCloudT('offline'), 'warn'); }));
    const archive = document.createElement('button'); archive.type = 'button'; archive.className = 'btn btn-line'; archive.textContent = zstudioCloudT('archive');
    archive.addEventListener('click', () => zstudioCloudArchiveProject(project.project_id).catch((e) => console.warn(e)));
    row.append(open, archive); item.append(cover, meta, row); ui.grid.appendChild(item);
    if (project.cover_asset_path) zstudioCloudLoadCover(client, project.cover_asset_path, cover);
  });
}

async function zstudioCloudOpenLibrary() {
  if (!zstudioCloudSession?.user?.id) {
    if (typeof zstudioOpenAuth === 'function') zstudioOpenAuth();
    return;
  }
  const ui = zstudioCloudBuildLibraryUi();
  ui.overlay.classList.remove('hide');
  try { await zstudioCloudRenderLibrary(); }
  catch (error) { console.warn('[Z Studio cloud] library falhou:', error); zstudioCloudSetStatus(zstudioCloudT('offline'), 'warn'); }
}

function zstudioCloudInstallAccountEntry() {
  if (typeof zstudioBuildAuthUi !== 'function') return;
  const authUi = zstudioBuildAuthUi();
  if (!authUi?.signedStep || document.getElementById('zstudioMyCreationsButton')) return;
  const status = document.createElement('div'); status.id = 'zstudioCloudSyncStatus'; status.className = 'zstudio-cloud-sync'; status.setAttribute('aria-live', 'polite');
  const button = document.createElement('button'); button.id = 'zstudioMyCreationsButton'; button.type = 'button'; button.className = 'btn btn-line zstudio-cloud-account';
  button.addEventListener('click', zstudioCloudOpenLibrary);
  authUi.signedStep.insertBefore(status, authUi.signOut);
  authUi.signedStep.insertBefore(button, authUi.signOut);
  const refresh = () => { button.textContent = zstudioCloudT('library'); };
  refresh(); document.getElementById('langSwitch')?.addEventListener('change', refresh);
}

async function zstudioCloudHandleSession(session) {
  zstudioCloudSession = session || null;
  if (!session?.user?.id) {
    zstudioCloudHandledUserId = '';
    zstudioCloudSetStatus('', 'quiet');
    return;
  }
  const uid = session.user.id;
  if (zstudioCloudHandledUserId === uid) return;
  zstudioCloudHandledUserId = uid;
  try {
    const client = await zstudioCloudClient();
    await zstudioEnsureStudioAccount(client);
    zstudioCloudBinding = await idbGet(ZSTUDIO_CLOUD_BINDING_KEY).catch(() => null);
    const owner = await idbGet(ZSTUDIO_CLOUD_OWNER_KEY).catch(() => null);
    const local = await zstudioCloudReadLocalDraft();

    if (zstudioCloudBinding?.ownerId !== uid) zstudioCloudBinding = null;
    if (local && owner === uid) {
      zstudioCloudSetStatus(zstudioCloudT('saved'), 'ok');
      if (!zstudioCloudBinding) zstudioCloudSchedule();
      return;
    }
    if (local && owner && owner !== uid) {
      zstudioCloudSetStatus(zstudioCloudT('otherOwner'), 'warn');
      return;
    }

    const projects = await zstudioCloudListProjects();
    if (local && !owner) {
      if (!projects.length) {
        await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
        zstudioCloudSchedule();
      } else {
        zstudioCloudSetStatus(zstudioCloudT('localReady'), 'warn');
      }
      return;
    }
    if (!local && projects.length) {
      await zstudioCloudOpenProject(projects[0].project_id, { automatic: true });
      return;
    }
    zstudioCloudSetStatus(zstudioCloudT('saved'), 'ok');
  } catch (error) {
    console.warn('[Z Studio cloud] bootstrap falhou:', error);
    zstudioCloudSetStatus(zstudioCloudT('offline'), 'warn');
  }
}

function zstudioCloudPatchLifecycle() {
  if (zstudioCloudPatched) return;
  zstudioCloudPatched = true;

  if (typeof scheduleSaveDraft === 'function') {
    const originalScheduleSaveDraft = scheduleSaveDraft;
    scheduleSaveDraft = function zstudioCloudAwareScheduleSaveDraft() {
      originalScheduleSaveDraft();
      zstudioCloudSchedule();
    };
  }

  if (typeof saveBlob === 'function') {
    const originalSaveBlob = saveBlob;
    saveBlob = async function zstudioCloudAwareSaveBlob(blob, name) {
      const result = await originalSaveBlob(blob, name);
      zstudioCloudSchedule();
      return result;
    };
  }

  if (typeof clearDraft === 'function') {
    const originalClearDraft = clearDraft;
    clearDraft = async function zstudioCloudAwareClearDraft() {
      const uid = zstudioCloudSession?.user?.id || '';
      if (uid && await idbGet('meta').catch(() => null)) {
        await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
        await zstudioCloudFlush({ force: true, claim: true });
      }
      await originalClearDraft();
      const remaining = await idbGet('meta').catch(() => null);
      if (!remaining) {
        zstudioCloudBinding = null;
        zstudioCloudLastSignature = '';
        await idbDelete(ZSTUDIO_CLOUD_BINDING_KEY).catch(() => {});
        if (uid) await idbSet(ZSTUDIO_CLOUD_OWNER_KEY, uid);
      }
    };
  }

  if (typeof zstudioSignOut === 'function') {
    const originalSignOut = zstudioSignOut;
    zstudioSignOut = async function zstudioCloudAwareSignOut() {
      await zstudioCloudFlush({ force: true });
      return originalSignOut();
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !zstudioCloudSession?.user?.id) return;
    Promise.resolve(typeof saveDraft === 'function' ? saveDraft() : null)
      .then(() => zstudioCloudFlush({ force: true }))
      .catch(() => {});
  });
}

async function zstudioCloudBootstrap() {
  zstudioCloudInjectStyles();
  zstudioCloudInstallAccountEntry();
  zstudioCloudPatchLifecycle();
  try {
    const client = await zstudioCloudClient();
    client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => zstudioCloudHandleSession(session));
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await zstudioCloudHandleSession(data?.session || null);
  } catch (error) {
    console.warn('[Z Studio cloud] auth bootstrap indisponível:', error);
  }
}

window.ZStudioCloudPersistence = Object.freeze({
  authority: 'ZSTUDIO_CONTENT_PERSISTENCE_V1',
  flush: (options) => zstudioCloudFlush(options),
  openLibrary: zstudioCloudOpenLibrary,
  openProject: zstudioCloudOpenProject,
  listProjects: zstudioCloudListProjects,
});

setTimeout(zstudioCloudBootstrap, 0);
