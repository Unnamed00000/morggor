const { EDIT_LOGIN, EDIT_PASSWORD, createSessionCookie, json, readBody } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const body = await readBody(req);
  if (body.login === EDIT_LOGIN && body.password === EDIT_PASSWORD) {
    json(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie() });
    return;
  }

  json(res, 403, { error: "bad_login" });
};
