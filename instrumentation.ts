// Partida do servidor: no Node, só confere o dono e o banco da gurIA.
// O import dinâmico mantém esse código fora do pacote do Edge.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const startup = await import('./lib/study/startup');
    await startup.register();
  }
}
