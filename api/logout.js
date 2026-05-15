const { clearSessionCookie, json } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
};
