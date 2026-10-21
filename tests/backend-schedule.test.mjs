import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, itemInput } from './backend-support.mjs';

test('backend cronograma: rede completa usa dias inclusivos, folga e caminho crítico calculados no servidor', async t => {
  const { admin } = await fixture(t);
  const before = await admin.projection();
  const input = [
    ['a', 'Preparação', 2], ['b', 'Execução longa', 3],
    ['c', 'Execução curta', 1], ['d', 'Entrega', 2],
  ];
  const commands = input.map(([id, title, duration]) => ({ type: 'createItem', args: [itemInput(title, { id, plannedDurationDays: duration })] }));
  for (const [source, target] of [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]) commands.push({ type: 'createRelation', args: [source, target, 'TI', 0, ''] });
  const result = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const { schedule, state } = result.data;
  assert.equal(schedule.valid, true); assert.equal(schedule.reliable, true);
  assert.equal(schedule.startDate, '2026-11-02'); assert.equal(schedule.finishDate, '2026-11-08'); assert.equal(schedule.durationDays, 7);
  assert.deepEqual(schedule.rows.filter(row => row.critical).map(row => row.itemId).sort(), ['a', 'b', 'd']);
  assert.equal(schedule.rows.find(row => row.itemId === 'c').slack, 2);
  assert.equal(state.items.find(item => item.id === 'd').plannedStartAt, '2026-11-07');
  assert.equal(state.items.find(item => item.id === 'd').dueAt, '2026-11-08');

  const incomplete = await admin.command('updateItem', ['c', { plannedDurationDays: null }]);
  assert.equal(incomplete.schedule.valid, true); assert.equal(incomplete.schedule.reliable, false);
  assert.ok(incomplete.schedule.message, 'a incompletude é explicada');
  assert.ok(incomplete.schedule.rows.every(row => row.critical === false && row.slack === null), 'a rede incompleta não afirma criticidade nem folgas');
  assert.equal(incomplete.state.items.find(item => item.id === 'c').plannedDurationDays, null);
});

test('backend cronograma: conclusão ponderada ignora folhas canceladas e recalcula ancestrais', async t => {
  const { admin } = await fixture(t); const initial = await admin.projection();
  const commands = [
    itemInput('Projeto', { id: 'parent', type: 'project', plannedDurationDays: null }),
    itemInput('Concluída', { id: 'done', parentId: 'parent', status: 'done', weight: 1, progressPercent: 100 }),
    itemInput('Em execução', { id: 'working', parentId: 'parent', status: 'in_progress', weight: 3, progressPercent: 20 }),
    itemInput('Cancelada', { id: 'cancelled', parentId: 'parent', status: 'cancelled', weight: 100, progressPercent: 0 }),
  ].map(input => ({ type: 'createItem', args: [input] }));
  const created = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: initial.revision, commands } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const parent = created.data.state.items.find(item => item.id === 'parent');
  assert.equal(parent.progressPercent, 40); assert.equal(parent.status, 'in_progress');
  const finished = await admin.command('updateItem', ['working', { status: 'done', progressPercent: 100 }]);
  const complete = finished.state.items.find(item => item.id === 'parent');
  assert.equal(complete.progressPercent, 100); assert.equal(complete.status, 'done'); assert.ok(complete.completedAt);
  const reopened = await admin.command('updateItem', ['working', { status: 'in_progress', progressPercent: 20 }]);
  const changed = reopened.state.items.find(item => item.id === 'parent');
  assert.equal(changed.progressPercent, 40); assert.equal(changed.status, 'in_progress'); assert.equal(changed.completedAt, '');
});
