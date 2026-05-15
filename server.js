const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, "data", "rodoslovnoe-derevo-data.json");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const EDIT_LOGIN = process.env.TREE_LOGIN || "admin";
const EDIT_PASSWORD = process.env.TREE_PASSWORD || "margoshvili";
const SESSION_COOKIE = "family_tree_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 15 * 1024 * 1024;

const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Vary", "Origin");
}

function sendJson(req, res, statusCode, payload, headers = {}) {
  setCorsHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendText(req, res, statusCode, text) {
  setCorsHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
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

function createSession() {
  const id = crypto.randomUUID();
  sessions.set(id, Date.now() + SESSION_TTL_MS);
  return id;
}

function getSessionId(req) {
  const cookies = parseCookies(req);
  const id = cookies[SESSION_COOKIE];
  if (!id) return "";

  const expiresAt = sessions.get(id);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(id);
    return "";
  }

  sessions.set(id, Date.now() + SESSION_TTL_MS);
  return id;
}

function requireSession(req, res) {
  if (getSessionId(req)) return true;
  sendJson(req, res, 401, { error: "login_required" });
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

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

async function ensureDataFile() {
  await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    await writeTree({ app: "offline-family-tree", version: 2, people: [] });
  }
}

async function readTree() {
  await ensureDataFile();
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw || "{}");
  if (!Array.isArray(data.people)) {
    return { app: "offline-family-tree", version: 2, people: [] };
  }
  return data;
}

async function writeTree(data) {
  const cleanData = {
    app: "offline-family-tree",
    version: 2,
    savedAt: new Date().toISOString(),
    people: Array.isArray(data.people) ? data.people : [],
  };
  const tempFile = DATA_FILE + ".tmp";
  await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fsp.writeFile(tempFile, JSON.stringify(cleanData, null, 2), "utf8");
  await fsp.rename(tempFile, DATA_FILE);
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (pathname === "/api/status" && req.method === "GET") {
    sendJson(req, res, 200, { ok: true, app: "family-tree-backend" });
    return true;
  }

  if (pathname === "/api/session" && req.method === "GET") {
    sendJson(req, res, 200, { unlocked: Boolean(getSessionId(req)) });
    return true;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    if (body.login === EDIT_LOGIN && body.password === EDIT_PASSWORD) {
      const sessionId = createSession();
      sendJson(req, res, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
      });
      return true;
    }
    sendJson(req, res, 403, { error: "bad_login" });
    return true;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const sessionId = getSessionId(req);
    if (sessionId) sessions.delete(sessionId);
    sendJson(req, res, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
    return true;
  }

  if (pathname === "/api/tree" && req.method === "GET") {
    sendJson(req, res, 200, await readTree());
    return true;
  }

  if (pathname === "/api/tree" && req.method === "PUT") {
    if (!requireSession(req, res)) return true;
    const body = await readBody(req);
    if (!Array.isArray(body.people)) {
      sendJson(req, res, 400, { error: "people_array_required" });
      return true;
    }
    await writeTree(body);
    sendJson(req, res, 200, { ok: true });
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(req, res, 404, { error: "not_found" });
    return true;
  }

  return false;
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR) || filePath === __filename) {
    sendText(req, res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      sendText(req, res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendText(req, res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (await handleApi(req, res, url.pathname)) return;
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(req, res, 500, { error: "server_error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Family tree backend is running: http://localhost:${PORT}`);
  console.log(`Login: ${EDIT_LOGIN}`);
  console.log("Password: set TREE_PASSWORD to change the default password.");
});
