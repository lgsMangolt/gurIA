// Keep the Node-only startup graph out of the Edge instrumentation bundle.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.OPENMAIC_STUDY_LOCAL === 'true') {
      const startup = await import('./lib/study/startup');
      await startup.register();
    } else {
      const startup = await import('./instrumentation-node');
      await startup.register();
    }
  }
}
