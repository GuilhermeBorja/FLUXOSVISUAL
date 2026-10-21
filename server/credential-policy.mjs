import { hashPassword } from "./auth.mjs";
import { assert } from "./http.mjs";
import { checkId, evaluatePermission, pick, same } from "./domain.mjs";

const USER_FIELDS = [
  "name",
  "email",
  "organizationId",
  "sectorId",
  "state",
  "profileId",
  "disabled",
];
const IDENTITY_FIELDS = ["name", "email", "disabled"];
const contextOf = (user) => ({
  organizationId: user.organizationId,
  sectorId: user.sectorId,
  state: user.state,
});

/** Validate against the original server snapshot BEFORE doing any expensive scrypt work.
 * The transaction must repeat authorization and revision checks after this function awaits.
 * No credential or request-supplied permission rule is an authorization source here.
 */
export async function prepareCredentialHashes({
  storage,
  workspaceId,
  userId,
  state,
  desiredState,
  expectedRevision,
  currentRevision,
  onDecision = () => {},
}) {
  assert(
    Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
    428,
    "REVISION_REQUIRED",
    "Informe a revisão atual antes de salvar.",
  );
  assert(
    expectedRevision === currentRevision,
    409,
    "REVISION_CONFLICT",
    "O workspace foi alterado por outro usuário. Recarregue antes de reaplicar suas alterações.",
    { currentRevision },
  );
  const membership = storage.db
    .prepare(
      `SELECT 1 FROM workspace_memberships m JOIN auth_users u ON u.id=m.user_id
    WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND u.disabled=0`,
    )
    .get(workspaceId, userId);
  assert(
    membership,
    404,
    "WORKSPACE_NOT_FOUND",
    "Workspace não encontrado ou acesso não autorizado.",
  );
  const actor = state.users.find(
    (user) => user.id === userId && !user.disabled,
  );
  assert(actor, 403, "INACTIVE_MEMBER", "Usuário inativo neste workspace.");
  if (desiredState === undefined || desiredState === null) return new Map();
  assert(
    typeof desiredState === "object" && !Array.isArray(desiredState),
    422,
    "INVALID_STATE",
    "Informe as alterações do workspace.",
  );
  if (!Object.hasOwn(desiredState, "users")) return new Map();
  assert(
    Array.isArray(desiredState.users) && desiredState.users.length <= 50000,
    422,
    "INVALID_COLLECTION",
    "A coleção users é inválida.",
  );

  const oldUsers = new Map(state.users.map((user) => [user.id, user]));
  const hasPassword = (user) =>
    Object.hasOwn(user, "password") &&
    user.password !== undefined &&
    user.password !== null &&
    user.password !== "";
  const requestedPasswords = desiredState.users.filter(
    (user) => user && typeof user === "object" && hasPassword(user),
  );
  assert(
    requestedPasswords.length <= 100,
    413,
    "CREDENTIAL_BATCH_LIMIT",
    "Altere no máximo 100 senhas por solicitação.",
  );
  const seen = new Set();
  const pending = [];
  const governance = evaluatePermission(state, actor, "manage_gpo");
  const requirePermission = (operation, context) => {
    const decision = evaluatePermission(state, actor, operation, context);
    onDecision(decision);
    assert(
      decision.allowed,
      403,
      "FORBIDDEN",
      "Seu perfil não permite administrar esta conta.",
      {
        operation,
        ruleId: decision.ruleId,
        context: decision.actor,
      },
    );
  };

  for (const row of desiredState.users) {
    assert(
      row && typeof row === "object" && !Array.isArray(row),
      422,
      "INVALID_RECORD",
      "Registro de usuário inválido.",
    );
    checkId(row.id, "Identificador do usuário");
    assert(
      !seen.has(row.id),
      422,
      "DUPLICATE_ID",
      "O identificador do usuário está duplicado.",
    );
    seen.add(row.id);
    const old = oldUsers.get(row.id);
    const next = { ...old, ...pick(row, USER_FIELDS), id: row.id };
    const passwordRequested = hasPassword(row);
    if (passwordRequested)
      assert(
        typeof row.password === "string" &&
          row.password.length >= 12 &&
          row.password.length <= 128,
        422,
        "PASSWORD_POLICY",
        "A senha deve ter entre 12 e 128 caracteres.",
      );
    if (!old)
      assert(
        passwordRequested,
        422,
        "PASSWORD_REQUIRED",
        "Defina uma senha de pelo menos 12 caracteres para o novo usuário.",
      );
    const fieldsChanged =
      !old || !same(pick(old, USER_FIELDS), pick(next, USER_FIELDS));
    if (!fieldsChanged && !passwordRequested) continue;

    assert(
      typeof next.name === "string" &&
        next.name.trim() &&
        next.name.length <= 160,
      422,
      "INVALID_NAME",
      "O nome do usuário deve ter entre 1 e 160 caracteres.",
    );
    assert(
      typeof next.email === "string" &&
        next.email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email),
      422,
      "INVALID_EMAIL",
      "Informe um e-mail válido.",
    );
    checkId(next.organizationId, "Empresa do usuário");
    checkId(next.sectorId, "Setor do usuário");
    if (next.profileId) checkId(next.profileId, "Perfil do usuário");
    assert(
      next.disabled === undefined || typeof next.disabled === "boolean",
      422,
      "INVALID_ACTIVE_STATE",
      "O estado de ativação do usuário é inválido.",
    );
    requirePermission("manage_users", contextOf(next));
    if (old) requirePermission("manage_users", contextOf(old));

    const assignsProfile = !old
      ? Boolean(next.profileId)
      : old.profileId !== next.profileId;
    // A disabled administrator must not be taken over through reactivation plus reset.
    const privilegedTarget =
      old &&
      evaluatePermission(state, { ...old, disabled: false }, "manage_gpo")
        .allowed;
    const identityChanged =
      old && !same(pick(old, IDENTITY_FIELDS), pick(next, IDENTITY_FIELDS));
    if (
      assignsProfile ||
      (privilegedTarget && (identityChanged || passwordRequested))
    ) {
      onDecision(governance);
      assert(
        governance.allowed,
        403,
        "GPO_ADMIN_REQUIRED",
        "Somente quem administra GPO pode atribuir perfis ou alterar a identidade de um administrador.",
        {
          operation: "manage_gpo",
          ruleId: governance.ruleId,
          targetId: row.id,
        },
      );
    }

    const account = storage.db
      .prepare("SELECT id FROM auth_users WHERE id=?")
      .get(row.id);
    if (!old)
      assert(
        !account,
        409,
        "USER_EXISTS",
        "Este usuário já existe; vinculação entre workspaces exige administração do servidor.",
      );
    if (old && (identityChanged || passwordRequested)) {
      assert(
        !storage.db
          .prepare(
            "SELECT 1 FROM workspace_memberships WHERE user_id=? AND workspace_id!=? AND active=1",
          )
          .get(row.id, workspaceId),
        403,
        "SHARED_ACCOUNT",
        "A conta participa de outros workspaces. Alterações da identidade devem ser feitas pela própria pessoa ou pela administração do servidor.",
      );
    }
    assert(
      !storage.db
        .prepare(
          "SELECT id FROM auth_users WHERE email=? COLLATE NOCASE AND id!=?",
        )
        .get(next.email.trim().toLowerCase(), row.id),
      409,
      "EMAIL_EXISTS",
      "Este e-mail já está cadastrado.",
    );
    if (passwordRequested) pending.push({ id: row.id, password: row.password });
  }

  const hashes = new Map();
  for (const credential of pending)
    hashes.set(credential.id, await hashPassword(credential.password));
  return hashes;
}
