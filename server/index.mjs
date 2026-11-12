import { createServer } from "node:http";
import { readFile, writeFile, rename, unlink, stat } from "node:fs/promises";
import { resolve, join, extname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createStorage } from "./storage.mjs";
import { createAuth, verifyPassword } from "./auth.mjs";
import { createService } from "./service.mjs";
import {
  HttpError,
  assert,
  readJson,
  sendJson,
  sendError,
  securityHeaders,
  requireSameOrigin,
  requestId,
} from "./http.mjs";
import { id, clone, pick, evaluatePermission } from "./domain.mjs";

const runFile = promisify(execFile),
  root = fileURLToPath(new URL("../dist/", import.meta.url));
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const allowedUploads = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const numberEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const n = Number(value);
  assert(
    Number.isSafeInteger(n) && n > 0,
    500,
    "INVALID_CONFIGURATION",
    `${name} deve ser inteiro positivo.`,
  );
  return n;
};

export function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || "./data";
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? "";
  if (process.env.NODE_ENV === "production")
    assert(
      publicOrigin,
      500,
      "PUBLIC_ORIGIN_REQUIRED",
      "Defina PUBLIC_ORIGIN antes de iniciar em produção.",
    );
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    assert(
      ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash,
      500,
      "INVALID_CONFIGURATION",
      "PUBLIC_ORIGIN deve conter somente protocolo, host e porta.",
    );
    if (process.env.NODE_ENV === "production")
      assert(
        url.protocol === "https:" ||
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
        500,
        "HTTPS_REQUIRED",
        "Configure PUBLIC_ORIGIN com HTTPS para a instalação pública.",
      );
  }
  const logger =
    typeof options.logger === "function"
      ? { info: options.logger, error: options.logger, warn: options.logger }
      : options.logger || console;
  const storage = createStorage({ dataDir }),
    db = storage.db;
  const limits = {
    attachmentMaxBytes:
      options.attachmentMaxBytes ||
      numberEnv("ATTACHMENT_MAX_BYTES", 10 * 1024 * 1024),
    attachmentQuotaBytes:
      options.attachmentQuotaBytes ||
      numberEnv("ATTACHMENT_QUOTA_BYTES", 1024 * 1024 * 1024),
  };
  const service = createService(storage, { ...limits, logger }),
    auth = createAuth({
      storage,
      publicOrigin,
      secureCookies: options.secureCookies,
      rateLimit: options.rateLimit,
    });
  const downloadKey = randomBytes(32),
    scanCommand = options.scanCommand || process.env.ATTACHMENT_SCAN_COMMAND,
    requireScan =
      options.requireScan ?? process.env.REQUIRE_ATTACHMENT_SCAN === "true";
  const listWorkspaces = (userId) =>
    db
      .prepare(
        "SELECT w.id,w.name FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id WHERE m.user_id=? AND m.active=1 ORDER BY w.name,w.id",
      )
      .all(userId);
  const sessionResponse = (s) => ({
    user: s.user,
    csrfToken: s.csrfToken,
    expiresAt: s.expiresAt,
    workspaces: listWorkspaces(s.user.id),
    workspaceId: listWorkspaces(s.user.id)[0]?.id || null,
  });
  const revision = (body, req) =>
    body.expectedRevision ??
    (req.headers["if-match"] === undefined
      ? undefined
      : Number(String(req.headers["if-match"]).replaceAll('"', "")));
  const mutate = (wid, userId, req, body, commands) =>
    service.mutate(wid, userId, {
      expectedRevision: revision(body, req),
      commands,
      comment: body.comment || "",
      effectiveAt: body.effectiveAt,
      correlationId: requestId(req),
      beforeCommit: () => {
        const currentSession = auth.authenticate(req);
        auth.requireCsrf(req, currentSession);
      },
    });
  // A successful transaction includes its authorization audit atomically.
  // After a rollback, the finally records the decisions outside the transaction
  // so denials retain their rule and context. Callbacks remain synchronous.
  const withAuthorizedDomain = (
    wid,
    userId,
    correlationId,
    operation,
    { transaction = false } = {},
  ) => {
    let ctx,
      recorded = false;
    const execute = () => {
      ctx = service.withDomain(wid, userId);
      return operation(ctx);
    };
    try {
      if (!transaction) return execute();
      const result = storage.transaction(() => {
        const result = execute();
        service.recordDecisions(wid, userId, ctx.decisions, correlationId);
        return result;
      });
      recorded = true;
      return result;
    } finally {
      if (ctx && !recorded)
        service.recordDecisions(wid, userId, ctx.decisions, correlationId);
    }
  };
  const checkAttachment = (ctx, wid, aid, operation = "view_item") => {
    const attachment = db
      .prepare(
        "SELECT * FROM attachments WHERE id=? AND workspace_id=? AND deleted_at IS NULL",
      )
      .get(aid, wid);
    assert(attachment, 404, "ATTACHMENT_NOT_FOUND", "Anexo não encontrado.");
    ctx.domain.item(attachment.item_id, operation);
    return attachment;
  };
  const safeAccountChange = (wid, targetId) => {
    const others = db
      .prepare(
        "SELECT workspace_id FROM workspace_memberships WHERE user_id=? AND workspace_id!=? AND active=1",
      )
      .all(targetId, wid);
    assert(
      !others.length,
      403,
      "SHARED_ACCOUNT",
      "Esta conta participa de outros workspaces. A própria pessoa deve alterar sua senha, ou a administração do servidor deve fazê-lo.",
    );
  };

  async function handler(req, res) {
    const startedAt = process.hrtime.bigint(),
      correlationId = requestId(req),
      method = req.method;
    let requestPath = "",
      loggedCompletion = false;
    const logCompletion = (aborted = false) => {
      if (loggedCompletion) return;
      loggedCompletion = true;
      logger.info?.(
        JSON.stringify({
          level: "info",
          event: "request_completed",
          method,
          path: requestPath,
          status: aborted ? 499 : res.statusCode,
          durationMs:
            Math.round(Number(process.hrtime.bigint() - startedAt) / 10000) /
            100,
          correlationId,
          ...(aborted ? { aborted: true } : {}),
        }),
      );
    };
    res.once("finish", () => logCompletion());
    res.once("close", () => logCompletion(!res.writableFinished));
    res.setHeader("X-Request-Id", correlationId);
    securityHeaders(res);
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      requestPath = path;
      if (path === "/healthz" || path === "/api/health") {
        assert(
          method === "GET" || method === "HEAD",
          405,
          "METHOD_NOT_ALLOWED",
          "Método não permitido.",
        );
        db.prepare("SELECT 1").get();
        return sendJson(res, 200, { status: "ok", version: "0.7.0-prd6" });
      }
      if (path === "/api/runtime.js" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(
          'window.FLUXOS_BACKEND = Object.freeze({apiBase:"/api"});\n',
        );
      }
      if (path === "/api/auth/login" && method === "POST") {
        requireSameOrigin(req, publicOrigin);
        const body = await readJson(req, 4096);
        const login = await auth.login({
          ...body,
          ip: req.socket.remoteAddress || "",
        });
        return sendJson(res, 200, sessionResponse(login), {
          "Set-Cookie": auth.cookie(login.token),
        });
      }
      if (path.startsWith("/api/")) {
        const session = auth.authenticate(req),
          userId = session.user.id;
        if (!["GET", "HEAD"].includes(method)) auth.requireCsrf(req, session);
        if (path === "/api/auth/session" && method === "GET")
          return sendJson(res, 200, sessionResponse(session));
        if (path === "/api/auth/logout" && method === "POST") {
          auth.logout(session);
          return sendJson(
            res,
            200,
            { ok: true },
            { "Set-Cookie": auth.clearCookie() },
          );
        }
        if (path === "/api/auth/password" && method === "POST") {
          const body = await readJson(req, 4096),
            user = db
              .prepare("SELECT * FROM auth_users WHERE id=?")
              .get(userId);
          assert(
            await verifyPassword(body.currentPassword, user.password_hash),
            403,
            "CURRENT_PASSWORD",
            "A senha atual está incorreta.",
          );
          const fresh = db
            .prepare("SELECT * FROM auth_users WHERE id=?")
            .get(userId);
          assert(
            fresh?.password_hash === user.password_hash && !fresh.disabled,
            401,
            "SESSION_EXPIRED",
            "A conta mudou. Entre novamente.",
          );
          await auth.setPassword(userId, body.newPassword, {
            beforeCommit: () => {
              auth.authenticate(req);
              const current = db
                .prepare("SELECT * FROM auth_users WHERE id=?")
                .get(userId);
              assert(
                current?.password_hash === user.password_hash &&
                  !current.disabled,
                401,
                "SESSION_EXPIRED",
                "A conta mudou. Entre novamente.",
              );
            },
          });
          return sendJson(
            res,
            200,
            { ok: true, requiresLogin: true },
            { "Set-Cookie": auth.clearCookie() },
          );
        }
        if (path === "/api/workspaces" && method === "GET")
          return sendJson(res, 200, { workspaces: listWorkspaces(userId) });
        if (path === "/api/users/me/workspace-preferences") {
          if (method === "GET") {
            const wid = url.searchParams.get("workspaceId");
            return sendJson(res, 200, {
              preferences: service.preferences(wid, userId),
            });
          }
          if (method === "PUT") {
            const body = await readJson(req, 2 * 1024 * 1024);
            return sendJson(res, 200, {
              preferences: service.savePreferences(
                body.workspaceId,
                userId,
                body.preferences || body,
              ),
            });
          }
        }
        if (path === "/api/audit-events" && method === "GET") {
          const query = Object.fromEntries(url.searchParams);
          return sendJson(
            res,
            200,
            service.queryAudit(query.workspaceId, userId, query),
          );
        }
        const match = path.match(/^\/api\/workspaces\/([^/]+)(\/.*)?$/);
        assert(match, 404, "NOT_FOUND", "Recurso não encontrado.");
        const wid = decodeURIComponent(match[1]),
          suffix = match[2] || "";
        service.membership(wid, userId);
        if (suffix === "/projection" && method === "GET")
          return sendJson(
            res,
            200,
            service.projection(wid, userId, {
              query: Object.fromEntries(url.searchParams),
              correlationId,
            }),
          );
        if (suffix === "/sync" && method === "POST") {
          const body = await readJson(req, 20 * 1024 * 1024);
          return sendJson(
            res,
            200,
            await service.mutate(wid, userId, {
              ...pick(body, [
                "expectedRevision",
                "desiredState",
                "actions",
                "comment",
                "effectiveAt",
                "fieldHints",
              ]),
              correlationId,
              beforeCommit: () => {
                const currentSession = auth.authenticate(req);
                auth.requireCsrf(req, currentSession);
              },
            }),
          );
        }
        if (suffix === "/commands" && method === "POST") {
          const body = await readJson(req, 20 * 1024 * 1024);
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, body.commands),
          );
        }
        if (suffix === "/preferences" && method === "GET")
          return sendJson(res, 200, {
            preferences: service.preferences(wid, userId),
          });
        if (suffix === "/preferences" && method === "PUT") {
          const body = await readJson(req, 2 * 1024 * 1024);
          return sendJson(res, 200, {
            preferences: service.savePreferences(
              wid,
              userId,
              body.preferences || body,
            ),
          });
        }
        if (suffix === "/audit-events" && method === "GET")
          return sendJson(
            res,
            200,
            service.queryAudit(
              wid,
              userId,
              Object.fromEntries(url.searchParams),
            ),
          );
        if (suffix === "/authorization/evaluate" && method === "POST") {
          const body = await readJson(req);
          const result = withAuthorizedDomain(
            wid,
            userId,
            correlationId,
            (ctx) => {
              const item = body.itemId ? ctx.domain.item(body.itemId) : null;
              const allowed = ctx.domain.functions.gpoDecision(
                ctx.domain.state.users.find((u) => u.id === userId),
                body.operation,
                item,
              );
              const decision = [...ctx.decisions.values()].at(-1);
              return {
                allowed,
                ruleId: decision?.ruleId,
                reason: decision?.reason,
              };
            },
          );
          return sendJson(res, 200, result);
        }
        if (suffix === "/permission-rules" && method === "GET") {
          const result = withAuthorizedDomain(
            wid,
            userId,
            correlationId,
            (ctx) => {
              ctx.domain.authorize("manage_gpo");
              const query = Object.fromEntries(url.searchParams),
                limit = Math.min(200, Math.max(1, Number(query.limit) || 50)),
                offset = Math.max(0, Number(query.offset) || 0);
              const rules = ctx.state.permissionRules.filter(
                (r) =>
                  (!query.q ||
                    JSON.stringify(r)
                      .toLowerCase()
                      .includes(query.q.toLowerCase())) &&
                  [
                    "subjectType",
                    "subjectId",
                    "operation",
                    "scopeType",
                    "scopeId",
                    "effect",
                  ].every((k) => !query[k] || r[k] === query[k]),
              );
              return {
                rules: rules.slice(offset, offset + limit),
                total: rules.length,
                offset,
                limit,
              };
            },
          );
          return sendJson(res, 200, result);
        }
        let resource;
        if (
          (resource = suffix.match(/^\/users\/([^/]+)\/password$/)) &&
          method === "POST"
        ) {
          const body = await readJson(req, 4096),
            targetId = resource[1];
          const authorizeReset = (ctx) => {
            const target = ctx.domain.state.users.find(
              (user) => user.id === targetId,
            );
            assert(target, 404, "USER_NOT_FOUND", "Usuário não encontrado.");
            ctx.domain.authorize("manage_users", {
              organizationId: target.organizationId,
            });
            if (
              evaluatePermission(
                ctx.domain.state,
                { ...target, disabled: false },
                "manage_gpo",
              ).allowed
            )
              ctx.domain.authorize("manage_gpo");
            safeAccountChange(wid, targetId);
          };
          withAuthorizedDomain(wid, userId, correlationId, authorizeReset);
          let resetContext;
          try {
            await auth.setPassword(targetId, body.password, {
              beforeCommit: () => {
                const freshSession = auth.authenticate(req);
                auth.requireCsrf(req, freshSession);
                resetContext = service.withDomain(wid, userId);
                authorizeReset(resetContext);
                // setPassword owns this transaction; successful checks and the
                // target audit are committed together with the credential change.
                service.recordDecisions(
                  wid,
                  userId,
                  resetContext.decisions,
                  correlationId,
                );
                service.audit(wid, {
                  eventType: "user_password_reset",
                  aggregateId: targetId,
                  actorId: userId,
                  correlationId,
                  payload: { targetId },
                });
              },
            });
          } catch (error) {
            // Its transaction has rolled back before this catch runs.
            if (resetContext)
              service.recordDecisions(
                wid,
                userId,
                resetContext.decisions,
                correlationId,
              );
            throw error;
          }
          return sendJson(res, 200, { ok: true });
        }
        if (suffix === "/item-trees" && method === "POST") {
          const body = await readJson(req, 10 * 1024 * 1024);
          assert(
            Array.isArray(body.items) &&
              body.items.length > 0 &&
              body.items.length <= 1000,
            422,
            "INVALID_TREE",
            "Informe de 1 a 1.000 itens.",
          );
          const keys = new Map();
          const commands = [];
          for (const [index, item] of body.items.entries()) {
            const key = item.key ?? String(index);
            assert(
              !keys.has(key),
              422,
              "DUPLICATE_KEY",
              "A chave da linha se repete.",
              { line: index + 1 },
            );
            const newId = item.id || id("item");
            keys.set(key, newId);
            const parentId = item.parentKey
              ? keys.get(item.parentKey)
              : body.parentId || item.parentId || "";
            assert(
              !item.parentKey || parentId,
              422,
              "TREE_PARENT",
              "O pai deve ser informado antes do filho.",
              { line: index + 1 },
            );
            commands.push({
              type: "createItem",
              args: [
                {
                  ...item,
                  id: newId,
                  parentId,
                  plannedStartAt: item.plannedStartAt || body.startDate,
                },
              ],
            });
          }
          if (body.createTI || body.createRelations) {
            const parents = new Set(commands.map((c) => c.args[0].parentId));
            const leaves = commands
              .map((c) => c.args[0])
              .filter((i) => !parents.has(i.id));
            for (const leaf of leaves)
              assert(
                Number.isInteger(leaf.plannedDurationDays) &&
                  leaf.plannedDurationDays >= 1,
                422,
                "DURATION_REQUIRED",
                "Informe duração de pelo menos 1 dia para cada atividade final.",
                {
                  itemId: leaf.id,
                  line: commands.findIndex((c) => c.args[0].id === leaf.id) + 1,
                },
              );
            for (let i = 1; i < leaves.length; i++)
              commands.push({
                type: "createRelation",
                args: [leaves[i - 1].id, leaves[i].id, "TI", 0],
              });
          }
          return sendJson(
            res,
            201,
            await mutate(wid, userId, req, body, commands),
          );
        }
        if (suffix === "/items/batch" && method === "POST") {
          const body = await readJson(req);
          assert(
            Array.isArray(body.items) &&
              body.items.length > 0 &&
              body.items.length <= 1000,
            422,
            "INVALID_BATCH",
            "Informe os itens a alterar.",
          );
          const commands = body.items.map((i) => ({
            type: "updateItem",
            args: [
              i.id,
              {
                ...(body.changes || {}),
                ...(i.changes || {}),
                ...(i.version === undefined ? {} : { version: i.version }),
              },
            ],
          }));
          try {
            const result = await mutate(wid, userId, req, body, commands);
            return sendJson(res, 200, {
              ...result,
              results: body.items.map((i) => ({ id: i.id, success: true })),
            });
          } catch (error) {
            if (error instanceof HttpError)
              error.details = {
                ...(error.details || {}),
                atomic: true,
                results: body.items.map((i) => ({
                  id: i.id,
                  success: false,
                  rolledBack: true,
                })),
              };
            throw error;
          }
        }
        if (
          (resource = suffix.match(/^\/items\/([^/]+)$/)) &&
          method === "PATCH"
        ) {
          const body = await readJson(req);
          const currentRevision = withAuthorizedDomain(
            wid,
            userId,
            correlationId,
            (ctx) => {
              ctx.domain.item(resource[1], "edit_item");
              return ctx.revision;
            },
          );
          assert(
            body.version !== undefined || req.headers["if-match"] !== undefined,
            428,
            "VERSION_REQUIRED",
            "Informe version ou If-Match para editar o item.",
          );
          const version =
            body.version ??
            Number(String(req.headers["if-match"]).replaceAll('"', ""));
          return sendJson(
            res,
            200,
            await service.mutate(wid, userId, {
              expectedRevision: body.expectedRevision ?? currentRevision,
              commands: [
                {
                  type: "updateItem",
                  args: [resource[1], { ...(body.changes || body), version }],
                },
              ],
              comment: body.comment,
              effectiveAt: body.effectiveAt,
              correlationId,
              beforeCommit: () => {
                const freshSession = auth.authenticate(req);
                auth.requireCsrf(req, freshSession);
              },
            }),
          );
        }
        if (
          (resource = suffix.match(/^\/items\/([^/]+)\/move$/)) &&
          method === "POST"
        ) {
          const body = await readJson(req);
          const commands = [
            {
              type: "moveItemHierarchy",
              args: [resource[1], body.parentId || ""],
            },
          ];
          if (body.targetId)
            commands.push({
              type: "reorderItem",
              args: [resource[1], body.targetId, body.position === "after"],
            });
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, commands),
          );
        }
        if (
          (resource = suffix.match(/^\/items\/([^/]+)\/(archive|restore)$/)) &&
          method === "POST"
        ) {
          const body = await readJson(req);
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, [
              {
                type:
                  resource[2] === "archive"
                    ? "archiveItem"
                    : "restoreArchivedItem",
                args: [resource[1]],
              },
            ]),
          );
        }
        if (suffix === "/relations" && method === "POST") {
          const body = await readJson(req);
          return sendJson(
            res,
            201,
            await mutate(wid, userId, req, body, [
              {
                type: "createRelation",
                args: [
                  body.sourceId,
                  body.targetId,
                  body.type || "TI",
                  body.lagDays || 0,
                  body.description || "",
                ],
              },
            ]),
          );
        }
        if (
          (resource = suffix.match(/^\/relations\/([^/]+)$/)) &&
          method === "DELETE"
        ) {
          const body = await readJson(req);
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, [
              { type: "removeRelation", args: [resource[1]] },
            ]),
          );
        }
        if (
          (resource = suffix.match(/^\/items\/([^/]+)\/blockers$/)) &&
          method === "POST"
        ) {
          const body = await readJson(req);
          return sendJson(
            res,
            201,
            await mutate(wid, userId, req, body, [
              { type: "setBlocker", args: [resource[1], body.reason] },
            ]),
          );
        }
        if (
          (resource = suffix.match(/^\/blockers\/([^/]+)$/)) &&
          method === "DELETE"
        ) {
          const body = await readJson(req);
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, [
              {
                type: "resolveBlocker",
                args: [resource[1], body.comment || body.reason],
              },
            ]),
          );
        }
        if (suffix === "/approvals" && method === "POST") {
          const body = await readJson(req);
          return sendJson(
            res,
            201,
            await mutate(wid, userId, req, body, [
              {
                type: "submitApprovalForReview",
                args: [body.itemId, body.comment || ""],
              },
            ]),
          );
        }
        if (
          (resource = suffix.match(
            /^\/approval-requests\/([^/]+)\/(decisions|cancel)$/,
          )) &&
          method === "POST"
        ) {
          const body = await readJson(req),
            request = db
              .prepare(
                "SELECT * FROM approval_requests WHERE workspace_id=? AND id=?",
              )
              .get(wid, decodeURIComponent(resource[1]));
          assert(
            request && request.status === "pending",
            409,
            "APPROVAL_NOT_PENDING",
            "A rodada não está pendente.",
          );
          return sendJson(
            res,
            200,
            await mutate(wid, userId, req, body, [
              {
                type:
                  resource[2] === "cancel"
                    ? "cancelApproval"
                    : "decideApproval",
                args:
                  resource[2] === "cancel"
                    ? [request.item_id, body.comment]
                    : [
                        request.item_id,
                        body.decision,
                        body.comment,
                        body.correctionOwnerId,
                      ],
              },
            ]),
          );
        }
        if (
          (resource = suffix.match(/^\/items\/([^/]+)\/attachments$/)) &&
          method === "POST"
        ) {
          const body = await readJson(
              req,
              Math.ceil((limits.attachmentMaxBytes * 4) / 3) + 8192,
            ),
            name = String(body.name || "");
          assert(
            name &&
              name === basename(name) &&
              !/[\x00-\x1f\\/]/.test(name) &&
              name.length <= 240,
            422,
            "INVALID_FILENAME",
            "Nome de arquivo inválido.",
          );
          const extension = extname(name).toLowerCase(),
            mime = allowedUploads[extension];
          assert(
            mime,
            422,
            "FILE_TYPE_NOT_ALLOWED",
            "Use PDF, imagem, TXT, CSV ou documento Office (DOCX, XLSX, PPTX).",
          );
          assert(
            typeof body.dataBase64 === "string" &&
              /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                body.dataBase64,
              ),
            422,
            "INVALID_FILE",
            "Conteúdo do arquivo inválido.",
          );
          const bytes = Buffer.from(body.dataBase64, "base64");
          assert(
            bytes.length > 0 && bytes.length <= limits.attachmentMaxBytes,
            413,
            "FILE_SIZE",
            "O arquivo ultrapassa o limite permitido.",
            limits,
          );
          validateMagic(extension, bytes);
          withAuthorizedDomain(wid, userId, correlationId, (ctx) =>
            ctx.domain.item(resource[1], "add_attachment"),
          );
          const storageKey = id("blob"),
            temp = join(storage.dataDir, `${storageKey}.tmp`),
            destination = join(storage.dataDir, "attachments", storageKey);
          assert(
            !requireScan || scanCommand,
            503,
            "SCANNER_REQUIRED",
            "O servidor precisa de um verificador de anexos configurado.",
          );
          await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
          let committed = false;
          try {
            if (scanCommand)
              try {
                await runFile(scanCommand, [temp], {
                  timeout: 60000,
                  maxBuffer: 65536,
                });
              } catch {
                throw new HttpError(
                  422,
                  "FILE_SCAN_FAILED",
                  "O verificador de arquivos não liberou este anexo.",
                );
              }
            await rename(temp, destination);
            withAuthorizedDomain(
              wid,
              userId,
              correlationId,
              (ctx) => {
                const freshSession = auth.authenticate(req);
                auth.requireCsrf(req, freshSession);
                ctx.domain.item(resource[1], "add_attachment");
                const quota = db
                  .prepare(
                    "SELECT COALESCE(SUM(size),0) total FROM attachments WHERE workspace_id=?",
                  )
                  .get(wid).total;
                assert(
                  quota + bytes.length <= limits.attachmentQuotaBytes,
                  413,
                  "ATTACHMENT_QUOTA",
                  "A quota de anexos deste workspace foi atingida.",
                );
                const attachmentId = id("attachment");
                db.prepare(
                  "INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
                ).run(
                  attachmentId,
                  wid,
                  resource[1],
                  storageKey,
                  name,
                  mime,
                  bytes.length,
                  createHash("sha256").update(bytes).digest("hex"),
                  userId,
                  new Date().toISOString(),
                );
                db.prepare(
                  "UPDATE workspace_meta SET revision=revision+1 WHERE workspace_id=?",
                ).run(wid);
                service.audit(wid, {
                  eventType: "attachment_created",
                  aggregateId: resource[1],
                  actorId: userId,
                  correlationId,
                  after: { id: attachmentId, name, size: bytes.length },
                });
              },
              { transaction: true },
            );
            committed = true;
          } finally {
            await unlink(temp).catch(() => {});
            if (!committed) await unlink(destination).catch(() => {});
          }
          return sendJson(
            res,
            201,
            service.projection(wid, userId, { correlationId }),
          );
        }
        if (
          (resource = suffix.match(/^\/attachments\/([^/]+)\/download-url$/)) &&
          method === "POST"
        ) {
          const attachment = withAuthorizedDomain(
              wid,
              userId,
              correlationId,
              (ctx) => checkAttachment(ctx, wid, resource[1]),
            ),
            expires = Date.now() + 5 * 60 * 1000;
          const payload = Buffer.from(
            JSON.stringify({ wid, aid: attachment.id, uid: userId, expires }),
          ).toString("base64url");
          const signature = createHmac("sha256", downloadKey)
            .update(payload)
            .digest("base64url");
          return sendJson(res, 200, {
            url: `/api/workspaces/${encodeURIComponent(wid)}/attachments/${encodeURIComponent(attachment.id)}/content?token=${payload}.${signature}`,
            expiresAt: new Date(expires).toISOString(),
          });
        }
        if (
          (resource = suffix.match(/^\/attachments\/([^/]+)\/content$/)) &&
          method === "GET"
        ) {
          const [payload, signature] = String(
              url.searchParams.get("token") || "",
            ).split("."),
            expected = createHmac("sha256", downloadKey)
              .update(payload || "")
              .digest("base64url");
          assert(
            typeof signature === "string" &&
              /^[A-Za-z0-9_-]{43}$/.test(signature) &&
              timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
            403,
            "INVALID_DOWNLOAD_TOKEN",
            "Link de download inválido.",
          );
          let token;
          try {
            token = JSON.parse(
              Buffer.from(payload, "base64url").toString("utf8"),
            );
          } catch {
            throw new HttpError(
              403,
              "INVALID_DOWNLOAD_TOKEN",
              "Link de download inválido.",
            );
          }
          assert(
            token.wid === wid &&
              token.aid === resource[1] &&
              token.uid === userId &&
              token.expires > Date.now(),
            403,
            "DOWNLOAD_EXPIRED",
            "O link expirou. Solicite outro download.",
          );
          const attachment = withAuthorizedDomain(
            wid,
            userId,
            correlationId,
            (ctx) => checkAttachment(ctx, wid, resource[1]),
          );
          const bytes = await readFile(
            join(storage.dataDir, "attachments", attachment.storage_key),
          );
          res.writeHead(200, {
            "Content-Type": attachment.mime,
            "Content-Length": bytes.length,
            "Content-Disposition": `attachment; filename="anexo${extname(attachment.name)}"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          });
          return res.end(bytes);
        }
        if (
          (resource = suffix.match(/^\/attachments\/([^/]+)$/)) &&
          method === "DELETE"
        ) {
          withAuthorizedDomain(
            wid,
            userId,
            correlationId,
            (ctx) => {
              const attachment = checkAttachment(
                ctx,
                wid,
                resource[1],
                "delete_attachment",
              );
              db.prepare(
                "UPDATE attachments SET deleted_at=?,deleted_by=? WHERE id=?",
              ).run(new Date().toISOString(), userId, attachment.id);
              db.prepare(
                "UPDATE workspace_meta SET revision=revision+1 WHERE workspace_id=?",
              ).run(wid);
              service.audit(wid, {
                eventType: "attachment_deleted",
                aggregateId: attachment.item_id,
                actorId: userId,
                correlationId,
                before: { id: attachment.id, name: attachment.name },
                after: { deleted: true },
              });
            },
            { transaction: true },
          );
          return sendJson(
            res,
            200,
            service.projection(wid, userId, { correlationId }),
          );
        }
        throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado.");
      }
      assert(
        ["GET", "HEAD"].includes(method),
        405,
        "METHOD_NOT_ALLOWED",
        "Método não permitido.",
      );
      const requested =
        path === "/"
          ? "index.html"
          : decodeURIComponent(path).replace(/^\//, "");
      assert(
        requested &&
          !requested.includes("..") &&
          !requested.includes("\\") &&
          !requested.startsWith(".") &&
          Object.hasOwn(mimeTypes, extname(requested)),
        404,
        "NOT_FOUND",
        "Arquivo não encontrado.",
      );
      const file = resolve(root, requested);
      assert(
        file.startsWith(root),
        404,
        "NOT_FOUND",
        "Arquivo não encontrado.",
      );
      let content;
      try {
        content = await readFile(file);
      } catch {
        throw new HttpError(404, "NOT_FOUND", "Arquivo não encontrado.");
      }
      if (requested === "index.html")
        content = Buffer.from(
          content
            .toString("utf8")
            .replace(
              '<script src="./app.js',
              '<script src="/api/runtime.js"></script>\n    <script src="./app.js',
            ),
        );
      res.writeHead(200, {
        "Content-Type": mimeTypes[extname(file)],
        "Cache-Control": "no-cache",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      res.end(method === "HEAD" ? undefined : content);
    } catch (error) {
      sendError(req, res, error, logger);
    }
  }
  const server = createServer(handler);
  server.requestTimeout = 120000;
  server.headersTimeout = 20000;
  server.maxRequestsPerSocket = 1000;
  let closed = false;
  return {
    server,
    storage,
    service,
    auth,
    async close() {
      if (closed) return;
      closed = true;
      if (server.listening)
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
      storage.close();
    },
  };
}

function validateMagic(extension, bytes) {
  const first = bytes.subarray(0, 16),
    text = bytes.subarray(0, 1024).toString("utf8");
  if (extension === ".pdf")
    assert(
      text.startsWith("%PDF-"),
      422,
      "FILE_CONTENT_TYPE",
      "O conteúdo não corresponde a um PDF.",
    );
  if ([".xlsx", ".docx", ".pptx"].includes(extension))
    assert(
      first[0] === 0x50 && first[1] === 0x4b,
      422,
      "FILE_CONTENT_TYPE",
      "Documento Office inválido.",
    );
  if (extension === ".png")
    assert(
      first
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      422,
      "FILE_CONTENT_TYPE",
      "Imagem PNG inválida.",
    );
  if ([".jpg", ".jpeg"].includes(extension))
    assert(
      first[0] === 255 && first[1] === 216,
      422,
      "FILE_CONTENT_TYPE",
      "Imagem JPEG inválida.",
    );
  if (extension === ".gif")
    assert(
      /^GIF8[79]a/.test(text),
      422,
      "FILE_CONTENT_TYPE",
      "Imagem GIF inválida.",
    );
  if (extension === ".webp")
    assert(
      first.subarray(0, 4).toString() === "RIFF" &&
        first.subarray(8, 12).toString() === "WEBP",
      422,
      "FILE_CONTENT_TYPE",
      "Imagem WEBP inválida.",
    );
  if ([".txt", ".csv"].includes(extension))
    assert(
      !bytes.includes(0),
      422,
      "FILE_CONTENT_TYPE",
      "O arquivo de texto contém dados binários.",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const app = createApp(),
      port = numberEnv("PORT", 3000),
      host = process.env.HOST || "127.0.0.1";
    app.server.listen(port, host, () =>
      console.log(
        JSON.stringify({
          event: "server_started",
          url: process.env.PUBLIC_ORIGIN || `http://${host}:${port}`,
          dataDir: app.storage.dataDir,
        }),
      ),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => app.close().then(() => process.exit(0)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
