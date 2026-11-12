import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStorage } from '../server/storage.mjs';
import { hashPassword } from '../server/auth.mjs';
import { bootstrapWorkspace } from '../server/service.mjs';

function options(argv) {
  const result = {};
  const allowed = new Set(['email', 'name', 'organization', 'workspace', 'state', 'data-dir', 'password-stdin', 'help']);
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, '');
    if (!argv[index].startsWith('--') || !allowed.has(name)) throw new Error(`Opção desconhecida: ${argv[index]}`);
    if (name === 'password-stdin' || name === 'help') result[name] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Informe o valor de --${name}.`);
      result[name] = value;
    }
  }
  return result;
}

export async function setup(input = {}) {
  const email = String(input.email || process.env.FLUXOS_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Informe um e-mail válido em --email ou FLUXOS_ADMIN_EMAIL.');
  const name = String(input.name || process.env.FLUXOS_ADMIN_NAME || 'Administrador').trim();
  const organizationName = String(input.organization || process.env.FLUXOS_ORGANIZATION_NAME || 'Minha empresa').trim();
  const workspaceName = String(input.workspace || process.env.FLUXOS_WORKSPACE_NAME || 'Fluxo Visual').trim();
  const state = String(input.state || process.env.FLUXOS_ORGANIZATION_STATE || '').trim().toUpperCase();
  for (const [label, value] of Object.entries({ nome: name, empresa: organizationName, workspace: workspaceName })) {
    if (!value || value.length > 160) throw new Error(`Informe ${label} com até 160 caracteres.`);
  }
  if (state && !/^[A-Z]{2}$/.test(state)) throw new Error('O estado deve conter uma UF com duas letras.');
  const storage = createStorage({ dataDir: input['data-dir'] || process.env.DATA_DIR || './data' });
  try {
    const existing = storage.db.prepare('SELECT id,name FROM workspaces ORDER BY created_at LIMIT 1').get();
    if (existing) return { alreadyInitialized: true, workspaceId: existing.id, workspaceName: existing.name, message: 'Instalação já inicializada. Nenhum usuário, senha ou dado foi alterado.' };
    if (storage.db.prepare('SELECT id FROM auth_users LIMIT 1').get()) throw new Error('O banco contém contas sem workspace. Revise a instalação antes de repetir o setup.');
    let password = input.password ?? process.env.FLUXOS_ADMIN_PASSWORD;
    if (input['password-stdin']) password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
    const generatedPassword = password === undefined;
    if (generatedPassword) password = randomBytes(24).toString('base64url');
    const passwordHash = await hashPassword(password);
    const stamp = new Date().toISOString();
    const makeId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`;
    const userId = makeId('user');
    const workspaceId = makeId('workspace');
    const organizationId = makeId('org');
    const user = { id: userId, name, email, organizationId, sectorId: makeId('sector'), state, profileId: 'profile_admin', disabled: false, createdAt: stamp };
    storage.transaction(() => {
      // Re-check inside the write transaction in case another setup won the race.
      if (storage.db.prepare('SELECT id FROM workspaces LIMIT 1').get()) throw new Error('Outra execução já inicializou o banco. Execute novamente para consultar o resultado.');
      storage.db.prepare('INSERT INTO auth_users(id,name,email,password_hash,disabled,created_at,updated_at) VALUES (?,?,?,?,0,?,?)')
        .run(userId, name, email, passwordHash, stamp, stamp);
      storage.db.prepare('INSERT INTO workspaces(id,name,organization_id,created_at) VALUES (?,?,?,?)')
        .run(workspaceId, workspaceName, organizationId, stamp);
      storage.db.prepare("INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES (?,?,'admin',1)").run(workspaceId, userId);
      bootstrapWorkspace(storage, { workspaceId, organizationId, user, organizationName, sectorName: 'Administração', workspaceName });
      storage.db.prepare('INSERT INTO auth_events(user_id,event_type,recorded_at,metadata_json) VALUES (?,?,?,?)')
        .run(userId, 'installation_initialized', stamp, JSON.stringify({ workspaceId }));
    });
    return { alreadyInitialized: false, email, userId, workspaceId, workspaceName, ...(generatedPassword ? { initialPassword: password } : {}), message: 'Administrador e workspace criados. Guarde a senha em um gerenciador de senhas.' };
  } finally { storage.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const input = options(process.argv.slice(2));
    if (input.help) console.log(`Inicializar o Fluxo Visual (Node.js 24):
  node scripts/setup.mjs --email seu@email.com --name "Seu nome" --organization "Sua empresa" --workspace "Sua obra" --state PE

Opções:
  --data-dir DIRETORIO   Diretório persistente; padrão DATA_DIR ou ./data.
  --password-stdin      Lê a senha pela entrada padrão. Mínimo 12 caracteres.
  Sem senha informada   Gera uma senha aleatória e a mostra uma única vez.

Também aceita FLUXOS_ADMIN_EMAIL, FLUXOS_ADMIN_NAME, FLUXOS_ADMIN_PASSWORD,
FLUXOS_ORGANIZATION_NAME, FLUXOS_WORKSPACE_NAME e FLUXOS_ORGANIZATION_STATE.
Repetir o comando não altera uma instalação existente. Não informe senha na linha de comando.`);
    else console.log(JSON.stringify(await setup(input), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
