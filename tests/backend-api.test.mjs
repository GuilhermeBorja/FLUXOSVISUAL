import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, ApiClient, ADMIN, createItem, itemInput, addWorkspaceUser } from './backend-support.mjs';

test('backend REST: árvore em três níveis e TI entre folhas em único commit', async t => {
  const { admin } = await fixture(t); const before = await admin.projection();
  const missing = await admin.request('/api/workspaces/w_a/item-trees', { method: 'POST', body: {
    expectedRevision: before.revision, createTI: true, items: [
      { ...itemInput('Pai inválido', { type: 'project', plannedDurationDays: null }), key: 'root' },
      { ...itemInput('Folha sem duração', { plannedDurationDays: null }), key: 'leaf', parentKey: 'root' },
    ],
  } });
  assert.equal(missing.status, 422);
  assert.equal(missing.data.error.details.line, 2, 'invalid duration points to the input row');
  assert.equal((await admin.projection()).revision, before.revision);
  const result = await admin.request('/api/workspaces/w_a/item-trees', { method: 'POST', body: {
    expectedRevision: before.revision, createTI: true, startDate: '2026-11-02', items: [
      { ...itemInput('1 Projeto', { type: 'project', plannedDurationDays: null }), key: 'root' },
      { ...itemInput('1.1 Pacote', { type: 'stage', plannedDurationDays: null }), key: 'package', parentKey: 'root' },
      { ...itemInput('1.1.1 Preparar', { plannedDurationDays: 2 }), key: 'prepare', parentKey: 'package' },
      { ...itemInput('1.1.2 Executar', { plannedDurationDays: 3 }), key: 'execute', parentKey: 'package' },
      { ...itemInput('1.2 Entregar', { plannedDurationDays: 1 }), key: 'deliver', parentKey: 'root' },
    ],
  } });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.revision, before.revision + 1);
  const items = result.data.state.items; assert.equal(items.length, 5);
  const byTitle = title => items.find(item => item.title === title);
  assert.equal(byTitle('1.1 Pacote').parentId, byTitle('1 Projeto').id);
  assert.equal(byTitle('1.1.1 Preparar').parentId, byTitle('1.1 Pacote').id);
  assert.ok(byTitle('1.1.1 Preparar').sortOrder < byTitle('1.1.2 Executar').sortOrder);
  assert.equal(byTitle('1.2 Entregar').dueAt, '2026-11-07');
  assert.equal(result.data.state.relations.length, 2);
  assert.equal(result.data.projection.graph.relations.filter(r => r.relationType === 'contains').length, 4);
  assert.equal(result.data.state.relations.some(r => r.relationType === 'contains'), false);
});

test('backend REST: lote informa rollback por item e PATCH exige versão otimista', async t => {
  const { admin } = await fixture(t);
  const a = await createItem(admin, 'Lote A'); const b = await createItem(admin, 'Lote B'); const c = await createItem(admin, 'Lote C');
  const before = await admin.projection();
  const invalid = await admin.request('/api/workspaces/w_a/items/batch', { method: 'POST', body: {
    expectedRevision: before.revision, changes: { weight: 2 }, items: [{ id: a.id }, { id: b.id, changes: { weight: -2 } }, { id: c.id }],
  } });
  assert.equal(invalid.status, 422); assert.equal(invalid.data.error.details.atomic, true);
  assert.equal(invalid.data.error.details.results.length, 3);
  assert.ok(invalid.data.error.details.results.every(r => !r.success && r.rolledBack));
  assert.deepEqual((await admin.projection()).state.items, before.state.items);
  const accepted = await admin.request('/api/workspaces/w_a/items/batch', { method: 'POST', body: {
    expectedRevision: before.revision, changes: { weight: 2 }, items: [a, b, c].map(item => ({ id: item.id, version: item.version })),
  } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.ok(accepted.data.results.every(r => r.success));
  assert.ok(accepted.data.state.items.every(item => item.weight === 2));
  const noVersion = await admin.request(`/api/workspaces/w_a/items/${a.id}`, { method: 'PATCH', body: { changes: { title: 'Sem versão' } } });
  assert.equal(noVersion.status, 428);
  const current = accepted.data.state.items.find(i => i.id === a.id);
  const patched = await admin.request(`/api/workspaces/w_a/items/${a.id}`, { method: 'PATCH', headers: { 'If-Match': `"${current.version}"` }, body: { changes: { title: 'Patch confirmado' } } });
  assert.equal(patched.status, 200);
  const stale = await admin.request(`/api/workspaces/w_a/items/${a.id}`, { method: 'PATCH', body: { version: current.version, changes: { title: 'Não sobrescrever' } } });
  assert.equal(stale.status, 409);
  assert.equal((await admin.projection()).state.items.find(i => i.id === a.id).title, 'Patch confirmado');
});

test('backend REST: preferência acompanha usuário em outra sessão e não altera o colega', async t => {
  const f = await fixture(t); const { admin, baseUrl } = f; const { client } = await addWorkspaceUser(f);
  const preferences = { graphPositions: { project: { sample: { x: 120, y: 80 } } }, prd5GanttColumnViews: { columns: ['name', 'status', 'progress', 'weight'] }, riskThresholdDays: 7 };
  const saved = await admin.request('/api/users/me/workspace-preferences', { method: 'PUT', body: { workspaceId: 'w_a', preferences } });
  assert.equal(saved.status, 200);
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(saved.data.preferences[key], value);
  const second = new ApiClient(baseUrl); await second.login();
  const loaded = await second.request('/api/users/me/workspace-preferences?workspaceId=w_a');
  assert.equal(loaded.status, 200); assert.deepEqual(loaded.data.preferences, saved.data.preferences);
  const separate = await client.request('/api/users/me/workspace-preferences?workspaceId=w_a');
  assert.equal(separate.status, 200); assert.deepEqual(separate.data.preferences, {});
  const projection = await second.projection(); assert.deepEqual(projection.state.graphPositions, preferences.graphPositions);
});

test('backend REST: auditoria filtra autor, empresa, setor, item e evento com paginação', async t => {
  const { admin, app } = await fixture(t); const item = await createItem(admin, 'Nome anterior');
  await admin.command('updateItem', [item.id, { title: 'Nome posterior' }]);
  const query = new URLSearchParams({ userId: ADMIN.id, organizationId: 'org_a', sectorId: 'org_a_geral', itemId: item.id, eventType: 'title_changed', limit: '1' });
  const filtered = await admin.request(`/api/workspaces/w_a/audit-events?${query}`);
  assert.equal(filtered.status, 200); assert.equal(filtered.data.total, 1); assert.equal(filtered.data.events.length, 1);
  const event = filtered.data.events[0];
  assert.equal(event.before, 'Nome anterior'); assert.equal(event.after, 'Nome posterior');
  assert.equal(event.actorId, ADMIN.id); assert.ok(event.correlationId && event.effectiveAt && event.recordedAt);
  const page = await admin.request('/api/workspaces/w_a/audit-events?limit=1');
  assert.equal(page.data.events.length, 1); assert.equal(page.data.nextOffset, 1);
  const next = await admin.request('/api/workspaces/w_a/audit-events?limit=1&offset=1');
  assert.notEqual(next.data.events[0].id, page.data.events[0].id);
  assert.throws(() => app.storage.db.exec("UPDATE audit_events SET event_type='tampered'"), /append-only/);
  assert.throws(() => app.storage.db.exec('DELETE FROM audit_events'), /append-only/);
  const decisions = app.storage.db.prepare('SELECT * FROM authorization_events WHERE workspace_id=? AND actor_id=?').all('w_a', ADMIN.id);
  assert.ok(decisions.length > 0 && decisions.some(entry => entry.rule_id));
});

test('backend REST: consulta filtrada mantém Gantt, grafo e contadores no mesmo conjunto', async t => {
  const { admin } = await fixture(t);
  const a = await createItem(admin, 'Frente alpha', { status: 'in_progress', progressPercent: 30 });
  await createItem(admin, 'Frente beta');
  const result = await admin.request('/api/workspaces/w_a/projection?status=in_progress');
  assert.equal(result.status, 200); const p = result.data.projection;
  assert.deepEqual(p.items.map(i => i.id), [a.id]);
  assert.deepEqual(p.graph.nodes.map(i => i.id), [a.id]);
  assert.equal(p.counters.total, 1);
  assert.equal(p.relations.length, p.graph.relations.filter(r => r.relationType !== 'contains').length);
});

test('backend REST: anexo privado possui hash, link temporário por usuário e exclusão lógica', async t => {
  const f = await fixture(t); const { admin, app, baseUrl } = f; const item = await createItem(admin, 'Item com evidência');
  const bytes = Buffer.from('Documento de teste de compartilhamento.\n');
  const uploaded = await admin.request(`/api/workspaces/w_a/items/${item.id}/attachments`, { method: 'POST', body: { name: 'evidencia.txt', mime: 'text/plain', dataBase64: bytes.toString('base64') } });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const attachment = uploaded.data.state.attachments[0]; assert.ok(attachment.id);
  assert.equal(attachment.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(attachment.size, bytes.length); assert.equal(attachment.createdBy, ADMIN.id);
  assert.equal(attachment.dataUrl, undefined); assert.equal(attachment.storageKey, undefined);
  const link = await admin.request(`/api/workspaces/w_a/attachments/${attachment.id}/download-url`, { method: 'POST', body: {} });
  assert.equal(link.status, 200); assert.ok(Date.parse(link.data.expiresAt) > Date.now());
  const downloaded = await admin.request(link.data.url); assert.equal(downloaded.status, 200); assert.deepEqual(downloaded.bytes, bytes);
  assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
  const anonymous = new ApiClient(baseUrl); assert.equal((await anonymous.request(link.data.url)).status, 401);
  const { client } = await addWorkspaceUser(f);
  assert.equal((await client.request(link.data.url)).status, 403, 'another authorized user still needs their own temporary URL');
  const ownLink = await client.request(`/api/workspaces/w_a/attachments/${attachment.id}/download-url`, { method: 'POST', body: {} });
  assert.equal(ownLink.status, 200); assert.equal((await client.request(ownLink.data.url)).status, 200);
  const tampered = new URL(link.data.url, baseUrl); tampered.searchParams.set('token', `payload.${'é'.repeat(43)}`);
  assert.equal((await admin.request(tampered.pathname + tampered.search)).status, 403, 'malformed Unicode signatures are validation errors');
  const removed = await admin.request(`/api/workspaces/w_a/attachments/${attachment.id}`, { method: 'DELETE', body: {} });
  assert.equal(removed.status, 200); assert.equal(removed.data.state.attachments.length, 0);
  assert.equal((await admin.request(link.data.url)).status, 404);
  const stored = app.storage.db.prepare('SELECT * FROM attachments WHERE id=?').get(attachment.id);
  assert.ok(stored.deleted_at && stored.deleted_by === ADMIN.id);
  assert.deepEqual(await readFile(join(app.storage.dataDir, 'attachments', stored.storage_key)), bytes);
});

test('backend REST: upload valida extensão, conteúdo, tamanho e permissão antes de persistir', async t => {
  const f = await fixture(t, { appOptions: { attachmentMaxBytes: 128, attachmentQuotaBytes: 180 } });
  const { admin } = f; const item = await createItem(admin, 'Upload restrito');
  const path = `/api/workspaces/w_a/items/${item.id}/attachments`;
  for (const [name, bytes, status] of [
    ['script.html', Buffer.from('<script>anything</script>'), 422],
    ['../../invalid.txt', Buffer.from('text'), 422],
    ['false.pdf', Buffer.from('not a pdf'), 422],
    ['oversize.txt', Buffer.alloc(129, 65), 413],
  ]) assert.equal((await admin.request(path, { method: 'POST', body: { name, dataBase64: bytes.toString('base64') } })).status, status);
  assert.equal((await admin.projection()).state.attachments.length, 0);
  const { client } = await addWorkspaceUser(f);
  assert.equal((await client.request(path, { method: 'POST', body: { name: 'forbidden.txt', dataBase64: Buffer.from('not permitted').toString('base64') } })).status, 403);
  assert.equal((await admin.request(path, { method: 'POST', body: { name: 'first.txt', dataBase64: Buffer.alloc(100, 65).toString('base64') } })).status, 201);
  assert.equal((await admin.request(path, { method: 'POST', body: { name: 'quota.txt', dataBase64: Buffer.alloc(100, 65).toString('base64') } })).status, 413);
  assert.equal((await admin.projection()).state.attachments.length, 1);
});

test('backend REST: solicitação, decisão e cancelamento usam a rodada persistida', async t => {
  const { admin } = await fixture(t); const item = await createItem(admin, 'Aprovação REST', { type: 'approval' });
  let p = await admin.projection();
  const submitted = await admin.request('/api/workspaces/w_a/approvals', { method: 'POST', body: { itemId: item.id, expectedRevision: p.revision, comment: 'Solicitação formal' } });
  assert.equal(submitted.status, 201);
  let request = submitted.data.state.approvalRequests.find(r => r.itemId === item.id && r.status === 'pending'); assert.ok(request);
  const decided = await admin.request(`/api/workspaces/w_a/approval-requests/${encodeURIComponent(request.id)}/decisions`, { method: 'POST', body: { expectedRevision: submitted.data.revision, decision: 'approved', comment: 'Aprovado' } });
  assert.equal(decided.status, 200); assert.equal(decided.data.state.approvalRequests.find(r => r.id === request.id).status, 'approved');
  const repeated = await admin.request(`/api/workspaces/w_a/approval-requests/${encodeURIComponent(request.id)}/decisions`, { method: 'POST', body: { expectedRevision: decided.data.revision, decision: 'rejected', comment: 'Não pode reescrever' } });
  assert.equal(repeated.status, 409);
  await admin.command('reopenApproval', [item.id, 'Novo escopo', 10]);
  await admin.command('submitApprovalForReview', [item.id, 'Segunda rodada']);
  p = await admin.projection(); request = p.state.approvalRequests.find(r => r.itemId === item.id && r.status === 'pending');
  assert.equal(request.round, 2);
  const cancelled = await admin.request(`/api/workspaces/w_a/approval-requests/${encodeURIComponent(request.id)}/cancel`, { method: 'POST', body: { expectedRevision: p.revision, comment: 'Solicitação substituída' } });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.state.approvalRequests.find(r => r.id === request.id).status, 'cancelled');
  assert.equal(cancelled.data.state.approvalRequests.filter(r => r.status === 'approved').length, 1);
});

test('backend REST: varredura obrigatória ausente ou rejeitada bloqueia upload sem arquivo órfão', async t => {
  for (const appOptions of [{ requireScan: true }, { requireScan: true, scanCommand: '/bin/false' }]) {
    const { admin, app, dataDir } = await fixture(t, { appOptions });
    const item = await createItem(admin, 'Anexo exige verificação');
    const before = await admin.projection();
    const result = await admin.request(`/api/workspaces/w_a/items/${item.id}/attachments`, { method: 'POST', body: { name: 'verificar.txt', mime: 'text/plain', dataBase64: Buffer.from('Evidência não liberada pelo scanner').toString('base64') } });
    assert.equal(result.status, appOptions.scanCommand ? 422 : 503, JSON.stringify(result.data));
    assert.equal((await admin.projection()).revision, before.revision);
    assert.equal(app.storage.db.prepare('SELECT COUNT(*) total FROM attachments').get().total, 0);
    assert.deepEqual(await readdir(join(dataDir, 'attachments')), []);
    assert.equal((await readdir(dataDir)).some(name => name.endsWith('.tmp')), false);
  }
});
