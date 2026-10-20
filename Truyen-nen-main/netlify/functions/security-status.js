const { securityAudit } = require("../../lib/security");

function response(statusCode, body) {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });
  return response(200, securityAudit(process.env));
};
