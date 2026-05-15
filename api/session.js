const { isSessionValid, json } = require("./_lib");

module.exports = async function handler(req, res) {
  json(res, 200, { unlocked: isSessionValid(req) });
};
