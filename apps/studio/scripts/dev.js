#!/usr/bin/env node
// Serve app/ localmente para iteração rápida no browser e em dispositivos
// da mesma rede local. O bind explícito em 0.0.0.0 evita depender do
// comportamento implícito do Node e imprime os URLs LAN disponíveis.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', 'app');
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(String(req.url || '/').split('?')[0]);
  const filePath = path.join(ROOT, pathname === '/' ? 'my-studio.html' : pathname);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Z Studio a correr localmente em http://localhost:${PORT}`);
  const addresses = lanAddresses();
  if (addresses.length) {
    console.log('Abrir no telemóvel (mesma rede Wi-Fi):');
    addresses.forEach(address => console.log(`  http://${address}:${PORT}`));
  } else {
    console.log('Nenhum endereço IPv4 LAN encontrado neste momento.');
  }
  console.log('(Ctrl+C para parar)');
});
