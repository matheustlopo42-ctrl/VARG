const jwt = require("jsonwebtoken");
const config = require("./config");

function token(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

function assinarCliente(u) {
  return jwt.sign({ sub: u.id, email: u.email, nome: u.nome, role: "cliente" }, config.jwtSecret, { expiresIn: "30d" });
}
function assinarAdmin() {
  return jwt.sign({ sub: "admin", role: "admin" }, config.jwtSecret, { expiresIn: "12h" });
}

function exigirCliente(req, res, next) {
  try {
    const p = jwt.verify(token(req) || "", config.jwtSecret);
    if (p.role !== "cliente") throw new Error();
    req.usuario = { id: p.sub, email: p.email, nome: p.nome };
    next();
  } catch {
    res.status(401).json({ erro: "Faça login para continuar." });
  }
}

function exigirAdmin(req, res, next) {
  try {
    const p = jwt.verify(token(req) || "", config.jwtSecret);
    if (p.role !== "admin") throw new Error();
    next();
  } catch {
    res.status(401).json({ erro: "Sessão de administrador expirada." });
  }
}

// Limite simples por IP (em memória) para login/cadastro/esqueci-senha
function limitar({ janelaMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), janelaMs).unref();
  return (req, res, next) => {
    const k = req.ip + req.path;
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (n > max) return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });
    next();
  };
}

// Captura erros de rotas async
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { assinarCliente, assinarAdmin, exigirCliente, exigirAdmin, limitar, rota };
