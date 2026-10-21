import {
  scrypt as scryptCallback,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpError, assert, parseCookies, requireSameOrigin } from "./http.mjs";

const scrypt = promisify(scryptCallback);
const PARAMETERS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const COOKIE = "fv_session";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function validatePassword(password) {
  assert(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 128,
    400,
    "INVALID_PASSWORD",
    "A senha deve ter entre 12 e 128 caracteres.",
  );
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMETERS);
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  if (
    typeof password !== "string" ||
    password.length > 128 ||
    typeof storedHash !== "string"
  )
    return false;
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$32768$8$1")
    return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64, PARAMETERS);
  return timingSafeEqual(actual, expected);
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    disabled: Boolean(user.disabled),
  };
}

/** Credentials and sessions are global; memberships and domain GPO authorize workspaces. */
export function createAuth({
  storage,
  publicOrigin = process.env.PUBLIC_ORIGIN || "",
  secureCookies = publicOrigin.startsWith("https://"),
  sessionTtlMs = 12 * 60 * 60 * 1000,
  idleTtlMs = 2 * 60 * 60 * 1000,
  rateLimit = {},
} = {}) {
  if (!storage?.db) throw new TypeError("storage é obrigatório.");
  const { db } = storage;
  const maxAttempts = rateLimit.maxAttempts ?? 5;
  const maxIpAttempts =
    rateLimit.maxIpAttempts ?? Math.max(30, maxAttempts * 6);
  const windowMs = rateLimit.windowMs ?? 15 * 60 * 1000;
  for (const [name, value] of Object.entries({
    sessionTtlMs,
    idleTtlMs,
    maxAttempts,
    maxIpAttempts,
    windowMs,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${name} deve ser um inteiro positivo.`);
  }
  // A missing account performs the same scrypt work as an existing account.
  const dummyHash = `scrypt$32768$8$1$${randomBytes(16).toString("base64url")}$${randomBytes(64).toString("base64url")}`;
  const log = (eventType, userId, ip = "", metadata = {}) =>
    db
      .prepare(
        "INSERT INTO auth_events(user_id,event_type,ip_hash,recorded_at,metadata_json) VALUES (?,?,?,?,?)",
      )
      .run(
        userId || null,
        eventType,
        ip ? sha256(ip) : null,
        new Date().toISOString(),
        JSON.stringify(metadata),
      );

  function consumeAttempt(email, ip) {
    const now = Date.now();
    const entries = [
      { key: `account:${sha256(email)}`, max: maxAttempts },
      { key: `ip:${sha256(ip || "unknown")}`, max: maxIpAttempts },
    ];
    storage.transaction(() => {
      db.prepare("DELETE FROM login_attempts WHERE window_start < ?").run(
        now - windowMs,
      );
      for (const entry of entries) {
        const row = db
          .prepare("SELECT * FROM login_attempts WHERE key=?")
          .get(entry.key);
        if (row && row.count >= entry.max) {
          throw new HttpError(
            429,
            "LOGIN_RATE_LIMITED",
            "Muitas tentativas de acesso. Aguarde antes de tentar novamente.",
            {
              retryAfterSeconds: Math.max(
                1,
                Math.ceil((row.window_start + windowMs - now) / 1000),
              ),
            },
          );
        }
      }
      for (const entry of entries)
        db.prepare(
          `
        INSERT INTO login_attempts(key,window_start,count) VALUES (?,?,1)
        ON CONFLICT(key) DO UPDATE SET count=count+1
      `,
        ).run(entry.key, now);
    });
    return entries;
  }

  const auth = {
    async login({ email, password, ip = "" } = {}) {
      assert(
        typeof email === "string" &&
          email.length <= 254 &&
          typeof password === "string" &&
          password.length <= 128,
        400,
        "INVALID_CREDENTIALS",
        "Informe e-mail e senha válidos.",
      );
      const normalizedEmail = email.trim().toLowerCase();
      assert(
        normalizedEmail.length > 0 && password.length > 0,
        400,
        "INVALID_CREDENTIALS",
        "Informe e-mail e senha.",
      );
      const attemptEntries = consumeAttempt(normalizedEmail, ip);
      const user = db
        .prepare("SELECT * FROM auth_users WHERE email=? COLLATE NOCASE")
        .get(normalizedEmail);
      const valid = await verifyPassword(
        password,
        user?.password_hash || dummyHash,
      );
      if (!user || !valid || user.disabled) {
        log("login_failed", user?.id, ip);
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "E-mail ou senha inválidos.",
        );
      }
      // Re-read after async hashing: an account may have been disabled or reset meanwhile.
      const current = db
        .prepare("SELECT * FROM auth_users WHERE id=?")
        .get(user.id);
      if (
        !current ||
        current.disabled ||
        current.password_hash !== user.password_hash
      ) {
        log("login_failed", user.id, ip);
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "E-mail ou senha inválidos.",
        );
      }
      const token = newToken();
      const csrfToken = newToken();
      const now = Date.now();
      storage.transaction(() => {
        db.prepare(
          "DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?",
        ).run(now, now - idleTtlMs);
        db.prepare(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)",
        ).run(sha256(token), user.id, csrfToken, now, now + sessionTtlMs, now);
        db.prepare("DELETE FROM login_attempts WHERE key=?").run(
          attemptEntries[0].key,
        );
        db.prepare(
          "UPDATE login_attempts SET count=MAX(0,count-1) WHERE key=?",
        ).run(attemptEntries[1].key);
        log("login_succeeded", user.id, ip);
      });
      return {
        token,
        csrfToken,
        user: publicUser(current),
        expiresAt: new Date(now + sessionTtlMs).toISOString(),
      };
    },

    authenticate(request) {
      const token = parseCookies(request.headers.cookie)[COOKIE];
      assert(
        typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token),
        401,
        "AUTHENTICATION_REQUIRED",
        "Entre na sua conta para continuar.",
      );
      const tokenHash = sha256(token);
      const row = db
        .prepare(
          `SELECT s.*, u.name, u.email, u.disabled
        FROM sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=?`,
        )
        .get(tokenHash);
      const now = Date.now();
      if (
        !row ||
        row.disabled ||
        row.expires_at <= now ||
        row.last_seen_at + idleTtlMs <= now
      ) {
        if (row)
          db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash);
        throw new HttpError(
          401,
          "SESSION_EXPIRED",
          "Sua sessão expirou. Entre novamente.",
        );
      }
      if (row.last_seen_at + Math.min(60000, Math.floor(idleTtlMs / 2)) < now) {
        db.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?").run(
          now,
          tokenHash,
        );
      }
      return {
        user: publicUser({ ...row, id: row.user_id }),
        csrfToken: row.csrf_token,
        tokenHash,
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    },

    requireCsrf(request, session) {
      requireSameOrigin(request, publicOrigin);
      assert(
        safeEqual(request.headers["x-csrf-token"], session.csrfToken),
        403,
        "INVALID_CSRF_TOKEN",
        "A sessão de edição mudou. Atualize a página e tente novamente.",
      );
    },

    logout(session) {
      storage.transaction(() => {
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          session.tokenHash,
        );
        log("logout", session.user.id);
      });
    },

    async setPassword(userId, password, { beforeCommit } = {}) {
      const passwordHash = await hashPassword(password);
      storage.transaction(() => {
        beforeCommit?.();
        const result = db
          .prepare(
            "UPDATE auth_users SET password_hash=?,updated_at=? WHERE id=?",
          )
          .run(passwordHash, new Date().toISOString(), userId);
        assert(
          result.changes === 1,
          404,
          "USER_NOT_FOUND",
          "Usuário não encontrado.",
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
        log("password_changed", userId);
      });
    },

    revokeUser(userId) {
      storage.transaction(() => {
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
        log("sessions_revoked", userId);
      });
    },

    cookie(token) {
      return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secureCookies ? "; Secure" : ""}`;
    },
    clearCookie() {
      return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureCookies ? "; Secure" : ""}`;
    },
  };
  return auth;
}
