// O dono dos dados na gurIA: uma instalação pessoal, com um único dono fixo.
// Substitui a identidade do OpenMAIC (cookie anônimo, código de acesso, times).
// OWNER_SINGLE_USER=true liga o modo; OWNER_SINGLE_USER_ID escolhe o id
// (padrão study-local, o dono dos dados atuais).
import type { NextRequest } from 'next/server';

export const DEFAULT_OWNER_ID = 'study-local';
const OWNER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

type Env = Record<string, string | undefined>;

function readBoolean(env: Env, name: string): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} deve ser "true", "1", "false" ou "0"; veio ${JSON.stringify(env[name])}.`);
}

/** O id do dono, ou null quando o modo de dono único está desligado. */
export function resolveOwnerId(env: Env = process.env): string | null {
  if (!readBoolean(env, 'OWNER_SINGLE_USER')) return null;
  const ownerId = env.OWNER_SINGLE_USER_ID?.trim() || DEFAULT_OWNER_ID;
  if (!OWNER_ID_PATTERN.test(ownerId))
    throw new Error(
      `OWNER_SINGLE_USER_ID deve ter de 1 a 128 caracteres entre [A-Za-z0-9._-]; veio ${JSON.stringify(ownerId)}.`,
    );
  return ownerId;
}

export type StudyOwner = { ownerId: string };

/**
 * Roda o handler da rota com o dono e os cabeçalhos da resposta. Sem dono, 401.
 * Um erro que escapa do handler vira 500 com os mesmos cabeçalhos.
 */
export async function withRequestOwner(
  _req: NextRequest | Request,
  handler: (owner: StudyOwner, headers: Headers) => Promise<Response>,
): Promise<Response> {
  const ownerId = resolveOwnerId();
  if (!ownerId)
    return Response.json(
      { error: { code: 'NO_OWNER', message: 'A gurIA precisa de OWNER_SINGLE_USER=true.' } },
      { status: 401 },
    );
  const headers = new Headers();
  try {
    return await handler({ ownerId }, headers);
  } catch (error) {
    console.error('[gurIA] erro não tratado na rota de estudo', error);
    return new Response('Erro interno', { status: 500, headers });
  }
}
