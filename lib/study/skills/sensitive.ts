export type Finding = {
  file: string;
  line: number;
  kind: 'chave' | 'email' | 'caminho' | 'cpf' | 'telefone' | 'injecao';
  severity: 'bloqueia' | 'avisa';
  excerpt: string;
};

// Quantificadores limitados em tudo que pode casar com texto comum: sem backtracking quadrático.
const RULES: { kind: Finding['kind']; severity: Finding['severity']; re: RegExp }[] = [
  { kind: 'chave', severity: 'bloqueia', re: /\bsk-[A-Za-z0-9_-]{20,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bsk_live_[A-Za-z0-9]{16,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bgh[pousr]_[A-Za-z0-9]{20,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bgithub_pat_[A-Za-z0-9_]{20,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bglpat-[A-Za-z0-9_-]{20,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bxox[baprs]-[A-Za-z0-9-]{10,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bhf_[A-Za-z0-9]{30,200}/g },
  { kind: 'chave', severity: 'bloqueia', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'chave', severity: 'bloqueia', re: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/g },
  {
    kind: 'chave',
    severity: 'bloqueia',
    re: /\beyJ[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{5,500}/g,
  },
  { kind: 'chave', severity: 'bloqueia', re: /\bBearer\s{1,4}[A-Za-z0-9._~+/=-]{20,300}/g },
  {
    kind: 'chave',
    severity: 'bloqueia',
    re: /[?&](?:token|key|secret|password)=[^\s&)"']{1,300}/gi,
  },
  {
    kind: 'chave',
    severity: 'avisa',
    re: /\b(?:password|passwd|senha|secret)\s{0,3}[:=]\s{0,3}\S{6,200}/gi,
  },
  { kind: 'email', severity: 'avisa', re: /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,5}/g },
  { kind: 'caminho', severity: 'avisa', re: /[A-Za-z]:[\\/]Users[\\/][^\s\\/]{1,100}/gi },
  { kind: 'caminho', severity: 'avisa', re: /\/Users\/[^\s/]{1,100}/g },
  { kind: 'caminho', severity: 'avisa', re: /\/home\/[^\s/]{1,100}/g },
  { kind: 'cpf', severity: 'avisa', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { kind: 'telefone', severity: 'avisa', re: /(?:\(\d{2}\)\s?|\b\d{2}\s)9?\d{4}-\d{4}\b/g },
  {
    kind: 'injecao',
    severity: 'avisa',
    re: /(?:ignore|desconsidere|esque[cç]a)\s{1,4}(?:todas\s{1,4})?as\s{1,4}instru[cç][õo]es|ignore\s{1,4}(?:all\s{1,4}|the\s{1,4})?previous\s{1,4}instructions|disregard\s{1,4}(?:all\s{1,4}|the\s{1,4})?(?:previous|above)/gi,
  },
];

const mask = (kind: Finding['kind'], match: string) =>
  kind === 'chave' ? match.slice(0, 4) + '…[oculto]' : match.slice(0, 40);

export function scanSensitive(files: Record<string, string>): Finding[] {
  const found: Finding[] = [];
  for (const [file, text] of Object.entries(files)) {
    text.split('\n').forEach((line, index) => {
      for (const rule of RULES) {
        for (const match of line.matchAll(rule.re))
          found.push({
            file,
            line: index + 1,
            kind: rule.kind,
            severity: rule.severity,
            excerpt: mask(rule.kind, match[0]),
          });
      }
    });
  }
  return found;
}
