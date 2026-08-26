#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || '../app/my-studio.html';
const file = path.resolve(__dirname, target);
const html = fs.readFileSync(file, 'utf8');

const checks = [
  ['cloud persistence authority', 'ZSTUDIO_CONTENT_PERSISTENCE_V1'],
  ['private project bucket', "zstudio-projects"],
  ['save project RPC', "zstudio_save_project"],
  ['list projects RPC', "zstudio_list_projects"],
  ['get project RPC', "zstudio_get_project"],
  ['asset registration RPC', "zstudio_register_project_asset"],
  ['asset pruning RPC', "zstudio_prune_project_assets"],
  ['cover RPC', "zstudio_set_project_cover"],
  ['archive RPC', "zstudio_archive_project"],
  ['public cloud API', 'window.ZStudioCloudPersistence'],
  ['autosave lifecycle patch', 'zstudioCloudAwareScheduleSaveDraft'],
  ['export persistence patch', 'zstudioCloudAwareSaveBlob'],
  ['new-creation safety patch', 'zstudioCloudAwareClearDraft'],
  ['sign-out flush patch', 'zstudioCloudAwareSignOut'],
  ['cross-device restoration', 'zstudioCloudOpenProject'],
  ['optimistic conflict recovery', 'ZSTUDIO_PROJECT_CONFLICT'],
  ['English library label', 'My Creations'],
  ['Portuguese library label', 'As minhas criações'],
  ['French library label', 'Mes créations'],
  ['Spanish library label', 'Mis creaciones'],
  ['German library label', 'Meine Kreationen'],
  ['Italian library label', 'Le mie creazioni'],
];

let passed = 0;
for (const [label, needle] of checks) {
  if (!html.includes(needle)) {
    console.error(`❌ ${label}: missing ${JSON.stringify(needle)}`);
    process.exitCode = 1;
  } else {
    passed += 1;
    console.log(`✅ ${label}`);
  }
}

if (/service_role\s*[:=]/i.test(html) || /SUPABASE_SERVICE_ROLE/i.test(html)) {
  console.error('❌ browser artifact must not embed a Supabase service-role credential');
  process.exitCode = 1;
} else {
  passed += 1;
  console.log('✅ browser artifact has no service-role credential marker');
}

if (process.exitCode) {
  console.error(`Z STUDIO CONTENT PERSISTENCE CONTRACT = FAIL (${passed}/${checks.length + 1})`);
  process.exit(process.exitCode);
}
console.log(`Z STUDIO CONTENT PERSISTENCE CONTRACT = PASS (${passed}/${checks.length + 1})`);
