const { handleError, json, readBody, readTree, requireSession, writeTree } = require("./_lib");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      json(res, 200, await readTree());
      return;
    }

    if (req.method === "PUT") {
      if (!requireSession(req, res)) return;
      const body = await readBody(req);
      if (!Array.isArray(body.people)) {
        json(res, 400, { error: "people_array_required" });
        return;
      }
      json(res, 200, await writeTree(body));
      return;
    }

    json(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    handleError(res, error);
  }
};
