// apps/api/src/fileStorageService.ts
//
// Abstração de armazenamento de ficheiros — genuína, não uma simulação
// vazia. A implementação de disco local GRAVA E LÊ bytes reais, testável
// de ponta a ponta. O que não existe é um fornecedor de nuvem real por
// trás (S3, Cloud Storage, etc.) — o dia em que houver um, troca-se só
// a implementação desta interface, nenhum ponto de chamada muda.

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export interface StoredFile {
  storagePath: string; // identificador opaco — quem chama nunca deve construir isto à mão
  sizeBytes: number;
}

export interface FileStorageService {
  /** contentBase64 pode vir vazio (string "") — nesse caso, guarda-se um ficheiro vazio, nunca se rejeita silenciosamente. */
  store(ownerId: string, fileName: string, contentBase64: string): Promise<StoredFile>;
  retrieve(storagePath: string): Promise<Buffer | null>;
  delete(storagePath: string): Promise<void>;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — limite arbitrário mas real, aplicado

export class FileTooLargeError extends Error {
  constructor(sizeBytes: number) {
    super(`ficheiro com ${sizeBytes} bytes excede o limite de ${MAX_FILE_SIZE_BYTES} bytes`);
  }
}

export class InvalidStoragePathError extends Error {
  constructor() {
    super('storage path inválido');
  }
}

/**
 * Disco local deste contentor — não é armazenamento de produção, é uma
 * implementação real e funcional da mesma interface que um adaptador
 * S3/Cloud Storage teria. Isolado por dono (ownerId) dentro do diretório
 * base, para que um bug num sítio não exponha ficheiros de outra pessoa
 * mesmo ao nível do sistema de ficheiros.
 */
export class LocalDiskFileStorageService implements FileStorageService {
  constructor(private readonly baseDir: string = '/tmp/zjobs-file-storage') {}

  /**
   * storagePath é um identificador relativo opaco, nunca um caminho absoluto.
   * Qualquer tentativa de sair de baseDir é rejeitada antes de tocar no disco.
   */
  private resolveStoragePath(storagePath: string): string {
    if (!storagePath || path.isAbsolute(storagePath)) {
      throw new InvalidStoragePathError();
    }

    const base = path.resolve(this.baseDir);
    const resolved = path.resolve(base, storagePath);

    if (resolved === base || !resolved.startsWith(`${base}${path.sep}`)) {
      throw new InvalidStoragePathError();
    }

    return resolved;
  }

  async store(ownerId: string, fileName: string, contentBase64: string): Promise<StoredFile> {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) throw new FileTooLargeError(buffer.byteLength);

    const safeFileName = fileName.replace(/[^\w.\-]/g, '_').slice(0, 200);
    const storagePath = `${ownerId}/${randomUUID()}-${safeFileName}`;
    const fullPath = this.resolveStoragePath(storagePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return { storagePath, sizeBytes: buffer.byteLength };
  }

  async retrieve(storagePath: string): Promise<Buffer | null> {
    const fullPath = this.resolveStoragePath(storagePath);

    try {
      return await fs.readFile(fullPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.resolveStoragePath(storagePath);

    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

/** Same identifier rules as the local disk: relative, no "..", no leading slash. */
function assertSafeStoragePath(storagePath: string) {
  if (!storagePath || storagePath.startsWith('/') || storagePath.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new InvalidStoragePathError();
  }
}

/**
 * Supabase Storage, private bucket (migration
 * 20261023020000_z_jobs_candidate_documents_bucket). The API talks to it
 * with the server-side secret key only; there are no Storage policies, so
 * nobody can reach the files except through the API's own checks (owner or
 * platform staff, see /candidates/:id/documents/:docId/download).
 * Files survive deploys and serverless instances, unlike the local disk.
 */
export class SupabaseStorageFileStorageService implements FileStorageService {
  private readonly client;

  constructor(projectUrl: string, secretKey: string, private readonly bucket: string) {
    this.client = createClient(projectUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }

  async store(ownerId: string, fileName: string, contentBase64: string): Promise<StoredFile> {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) throw new FileTooLargeError(buffer.byteLength);
    const safeFileName = fileName.replace(/[^\w.\-]/g, '_').slice(0, 200);
    const storagePath = `${ownerId}/${randomUUID()}-${safeFileName}`;
    assertSafeStoragePath(storagePath);
    const { error } = await this.client.storage.from(this.bucket).upload(storagePath, buffer, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return { storagePath, sizeBytes: buffer.byteLength };
  }

  async retrieve(storagePath: string): Promise<Buffer | null> {
    assertSafeStoragePath(storagePath);
    const { data, error } = await this.client.storage.from(this.bucket).download(storagePath);
    if (error) {
      const status = (error as any).statusCode ?? (error as any).status;
      if (String(status) === '404' || /not found/i.test(error.message)) return null;
      throw new Error(`Supabase Storage download failed: ${error.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(storagePath: string): Promise<void> {
    assertSafeStoragePath(storagePath);
    const { error } = await this.client.storage.from(this.bucket).remove([storagePath]);
    if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
  }
}

export const CANDIDATE_DOCUMENTS_BUCKET = 'jobs-candidate-documents';

/**
 * Supabase Storage when the API runs against the shared ZOS database with
 * its server-side key (production); the local disk otherwise (development,
 * CI). JOBS_FILE_STORAGE=local forces the local disk.
 */
export function createFileStorageService(env: NodeJS.ProcessEnv = process.env): FileStorageService {
  const projectUrl = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.JOBS_FILE_STORAGE !== 'local' && env.JOBS_DB_SCHEMA?.trim() === 'jobs' && projectUrl && secretKey) {
    return new SupabaseStorageFileStorageService(projectUrl, secretKey, env.JOBS_DOCUMENTS_BUCKET || CANDIDATE_DOCUMENTS_BUCKET);
  }
  return new LocalDiskFileStorageService();
}

export const fileStorageService: FileStorageService = createFileStorageService();
