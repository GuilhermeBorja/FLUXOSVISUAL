import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { fixture, itemInput } from './backend-support.mjs';

// Representative local gate. This intentionally measures the real HTTP round trip,
// including response serialization, authentication, GPO, SQLite and audit writes.
// It is not a substitute for the corporate network/browser p75 in the PRD.
const cleanups = [];
const { admin } = await fixture({ after: callback => cleanups.push(callback) });
const rounds = 20;
const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * quantile) - 1];
const summarize = values => ({ samples: values.length, p50Ms: +percentile(values, .5).toFixed(1), p75Ms: +percentile(values, .75).toFixed(1), p95Ms: +percentile(values, .95).toFixed(1), maxMs: +Math.max(...values).toFixed(1) });

try {
  let projection = await admin.projection();
  const commands = Array.from({ length: 10 }, (_, i) => ({ type: 'createItem', args: [itemInput(`Projeto ${i + 1}`, { id: `perf_project_${i}`, type: 'project', plannedDurationDays: null })] }));
  const taskId = i => `perf_task_${String(i).padStart(3, '0')}`;
  for (let i = 0; i < 490; i++) commands.push({ type: 'createItem', args: [itemInput(`Atividade ${i + 1}`, { id: taskId(i), parentId: `perf_project_${Math.floor(i / 49)}`, plannedDurationDays: 1 + i % 3 })] });
  for (let i = 0; i < 392; i++) {
    const nextLayer = (Math.floor(i / 98) + 1) * 98;
    for (const offset of (i < 216 ? [0, 1, 2] : [0, 1])) commands.push({ type: 'createRelation', args: [taskId(i), taskId(nextLayer + (i % 98 + offset) % 98), 'TI', 0, ''] });
  }
  assert.equal(commands.length, 1500);
  const start = performance.now();
  const seed = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: projection.revision, commands } });
  const seedMs = performance.now() - start;
  assert.equal(seed.status, 200, JSON.stringify(seed.data));
  projection = seed.data;
  assert.equal(projection.state.items.length, 500); assert.equal(projection.state.relations.length, 1000);
  assert.equal(projection.projection.graph.nodes.length, 500); assert.equal(projection.projection.graph.relations.length, 1490);
  assert.equal(projection.schedule.reliable, true);
  // Two discarded warm-up reads; each later sample still authenticates and logs GPO.
  await admin.projection(); await admin.projection();
  const reads = [], edits = [];
  for (let i = 0; i < rounds; i++) {
    const started = performance.now(); projection = await admin.projection(); reads.push(performance.now() - started);
    assert.equal(projection.projection.counters.total, 500);
  }
  for (let i = 0; i < rounds; i++) {
    const item = projection.state.items.find(value => value.id === taskId(489));
    const started = performance.now();
    const response = await admin.request(`/api/workspaces/w_a/items/${item.id}`, { method: 'PATCH', headers: { 'If-Match': `"${item.version}"` }, body: { changes: { title: `Atividade editada ${i + 1}` } } });
    edits.push(performance.now() - started);
    assert.equal(response.status, 200, JSON.stringify(response.data)); projection = response.data;
    assert.equal(projection.state.items.find(value => value.id === item.id).title, `Atividade editada ${i + 1}`);
  }
  const report = {
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, transport: 'HTTP loopback, processo único' },
    dataset: { items: 500, projects: 10, leafActivities: 490, tiRelations: 1000, derivedContains: 490 },
    seedTransactionMs: +seedMs.toFixed(1),
    projection: summarize(reads), edit: summarize(edits),
    targets: { projectionP75Ms: 2500, editP95Ms: 1000 },
    targetMet: { projection: percentile(reads, .75) < 2500, edit: percentile(edits, .95) < 1000 },
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.FLUXOS_PERFORMANCE_GATE === 'true') {
    assert.ok(report.targetMet.projection, 'projeção p75 deve permanecer abaixo de 2.500 ms');
    assert.ok(report.targetMet.edit, 'edição p95 deve permanecer abaixo de 1.000 ms');
  }
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup();
}
