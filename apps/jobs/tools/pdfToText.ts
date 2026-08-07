// tools/pdfToText.ts
//
// Estágio 1 do parser de BTE: PDF -> texto bruto.
//
// AVISO HONESTO: este ficheiro usa `pdf-parse` (biblioteca standard,
// instalada em tools/node_modules) da forma habitual — não há nada de
// especial aqui. NÃO foi possível testá-lo de ponta a ponta neste
// ambiente porque a rede do sandbox só permite acesso a registos de
// pacotes (npm, pypi, etc.), não a bte.gep.msess.gov.pt diretamente a
// partir de código Node — só a ferramenta de fetch do próprio Claude
// consegue lá chegar, e essa devolve texto já extraído, não os bytes
// brutos do PDF. Por isso este estágio está escrito de forma correta e
// standard, mas por testar em execução real — ao contrário do estágio 2
// (parseBteSalaryTable.ts), que está testado a sério contra texto real.
//
// Para usar num ambiente com rede completa:
//   const buffer = await (await fetch(pdfUrl)).arrayBuffer();
//   const text = await extractTextFromPdf(Buffer.from(buffer));

import pdfParse from 'pdf-parse';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

export async function extractTextFromPdfPath(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  return extractTextFromPdf(buffer);
}
