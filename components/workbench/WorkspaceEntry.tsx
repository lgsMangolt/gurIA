import { WorkspaceShell } from '@/components/workbench/workspace/WorkspaceShell';
import { BrandProvider } from '@/lib/brand/brand-context';

/** Integration seam for the independently landed workspace-shell slice. */
export function WorkspaceEntry() {
  if (process.env.OPENMAIC_STUDY_LOCAL === 'true') {
    return <BrandProvider brand={{ productName: 'gurIA', shortName: 'gurIA', logoSrc: '/study/gurIA-logo.svg', logoHasWordmark: true, markSrc: '/study/gurIA-mark.svg', themeColor: '#222222' }}><WorkspaceShell /></BrandProvider>;
  }
  return <WorkspaceShell />;
}
