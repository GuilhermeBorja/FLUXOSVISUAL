import { assert } from "./http.mjs";
import { checkId, dateValid } from "./domain.mjs";

const types = new Set([
  "project",
  "process",
  "stage",
  "substage",
  "task",
  "approval",
  "deliverable",
  "milestone",
  "document",
]);
const statuses = new Set([
  "backlog",
  "ready",
  "in_progress",
  "waiting",
  "blocked",
  "under_review",
  "correction",
  "done",
  "cancelled",
]);
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const title = (value, maximum, label) => {
  assert(
    typeof value === "string" && value.trim() && value.length <= maximum,
    422,
    "INVALID_TEMPLATE_TEXT",
    `${label} deve ter entre 1 e ${maximum} caracteres.`,
  );
  return value.trim();
};
const offset = (value, label) => {
  assert(
    Number.isSafeInteger(value) && Math.abs(value) <= 3652425,
    422,
    "INVALID_TEMPLATE_OFFSET",
    `${label} deve ser um número inteiro de dias dentro do calendário suportado.`,
  );
  return value;
};

/** Pure normalization; callers authorize against the original state before using it.
 * A template contains reusable configuration only, never operational snapshots.
 * Its nodes are returned parent-first with stable sibling order.
 */
export function normalizeTemplate(template, state) {
  assert(record(template), 422, "INVALID_TEMPLATE", "Modelo inválido.");
  checkId(template.id, "Identificador do modelo");
  const organization = state.organizations.find(
    (value) => value.id === template.organizationId,
  );
  assert(
    organization && organization.active !== false,
    422,
    "INVALID_TEMPLATE_ORGANIZATION",
    "A empresa do modelo não existe ou está inativa.",
  );
  assert(
    Array.isArray(template.items) &&
      template.items.length >= 1 &&
      template.items.length <= 20000,
    422,
    "INVALID_TEMPLATE_ITEMS",
    "O modelo deve conter de 1 a 20.000 itens.",
  );
  assert(
    template.relations === undefined ||
      (Array.isArray(template.relations) && template.relations.length <= 50000),
    422,
    "INVALID_TEMPLATE_RELATIONS",
    "As relações do modelo são inválidas.",
  );
  const nodes = new Map(),
    children = new Map();
  for (const source of template.items) {
    assert(
      record(source),
      422,
      "INVALID_TEMPLATE_NODE",
      "Item inválido no modelo.",
    );
    checkId(source.key, "Chave do item do modelo");
    assert(
      !nodes.has(source.key),
      422,
      "DUPLICATE_TEMPLATE_NODE",
      "As chaves dos itens do modelo devem ser únicas.",
      { nodeKey: source.key },
    );
    assert(
      types.has(source.type),
      422,
      "INVALID_TEMPLATE_TYPE",
      "Tipo de item inválido no modelo.",
      { nodeKey: source.key },
    );
    const status = source.status ?? "backlog";
    assert(
      statuses.has(status),
      422,
      "INVALID_TEMPLATE_STATUS",
      "Status inválido no modelo.",
      { nodeKey: source.key },
    );
    assert(
      source.type === "approval" ||
        !["under_review", "correction"].includes(status),
      422,
      "INVALID_TEMPLATE_STATUS",
      "Análise e correção pertencem a itens de aprovação.",
      { nodeKey: source.key },
    );
    const ownerId = source.ownerId ?? "";
    assert(
      typeof ownerId === "string" &&
        (!ownerId || state.users.some((value) => value.id === ownerId)),
      422,
      "INVALID_TEMPLATE_OWNER",
      "O responsável opcional do modelo não existe neste workspace.",
      { nodeKey: source.key },
    );
    const parentKey = source.parentKey ?? "";
    assert(
      typeof parentKey === "string",
      422,
      "INVALID_TEMPLATE_PARENT",
      "Pai inválido no modelo.",
      { nodeKey: source.key },
    );
    if (parentKey) checkId(parentKey, "Chave do pai do modelo");
    const startOffset = offset(
      source.startOffset ?? 0,
      "O deslocamento inicial",
    );
    if (source.dueOffset !== undefined && source.dueOffset !== null)
      offset(source.dueOffset, "O deslocamento final");
    // Legacy models with a date interval remain readable. Explicit null is never
    // replaced by a duration, even if the old payload also contains a dueOffset.
    const duration = Object.hasOwn(source, "plannedDurationDays")
      ? source.plannedDurationDays
      : source.dueOffset === undefined || source.dueOffset === null
        ? null
        : source.dueOffset - startOffset + 1;
    assert(
      duration === null ||
        (Number.isInteger(duration) && duration >= 0 && duration <= 36500),
      422,
      "INVALID_TEMPLATE_DURATION",
      "A duração do modelo deve ser null ou um inteiro entre 0 e 36.500 dias.",
      { nodeKey: source.key },
    );
    const weight = source.weight ?? 1;
    assert(
      Number.isFinite(weight) && weight > 0 && weight <= 1e9,
      422,
      "INVALID_TEMPLATE_WEIGHT",
      "O peso do modelo deve ser positivo.",
      { nodeKey: source.key },
    );
    const description = source.description ?? "";
    assert(
      typeof description === "string" && description.length <= 20000,
      422,
      "INVALID_TEMPLATE_DESCRIPTION",
      "Descrição do modelo limitada a 20.000 caracteres.",
      { nodeKey: source.key },
    );
    const node = {
      key: source.key,
      parentKey,
      title: title(source.title, 500, "O nome do item"),
      type: source.type,
      // Reviews and blockers belong to the source execution. A new execution gets
      // its own request and blocking reason through the ordinary commands.
      status:
        source.type === "approval" || status === "blocked" ? "backlog" : status,
      ownerId,
      description,
      plannedDurationDays: duration,
      startOffset,
      dueOffset:
        duration === null ? null : startOffset + Math.max(0, duration - 1),
      weight,
    };
    nodes.set(node.key, node);
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey).push(node);
  }
  const roots = children.get("") || [];
  assert(
    roots.length === 1,
    422,
    "TEMPLATE_ROOT_REQUIRED",
    "O modelo deve ter uma única raiz.",
  );
  for (const node of nodes.values())
    if (node.parentKey)
      assert(
        nodes.has(node.parentKey) && node.parentKey !== node.key,
        422,
        "INVALID_TEMPLATE_PARENT",
        "O modelo contém pai ausente ou referência ao próprio item.",
        { nodeKey: node.key },
      );
  const items = [],
    seen = new Set(),
    pending = [roots[0]];
  while (pending.length) {
    const node = pending.pop();
    assert(
      !seen.has(node.key),
      422,
      "TEMPLATE_HIERARCHY_CYCLE",
      "A árvore do modelo contém um ciclo.",
    );
    seen.add(node.key);
    items.push(node);
    pending.push(...[...(children.get(node.key) || [])].reverse());
  }
  assert(
    items.length === nodes.size,
    422,
    "TEMPLATE_HIERARCHY_CYCLE",
    "Todos os itens do modelo devem pertencer à raiz, sem ciclos.",
  );

  const relations = [],
    pairs = new Set(),
    edges = new Map(items.map((node) => [node.key, []])),
    indegree = new Map(items.map((node) => [node.key, 0]));
  for (const source of template.relations || []) {
    assert(
      record(source) && source.relationType === "TI",
      422,
      "INVALID_TEMPLATE_RELATION_TYPE",
      "O modelo persiste somente TI; Contém deriva da árvore.",
    );
    assert(
      nodes.has(source.sourceKey) &&
        nodes.has(source.targetKey) &&
        source.sourceKey !== source.targetKey,
      422,
      "INVALID_TEMPLATE_RELATION",
      "A TI do modelo precisa ligar dois itens distintos existentes.",
    );
    assert(
      !children.has(source.sourceKey) && !children.has(source.targetKey),
      422,
      "TEMPLATE_RELATION_NOT_LEAF",
      "TI do modelo deve ligar apenas atividades finais.",
    );
    const pair = `${source.sourceKey}|${source.targetKey}`;
    assert(
      !pairs.has(pair),
      422,
      "DUPLICATE_TEMPLATE_RELATION",
      "A TI do modelo está duplicada.",
    );
    pairs.add(pair);
    const lagDays = source.lagDays ?? 0;
    assert(
      Number.isFinite(lagDays) && Math.abs(lagDays) <= 36500,
      422,
      "INVALID_TEMPLATE_LAG",
      "Defasagem inválida na TI do modelo.",
    );
    relations.push({
      sourceKey: source.sourceKey,
      targetKey: source.targetKey,
      relationType: "TI",
      lagDays,
    });
    edges.get(source.sourceKey).push(source.targetKey);
    indegree.set(source.targetKey, indegree.get(source.targetKey) + 1);
  }
  const ready = [...indegree]
    .filter(([, value]) => value === 0)
    .map(([key]) => key);
  for (let index = 0; index < ready.length; index++)
    for (const next of edges.get(ready[index])) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  assert(
    ready.length === items.length,
    422,
    "TEMPLATE_TI_CYCLE",
    "As relações TI do modelo não podem conter ciclos.",
  );
  const metadata = Object.fromEntries(
    ["createdBy", "createdAt", "updatedAt", "version"]
      .filter((key) => Object.hasOwn(template, key))
      .map((key) => [key, template[key]]),
  );
  return {
    ...metadata,
    id: template.id,
    name: title(template.name, 160, "O nome do modelo"),
    organizationId: organization.id,
    rootTitle: items[0].title,
    items,
    relations,
  };
}

/** Validate choices before entering the domain transaction's creation loop. */
export function validateTemplateApplication(template, input, state) {
  assert(
    record(input),
    422,
    "INVALID_TEMPLATE_APPLICATION",
    "Informe o contexto da nova instância.",
  );
  const organization = state.organizations.find(
    (value) => value.id === input.organizationId,
  );
  assert(
    organization && organization.active !== false,
    422,
    "INVALID_TEMPLATE_ORGANIZATION",
    "Selecione uma empresa ativa para a nova instância.",
  );
  assert(
    state.sectors.some(
      (value) =>
        value.id === input.sectorId &&
        value.organizationId === input.organizationId &&
        value.active !== false,
    ),
    422,
    "INVALID_TEMPLATE_SECTOR",
    "Selecione um setor pertencente à empresa.",
  );
  assert(
    typeof input.state === "string" && /^[A-Z]{2}$/.test(input.state),
    422,
    "INVALID_TEMPLATE_STATE",
    "Informe uma UF válida.",
  );
  assert(
    !input.startDate || dateValid(input.startDate),
    422,
    "INVALID_DATE",
    "A data inicial da nova instância não existe no calendário.",
  );
  const nodes = new Map(template.items.map((node) => [node.key, node]));
  const ownerSelections = {},
    statusSelections = {};
  for (const [key, choices] of [
    ["ownerSelections", input.ownerSelections],
    ["statusSelections", input.statusSelections],
  ]) {
    assert(
      choices === undefined || record(choices),
      422,
      "INVALID_TEMPLATE_CHOICES",
      "As escolhas por item são inválidas.",
    );
    for (const [nodeKey, value] of Object.entries(choices || {})) {
      assert(
        nodes.has(nodeKey),
        422,
        "INVALID_TEMPLATE_CHOICE_KEY",
        "A escolha aponta para um item inexistente no modelo.",
        { nodeKey },
      );
      if (key === "ownerSelections") {
        assert(
          state.users.some(
            (user) =>
              user.id === value &&
              !user.disabled &&
              user.organizationId === input.organizationId,
          ),
          422,
          "INVALID_TEMPLATE_OWNER",
          "Selecione um responsável ativo da empresa da nova instância.",
          { nodeKey },
        );
        ownerSelections[nodeKey] = value;
      } else {
        assert(
          statuses.has(value) && value !== "blocked",
          422,
          "INVALID_TEMPLATE_STATUS",
          "Selecione um status válido; bloqueios exigem um motivo na nova execução.",
          { nodeKey },
        );
        assert(
          nodes.get(nodeKey).type === "approval" ||
            !["under_review", "correction"].includes(value),
          422,
          "INVALID_TEMPLATE_STATUS",
          "Análise e correção pertencem ao fluxo de aprovação.",
          { nodeKey },
        );
        statusSelections[nodeKey] =
          nodes.get(nodeKey).type === "approval" ? "backlog" : value;
      }
    }
  }
  if (input.startDate)
    for (const node of nodes.values()) {
      const start =
        new Date(`${input.startDate}T12:00:00Z`).getTime() +
        node.startOffset * 86400000;
      const finish =
        start + Math.max(0, (node.plannedDurationDays ?? 1) - 1) * 86400000;
      assert(
        dateValid(new Date(start).toISOString().slice(0, 10)) &&
          dateValid(new Date(finish).toISOString().slice(0, 10)),
        422,
        "INVALID_TEMPLATE_OFFSET",
        "O cronograma da nova instância ultrapassa o calendário suportado.",
        { nodeKey: node.key },
      );
    }
  return {
    title: title(input.title, 500, "O nome da nova instância"),
    organizationId: input.organizationId,
    sectorId: input.sectorId,
    state: input.state,
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ownerSelections,
    statusSelections,
  };
}
