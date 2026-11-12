import { resolveSingleUserOwnerId } from '@/lib/server/identity/single-user';
// The personal edition has no upstream paid generation/extraction workers.
// PostgreSQL's own schema/version checks still run when its provider initializes.
export async function register() {
  if (!resolveSingleUserOwnerId() || !process.env.DATABASE_URL)
    throw new Error('OpenMAIC Estudos requer identidade pessoal e banco local.');
  if (process.env.OPENMAIC_STUDY_PRO_CODEX === 'true') {
    const { startAgentEventNotifyBus } = await import('@/lib/server/agent-runtime/event-notify-bus');
    const { startAgentRunner } = await import('@/lib/server/agent-runtime/runner');
    const bus = startAgentEventNotifyBus();
    const runner = startAgentRunner();
    const shutdown = async () => { await runner.stop(); await bus.stop(); };
    process.once('SIGTERM', () => void shutdown());
    process.once('SIGINT', () => void shutdown());
  }
}
