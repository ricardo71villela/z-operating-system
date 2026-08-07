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

/**
 * Disco local deste contentor — não é armazenamento de produção, é uma
 * implementação real e funcional da mesma interface que um adaptador
 * S3/Cloud Storage teria. Isolado por dono (ownerId) dentro do diretório
 * base, para que um bug num sítio não exponha ficheiros de outra pessoa
 * mesmo ao nível do sistema de ficheiros.
 */
export class LocalDiskFileStorageService implements FileStorageService {
  constructor(private readonly baseDir: string = '/tmp/zjobs-file-storage') {}

  async store(ownerId: string, fileName: string, contentBase64: string): Promise<StoredFile> {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) throw new FileTooLargeError(buffer.byteLength);

    const safeFileName = fileName.replace(/[^\w.\-]/g, '_').slice(0, 200);
    const storagePath = `${ownerId}/${randomUUID()}-${safeFileName}`;
    const fullPath = path.join(this.baseDir, storagePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return { storagePath, sizeBytes: buffer.byteLength };
  }

  async retrieve(storagePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(this.baseDir, storagePath));
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.baseDir, storagePath));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

export const fileStorageService: FileStorageService = new LocalDiskFileStorageService();
