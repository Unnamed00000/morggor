const crypto = require("crypto");

const TREE_KEY = "margoshvili-family-tree";
const EDIT_LOGIN = process.env.TREE_LOGIN || "admin";
const EDIT_PASSWORD = process.env.TREE_PASSWORD || "margoshvili";
const SESSION_COOKIE = "family_tree_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_TREE = { app: "offline-family-tree", version: 2, people: [] };

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

function getStorageConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return { url, token, configured: Boolean(url && token) };
}

async function redisCommand(command) {
  const { url, token, configured } = getStorageConfig();
  if (!configured) {
    const error = new Error("Storage is not configured");
    error.code = "STORAGE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || "Redis command failed");
    error.status = response.status;
    throw error;
  }
  return data.result;
}

async function readTree() {
  const stored = await redisCommand(["GET", TREE_KEY]);
  if (!stored) return DEFAULT_TREE;
  const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
  return Array.isArray(parsed.people) ? parsed : DEFAULT_TREE;
}

async function writeTree(body) {
  const cleanTree = {
    app: "offline-family-tree",
    version: 2,
    savedAt: new Date().toISOString(),
    people: Array.isArray(body.people) ? body.people : [],
  };
  await redisCommand(["SET", TREE_KEY, JSON.stringify(cleanTree)]);
  return cleanTree;
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function getSecret() {
  return process.env.SESSION_SECRET || EDIT_PASSWORD;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function createSessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const value = `${expiresAt}.${nonce}`;
  const token = `${value}.${sign(value)}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0`;
}

function isSessionValid(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const value = `${parts[0]}.${parts[1]}`;
  const expected = sign(value);
  const received = parts[2];
  if (expected.length !== received.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return false;
  return Number(parts[0]) > Math.floor(Date.now() / 1000);
}

function requireSession(req, res) {
  if (isSessionValid(req)) return true;
  json(res, 401, { error: "login_required" });
  return false;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function handleError(res, error) {
  if (error.code === "STORAGE_NOT_CONFIGURED") {
    json(res, 503, { error: "storage_not_configured" });
    return;
  }
  console.error(error);
  json(res, 500, { error: "server_error" });
}

module.exports = {
  EDIT_LOGIN,
  EDIT_PASSWORD,
  clearSessionCookie,
  createSessionCookie,
  getStorageConfig,
  handleError,
  isSessionValid,
  json,
  readBody,
  readTree,
  requireSession,
  writeTree,
};
