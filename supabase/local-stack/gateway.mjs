// A pocket Supabase for local testing: /rest/v1 goes to PostgREST (real RLS), and /auth/v1
// answers the few auth calls the app makes. `node gateway.mjs token <uid> <email>` prints a
// session cookie value for that user.
import http from "node:http";
import crypto from "node:crypto";

const SECRET = "local-only-secret-for-6toc-e2e-testing-000000";
const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

function jwt(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 86400 * 30 })}`;
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

function verify(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString());
}

const userOf = (claims) => ({ id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" });

function session(sub, email) {
  const access_token = jwt(sub, email);
  const claims = verify(access_token);
  return { access_token, token_type: "bearer", expires_in: 86400 * 30, expires_at: claims.exp, refresh_token: `refresh-${sub}`, user: userOf(claims) };
}

if (process.argv[2] === "token") {
  console.log(`base64-${b64(session(process.argv[3], process.argv[4]))}`);
  process.exit(0);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range, x-supabase-api-version",
};
const log = [];

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const send = (status, data) => { res.writeHead(status, { ...CORS, "content-type": "application/json" }); res.end(data === undefined ? "" : JSON.stringify(data)); };
  const claims = verify(req.headers.authorization?.replace(/^Bearer /, ""));

  if (url.pathname === "/__log") return send(200, log.splice(0));
  if (url.pathname === "/__cookie") {
    const people = { olive: ["11111111-1111-1111-1111-111111111111", "olive@example.com"], sam: ["22222222-2222-2222-2222-222222222222", "sam@example.com"], tess: ["33333333-3333-3333-3333-333333333333", "tess@example.com"] };
    return send(200, `base64-${b64(session(...people[url.searchParams.get("who")]))}`);
  }
  if (url.pathname.startsWith("/auth/v1/")) {
    const path = url.pathname.slice(8);
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      log.push({ method: req.method, path, query: url.search, body });
      if (path === "/user") return claims ? send(200, userOf(claims)) : send(401, { code: 401, error_code: "no_authorization", msg: "no user" });
      if (path === "/logout") return send(204);
      if (path === "/otp") return send(200, {});
      if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const sub = JSON.parse(body || "{}").refresh_token?.replace("refresh-", "");
        return sub ? send(200, session(sub, `${sub}@unknown`)) : send(400, { error: "invalid_grant" });
      }
      return send(404, { msg: `mock has no ${path}` });
    });
    return;
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const headers = { ...req.headers, host: "127.0.0.1:54401" };
    // Supabase sends the publishable key as a bearer token when signed out.
    if (!claims) delete headers.authorization;
    const upstream = http.request({ host: "127.0.0.1", port: 54401, method: req.method, path: url.pathname.slice(8) + url.search, headers }, (up) => {
      res.writeHead(up.statusCode, { ...up.headers, ...CORS });
      up.pipe(res);
    });
    upstream.on("error", (error) => send(502, { message: error.message }));
    req.pipe(upstream);
    return;
  }
  send(404, { msg: "not here" });
}).listen(54400, "127.0.0.1", () => console.log("gateway on http://127.0.0.1:54400"));
