const { getStorageConfig, json } = require("./_lib");

module.exports = async function handler(req, res) {
  json(res, 200, {
    ok: true,
    app: "family-tree-vercel-backend",
    storage: getStorageConfig().configured ? "configured" : "missing",
  });
};
