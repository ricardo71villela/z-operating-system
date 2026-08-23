// apps/api/src/db.ts
//
// Ponto único de escolha de repositório. Sem DATABASE_URL definida,
// mantém-se o comportamento histórico (store em memória) — nada muda
// para quem corre os testes sem base de dados. Com DATABASE_URL definida,
// a API passa a falar com Postgres real através de PgStore.

import { store as inMemoryStore, NotFoundError } from './store';
import { PgStore } from './pgStore';
import { ExplicitRequirementsPgStore } from './explicitRequirementsPgStore';

export const usingPostgres = !!process.env.DATABASE_URL;

export const store: typeof inMemoryStore | PgStore = usingPostgres
  ? new ExplicitRequirementsPgStore(process.env.DATABASE_URL as string)
  : inMemoryStore;

export { NotFoundError };
