import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTemplate, validateTemplateApplication } from '../server/template-validation.mjs';

const state = {
  organizations: [{ id: 'org_a', active: true }, { id: 'org_b', active: true }],
  sectors: [{ id: 'sector_a', organizationId: 'org_a' }, { id: 'sector_b', organizationId: 'org_b' }],
  users: [{ id: 'owner', organizationId: 'org_a' }, { id: 'foreign', organizationId: 'org_b' }, { id: 'inactive', organizationId: 'org_a', disabled: true }],
};
const node = (key, parentKey = '', patch = {}) => ({ key, parentKey, title: key, type: 'task', status: 'backlog', ownerId: 'owner', startOffset: 0, plannedDurationDays: 2, weight: 1, ...patch });
const template = () => ({ id: 'model', name: 'Modelo seguro', organizationId: 'org_a', createdBy: 'owner', version: 1, items: [node('root', '', { type: 'project' }), node('a', 'root'), node('b', 'root', { startOffset: 2 })], relations: [{ sourceKey: 'a', targetKey: 'b', relationType: 'TI', lagDays: 0 }] });
const application = () => ({ title: 'Nova execução', organizationId: 'org_a', sectorId: 'sector_a', state: 'PE', startDate: '2027-01-04' });

test('backend template validation: normaliza pai antes de filho e remove histórico sem presumir duração', () => {
  const input = template();
  input.items[1] = { ...input.items[1], plannedDurationDays: null, dueOffset: 20, progressPercent: 90, blockedReason: 'Histórico privado', attachments: [{ id: 'old' }] };
  input.items[2].type = 'approval'; input.items[2].status = 'done'; input.items[2].approvalDecisions = [{ decision: 'approved' }];
  input.items = [input.items[2], input.items[1], input.items[0]];
  const original = structuredClone(input), normalized = normalizeTemplate(input, state);
  assert.equal(normalized.items[0].key, 'root');
  assert.equal(normalized.items.find(value => value.key === 'a').plannedDurationDays, null);
  assert.equal(normalized.items.find(value => value.key === 'a').dueOffset, null);
  assert.equal(normalized.items.find(value => value.key === 'b').status, 'backlog');
  assert.ok(normalized.items.every(value => !Object.hasOwn(value, 'attachments') && !Object.hasOwn(value, 'approvalDecisions') && !Object.hasOwn(value, 'progressPercent') && !Object.hasOwn(value, 'blockedReason')));
  assert.deepEqual(input, original, 'validação não modifica a requisição');
  const legacy = template(); delete legacy.items[1].plannedDurationDays; legacy.items[1].dueOffset = 4;
  assert.equal(normalizeTemplate(legacy, state).items.find(value => value.key === 'a').plannedDurationDays, 5);
});

test('backend template validation: rejeita ciclos, TI em pais, duplicatas, referências e números inválidos', () => {
  const invalid = [
    ['duplicata', value => value.items.push({ ...value.items[1] })],
    ['órfão', value => { value.items[1].parentKey = 'missing'; }],
    ['duas raízes', value => { value.items[1].parentKey = ''; }],
    ['ciclo da árvore', value => { value.items[1].parentKey = 'b'; value.items[2].parentKey = 'a'; }],
    ['ciclo TI', value => value.relations.push({ sourceKey: 'b', targetKey: 'a', relationType: 'TI', lagDays: 0 })],
    ['TI em pai', value => { value.relations[0].sourceKey = 'root'; }],
    ['referência TI', value => { value.relations[0].targetKey = 'missing'; }],
    ['TI duplicada', value => value.relations.push({ ...value.relations[0] })],
    ['Contém persistido', value => { value.relations[0].relationType = 'contains'; }],
    ['duração negativa', value => { value.items[1].plannedDurationDays = -1; }],
    ['duração textual', value => { value.items[1].plannedDurationDays = '2'; }],
    ['peso zero', value => { value.items[1].weight = 0; }],
    ['offset infinito', value => { value.items[1].startOffset = Infinity; }],
    ['tipo desconhecido', value => { value.items[1].type = 'unknown'; }],
    ['status desconhecido', value => { value.items[1].status = 'approved'; }],
    ['responsável externo', value => { value.items[1].ownerId = 'missing'; }],
    ['empresa externa', value => { value.organizationId = 'missing'; }],
  ];
  for (const [label, change] of invalid) { const value = template(); change(value); assert.throws(() => normalizeTemplate(value, state), error => error.status === 422, label); }
});

test('backend template validation: aplicação valida calendário, setor e escolhas sem confiar no payload', () => {
  const normalized = normalizeTemplate(template(), state);
  const selected = validateTemplateApplication(normalized, { ...application(), ownerSelections: { a: 'owner' }, statusSelections: { a: 'ready' }, currentUserId: 'foreign', events: [{ id: 'forged' }] }, state);
  assert.equal(selected.currentUserId, undefined); assert.equal(selected.events, undefined); assert.deepEqual(selected.ownerSelections, { a: 'owner' });
  for (const patch of [
    { startDate: '2027-02-30' }, { sectorId: 'sector_b' }, { organizationId: 'missing' },
    { ownerSelections: { a: 'foreign' } }, { ownerSelections: { a: 'inactive' } }, { ownerSelections: { missing: 'owner' } },
    { statusSelections: { a: 'blocked' } }, { statusSelections: { a: 'under_review' } },
  ]) assert.throws(() => validateTemplateApplication(normalized, { ...application(), ...patch }, state), error => error.status === 422);
});
