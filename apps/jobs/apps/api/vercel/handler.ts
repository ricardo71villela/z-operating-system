// apps/api/vercel/handler.ts — entrada da API do Z Jobs na Vercel.
//
// Uma única Node Function recebe todos os caminhos (config.json do
// Build Output gerado por build.mjs) e entrega o pedido, sem tocar no
// corpo, ao mesmo servidor que os testes usam (src/server.ts).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from '../src/server';

let server: ReturnType<typeof createServer> | undefined;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  server ??= createServer();
  server.emit('request', req, res);
}
