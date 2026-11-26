// Impressão digital de uma fonte: reconhece o mesmo arquivo ao reimportar,
// mesmo que a pasta de origem tenha mudado de lugar.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export async function fingerprintFile(root: string, file: string): Promise<string> {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const content = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(file)
      .on('data', (chunk) => content.update(chunk))
      .on('end', () => resolve())
      .on('error', reject);
  });
  const size = fs.statSync(file).size;
  return createHash('sha256')
    .update(`${rel}\0${size}\0${content.digest('hex')}`)
    .digest('hex');
}

export function fingerprintYoutube(videoId: string): string {
  return `yt:${videoId}`;
}
