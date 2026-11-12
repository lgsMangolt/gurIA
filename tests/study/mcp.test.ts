import { afterEach, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStudyContextReader } from '@/lib/study/context';
import { emptyWorkspace } from '@/lib/study/domain';
import { createStudyMcpServer, handleStudyMcp } from '@/lib/study/mcp';

afterEach(() => vi.unstubAllEnvs());

it('supports the real SDK handshake and exposes only validated read tools', async () => {
  const read = vi.fn(async (_owner: string) => ({ revision: 4, data: emptyWorkspace() }));
  const server = createStudyMcpServer(createStudyContextReader('owner-a', read));
  const client = new Client({ name: 'guria-test', version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'list_courses',
      'get_course',
      'get_concept',
      'get_study_plan',
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({ name: 'list_courses', arguments: {} });
    expect(result.structuredContent).toMatchObject({ revision: 4, courses: [] });
    const denied = await client.callTool({
      name: 'list_courses',
      arguments: { ownerId: 'owner-b' },
    });
    expect(denied.isError).toBe(true);
    const missing = await client.callTool({
      name: 'get_concept',
      arguments: { conceptId: 'foreign' },
    });
    expect(missing.isError).toBe(true);
    expect(read.mock.calls.every(([owner]) => owner === 'owner-a')).toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3033/api/study/mcp', {
    method: 'POST',
    headers: {
      Host: '127.0.0.1:3033',
      Origin: 'http://127.0.0.1:3033',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const listRequest = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

it('serves stateless JSON MCP and preserves identity response headers', async () => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  const reader = createStudyContextReader('owner', async () => ({
    revision: 0,
    data: emptyWorkspace(),
  }));
  const response = await handleStudyMcp(
    request(listRequest),
    reader,
    new Headers({ 'Set-Cookie': 'identity=test' }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBe('identity=test');
  expect((await response.json()).result.tools).toHaveLength(4);
});

it('rejects remote origins, forged hosts and nonlocal mode without reading data', async () => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  const read = vi.fn(async () => ({ revision: 0, data: emptyWorkspace() }));
  const reader = createStudyContextReader('owner', read);
  expect(
    (
      await handleStudyMcp(
        request(listRequest, { Origin: 'https://example.com' }),
        reader,
        new Headers(),
      )
    ).status,
  ).toBe(403);
  expect(
    (await handleStudyMcp(request(listRequest, { Host: 'example.com' }), reader, new Headers()))
      .status,
  ).toBe(403);
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'false');
  expect((await handleStudyMcp(request(listRequest), reader, new Headers())).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
});

it('caps actual request bytes even when Content-Length is absent', async () => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  const reader = createStudyContextReader('owner', async () => ({
    revision: 0,
    data: emptyWorkspace(),
  }));
  const response = await handleStudyMcp(
    request({ ...listRequest, padding: 'x'.repeat(65536) }),
    reader,
    new Headers(),
  );
  expect(response.status).toBe(413);
});
