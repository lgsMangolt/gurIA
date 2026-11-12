import { type Workspace, type Concept } from './domain';

// Kept independent of the server so approval and recovery use the same idempotent merge.
export function incorporateMaterial(
  state: Workspace,
  result: any,
  courseId: string,
  mapping: Record<string, string>,
): Workspace {
  const concepts = state.concepts.map((n) => ({
    ...n,
    courseIds: [...n.courseIds],
    evidence: [...n.evidence],
  }));
  const remap = new Map<string, string>();
  for (const item of result.concepts || []) {
    const existing = concepts.find(
      (n) =>
        n.id === (mapping[item.id] || item.id) ||
        n.evidence.some((e) => e.mediaUrl && e.mediaUrl === item.mediaUrl),
    );
    const id = existing?.id || item.id;
    remap.set(item.id, id);
    const evidence = {
      text: item.evidence,
      start: item.startSeconds,
      end: item.endSeconds,
      mediaUrl: item.mediaUrl,
      courseId: courseId || undefined,
    };
    if (existing) {
      if (courseId && !existing.courseIds.includes(courseId)) existing.courseIds.push(courseId);
      if (
        !existing.evidence.some((e) => e.mediaUrl === evidence.mediaUrl && e.text === evidence.text)
      )
        existing.evidence.push(evidence);
      if (!existing.question && item.quizQuestion) existing.question = item.quizQuestion;
    } else
      concepts.push({
        id,
        label: item.label,
        summary: item.summary,
        note: item.markdownNote || '',
        courseIds: courseId ? [courseId] : [],
        origin: 'lesson',
        question: item.quizQuestion || undefined,
        evidence: [evidence],
        attempts: [],
        due: 0,
      } satisfies Concept);
  }
  const connections = [...state.connections];
  for (const link of result.connections || []) {
    const source = remap.get(link.source),
      target = remap.get(link.target);
    if (
      source &&
      target &&
      source !== target &&
      !connections.some((e) => e.source === source && e.target === target)
    )
      connections.push({ id: link.id, source, target, relation: link.relationship });
  }
  return { ...state, concepts, connections };
}
