import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Pasta de dados do proprietário: <base>/gurIA/Estudos/<sha256(owner)>.
// Se ela ainda não existe e há a pasta antiga <base>/OpenMAIC-Estudos/<hash>, copia uma vez.
// A pasta antiga nunca é alterada nem apagada (serve de rollback).
export function studyRoot(base: string, owner: string): string {
  const hash = createHash('sha256').update(owner).digest('hex');
  const current = path.join(base, 'gurIA', 'Estudos', hash);
  const legacy = path.join(base, 'OpenMAIC-Estudos', hash);
  if (!fs.existsSync(current) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.cpSync(legacy, current, { recursive: true, errorOnExist: true });
  }
  fs.mkdirSync(current, { recursive: true });
  return current;
}
