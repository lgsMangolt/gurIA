const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** Kebab-case sem acentos, até 64 caracteres, nunca vazio. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug || 'item';
}

export function validateSkillName(slug: string): string | null {
  if (!slug) return 'Informe um nome para a skill.';
  if (slug.length > 64) return 'O nome da pasta da skill pode ter no máximo 64 caracteres.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    return 'Use só letras minúsculas, números e hífens (por exemplo, estatistica-basica).';
  if (RESERVED.test(slug)) return 'Este nome é reservado pelo Windows. Escolha outro.';
  return null;
}

/** Nome de arquivo seguro e único por id: `<rótulo>-<4 hex do id>.md`. */
export function conceptFileName(concept: { id: string; label: string }): string {
  const base = slugify(concept.label).slice(0, 50).replace(/-+$/, '') || 'conceito';
  // FNV-1a de 32 bits: sem dependência do Node, para o cliente também poder importar este módulo.
  let h = 0x811c9dc5;
  for (const ch of concept.id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const hash = h.toString(16).padStart(8, '0').slice(0, 4);
  return `${base}-${hash}.md`;
}
