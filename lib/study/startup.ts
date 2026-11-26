import { resolveOwnerId } from './owner';
// Partida da gurIA: só confere que há um dono e um banco. A edição pessoal não
// tem os workers de geração/extração nem a antiga Área Pro do OpenMAIC.
export async function register() {
  if (!resolveOwnerId() || !process.env.DATABASE_URL)
    throw new Error('gurIA requer identidade pessoal e banco local.');
}
