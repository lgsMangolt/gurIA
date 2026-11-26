// Extração segura de zip: confere todas as entradas antes de escrever qualquer coisa
// (nomes que saem da pasta, número de arquivos, tamanho) e conta os bytes reais.
import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { AppError } from '../runtime/analysis';

export const ZIP_LIMITS = { maxBytes: 2 * 1024 ** 3, maxFiles: 20000 };
type Limits = { maxBytes: number; maxFiles: number };

function open(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    // decodeStrings: false para a própria gurIA validar os nomes (e dizer por que recusou).
    yauzl.open(file, { lazyEntries: true, decodeStrings: false }, (err, zip) =>
      err || !zip
        ? reject(new AppError(400, 'ZIP_INVALIDO', 'O arquivo não é um zip válido.'))
        : resolve(zip),
    ),
  );
}

const nameOf = (entry: yauzl.Entry) =>
  Buffer.isBuffer(entry.fileName) ? (entry.fileName as Buffer).toString('utf8') : entry.fileName;

function entries(
  zip: yauzl.ZipFile,
  onEntry: (e: yauzl.Entry, name: string) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) =>
      onEntry(entry, nameOf(entry)).then(
        () => zip.readEntry(),
        (e) => {
          zip.close();
          reject(e);
        },
      ),
    );
    zip.on('end', () => resolve());
    zip.on('error', () => reject(new AppError(400, 'ZIP_INVALIDO', 'O zip está corrompido.')));
    zip.readEntry();
  });
}

const tooBig = () =>
  new AppError(413, 'ZIP_GRANDE', 'O zip é grande demais (limite de 2 GB e 20.000 arquivos).');

function unsafe(name: string): boolean {
  const parts = name.split(/[\\/]/);
  return path.isAbsolute(name) || /^[a-zA-Z]:/.test(name) || parts.includes('..');
}

export async function extractZip(
  zipFile: string,
  dest: string,
  limits: Limits = ZIP_LIMITS,
): Promise<{ files: number; bytes: number }> {
  let files = 0,
    declared = 0;
  await entries(await open(zipFile), async (entry, name) => {
    if (unsafe(name))
      throw new AppError(
        400,
        'ZIP_INSEGURO',
        'O zip tem um caminho que sai da pasta e foi recusado.',
      );
    if (name.endsWith('/')) return;
    files++;
    declared += entry.uncompressedSize;
    if (files > limits.maxFiles || declared > limits.maxBytes) throw tooBig();
  });

  let bytes = 0;
  try {
    const zip = await open(zipFile);
    await entries(zip, async (entry, name) => {
      const target = path.join(dest, name);
      if (name.endsWith('/')) {
        fs.mkdirSync(target, { recursive: true });
        return;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream)
            return reject(new AppError(400, 'ZIP_INVALIDO', 'O zip está corrompido.'));
          const out = fs.createWriteStream(target);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > limits.maxBytes) stream.destroy(tooBig());
          });
          stream.on('error', (e) => {
            out.destroy();
            reject(
              e instanceof AppError
                ? e
                : new AppError(400, 'ZIP_INVALIDO', 'O zip está corrompido.'),
            );
          });
          out.on('error', reject);
          out.on('finish', () => resolve());
          stream.pipe(out);
        });
      });
    });
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }
  return { files, bytes };
}
