import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, itemInput, addWorkspaceUser } from './backend-support.mjs';

test('backend modelos: nova instância preserva árvore/TI/duração null sem copiar anexos e decisões', async t => {
  const f = await fixture(t); const { admin } = f;
  const { user: selectedOwner } = await addWorkspaceUser(f);
  await admin.sync(state => {
    state.sectors.push({ id: 'org_a_obras', name: 'Obras', organizationId: 'org_a' });
    Object.assign(state.users.find(value => value.id === selectedOwner.id), { sectorId: 'org_a_obras', state: 'SP' });
  });
  const initial = await admin.projection();
  const definitions = [
    itemInput('Fluxo de origem', { id: 'original_root', type: 'project', plannedDurationDays: null }),
    itemInput('Preparar', { id: 'original_task', parentId: 'original_root', status: 'done', weight: 3, progressPercent: 100 }),
    itemInput('Aprovar', { id: 'original_approval', parentId: 'original_root', type: 'approval', plannedDurationDays: 1 }),
    itemInput('Ainda sem duração', { id: 'original_undated', parentId: 'original_root', plannedDurationDays: null }),
  ];
  const commands = definitions.map(input => ({ type: 'createItem', args: [input] }));
  commands.push({ type: 'createRelation', args: ['original_task', 'original_approval', 'TI', 1, ''] });
  const created = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: initial.revision, commands } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  await admin.command('submitApprovalForReview', ['original_approval', 'Revisão do fluxo anterior']);
  await admin.command('decideApproval', ['original_approval', 'approved', 'Aceite do fluxo anterior']);
  const upload = await admin.request('/api/workspaces/w_a/items/original_task/attachments', { method: 'POST', body: { name: 'origem.txt', mime: 'text/plain', dataBase64: Buffer.from('Evidência da execução anterior').toString('base64') } });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const saved = await admin.command('saveFlowTemplate', ['original_root', 'Modelo de execução']);
  const template = saved.state.templates.find(value => value.name === 'Modelo de execução');
  assert.equal(template.items.length, 4); assert.equal(template.relations.length, 1);
  assert.equal(template.items.find(value => value.key === 'original_undated').plannedDurationDays, null);
  assert.equal(template.items.some(value => Object.hasOwn(value, 'approvalDecisions') || Object.hasOwn(value, 'attachments')), false);

  const cloned = await admin.command('applyFlowTemplate', [template.id, { title: 'Nova execução', organizationId: 'org_a', sectorId: 'org_a_geral', state: 'PE', startDate: '2027-01-04', statusSelections: { original_task: 'backlog' }, ownerSelections: { original_task: selectedOwner.id } }]);
  const newItems = cloned.state.items.filter(value => !definitions.some(original => original.id === value.id));
  assert.equal(newItems.length, 4);
  const root = newItems.find(value => value.title === 'Nova execução'); assert.ok(root);
  assert.ok(newItems.filter(value => value.id !== root.id).every(value => value.parentId === root.id));
  const task = newItems.find(value => value.title === 'Preparar'), approval = newItems.find(value => value.title === 'Aprovar'), undated = newItems.find(value => value.title === 'Ainda sem duração');
  assert.equal(task.status, 'backlog'); assert.equal(task.progressPercent, 0); assert.equal(task.weight, 3);
  assert.equal(task.ownerId, selectedOwner.id); assert.equal(task.organizationId, 'org_a'); assert.equal(task.sectorId, 'org_a_obras'); assert.equal(task.state, 'SP');
  assert.equal(task.plannedStartAt, '2027-01-04'); assert.equal(task.baselineStartAt, '2027-01-04');
  assert.equal(approval.status, 'backlog'); assert.equal(approval.progressPercent, 0);
  assert.equal(undated.plannedDurationDays, null); assert.equal(undated.dueAt, '');
  const relation = cloned.state.relations.find(value => value.sourceId === task.id && value.targetId === approval.id);
  assert.equal(relation?.lagDays, 1);
  assert.ok(cloned.state.approvalDecisions.every(value => value.itemId === 'original_approval'));
  assert.ok(cloned.state.approvalRequests.every(value => value.itemId === 'original_approval'));
  assert.ok(cloned.state.attachments.every(value => value.itemId === 'original_task'));
  assert.deepEqual(cloned.state.approvalDecisions, saved.state.approvalDecisions);
});

test('backend modelos: salvar exige acesso a todos os descendentes e falha sem gravação parcial', async t => {
  const f = await fixture(t); const { admin } = f;
  const created = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: (await admin.projection()).revision, commands: [
    { type: 'createItem', args: [itemInput('Raiz restrita', { id: 'template_root', type: 'project' })] },
    { type: 'createItem', args: [itemInput('Filho restrito', { id: 'template_child', parentId: 'template_root' })] },
  ] } });
  assert.equal(created.status, 200);
  const { user, client } = await addWorkspaceUser(f, { operations: ['view_item', 'edit_item', 'create_item'] });
  await admin.sync(state => state.permissionRules.push({ id: 'deny_template_child', subjectType: 'user', subjectId: user.id, operation: 'view_item', scopeType: 'item', scopeId: 'template_child', effect: 'deny' }));
  const before = await admin.projection();
  const denied = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands: [{ type: 'saveFlowTemplate', args: ['template_root', 'Não autorizado'] }] } });
  assert.ok([403, 422].includes(denied.status), JSON.stringify(denied.data));
  const after = await admin.projection();
  assert.equal(after.revision, before.revision); assert.deepEqual(after.state.templates, before.state.templates);
});

test('backend modelos: importar estrutura inválida cancela o snapshot inteiro sem alterar o modelo anterior', async t => {
  const { admin } = await fixture(t);
  const base = await admin.projection();
  const created = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: base.revision, commands: [
    { type: 'createItem', args: [itemInput('Raiz do modelo', { id: 'model_root', type: 'project' })] },
    { type: 'createItem', args: [itemInput('Atividade A', { id: 'model_a', parentId: 'model_root' })] },
    { type: 'createItem', args: [itemInput('Atividade B', { id: 'model_b', parentId: 'model_root' })] },
    { type: 'createRelation', args: ['model_a', 'model_b', 'TI', 0] },
  ] } });
  assert.equal(created.status, 200);
  const saved = await admin.command('saveFlowTemplate', ['model_root', 'Modelo íntegro']);
  const template = saved.state.templates.find(value => value.name === 'Modelo íntegro');
  assert.equal(template.version, 1);
  const corruptions = [
    value => { value.items.find(item => item.key === 'model_a').parentKey = 'model_b'; value.items.find(item => item.key === 'model_b').parentKey = 'model_a'; },
    value => value.relations.push({ sourceKey: 'model_b', targetKey: 'model_a', relationType: 'TI', lagDays: 0 }),
    value => { value.relations[0].sourceKey = 'model_root'; },
    value => { value.items.find(item => item.key === 'model_a').plannedDurationDays = -3; },
    value => { value.organizationId = 'org_outside_workspace'; },
  ];
  for (const corrupt of corruptions) {
    const before = await admin.projection();
    const desired = structuredClone(before.state);
    // A valid item edit in the same snapshot must roll back along with the bad model.
    desired.items.find(value => value.id === 'model_a').title = 'Não persistir esta alteração';
    corrupt(desired.templates.find(value => value.id === template.id));
    const rejected = await admin.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: desired } });
    assert.equal(rejected.status, 422, JSON.stringify(rejected.data));
    const after = await admin.projection();
    assert.equal(after.revision, before.revision); assert.deepEqual(after.state.items, before.state.items); assert.deepEqual(after.state.templates, before.state.templates);
  }
});
