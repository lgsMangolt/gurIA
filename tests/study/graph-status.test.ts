import { expect, it } from 'vitest';
import { graphStatus } from '@/lib/study/graph-status';
import type { Concept } from '@/lib/study/domain';
const now=Date.now();
const base:Concept={id:'a',label:'A',summary:'',note:'',origin:'manual',courseIds:[],evidence:[],attempts:[],due:0};
it('keeps unpracticed concepts neutral even if their due timestamp is past',()=>expect(graphStatus({...base,due:now-1000},now)).toBe('new'));
it('distinguishes scheduled learning from due review without granting mastery for one answer',()=>{
 const n={...base,attempts:[{at:now,correct:true,kind:'choice' as const,score:1}],due:now+1000};
 expect(graphStatus(n,now)).toBe('learning');expect(graphStatus({...n,due:now},now)).toBe('review');
});
it('shows demonstrated mastery in green only while review is current',()=>{
 const n:Concept={...base,due:now+1000,attempts:[{at:now-3*86400000,correct:true,kind:'choice',score:1},{at:now-2*86400000,correct:true,kind:'choice',score:1},{at:now-86400000,correct:true,kind:'application',score:1}]};
 expect(graphStatus(n,now)).toBe('mastered');expect(graphStatus({...n,due:now-1000},now)).toBe('review');
});
