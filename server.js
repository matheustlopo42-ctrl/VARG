const express = require("express");
const path = require("path");
const config = require("./src/config");
const { migrar, q } = require("./src/db");

const app = express();
app.set("trust proxy", 1); // Render fica atrás de proxy (IP real para o limite de tentativas)
app.disable("x-powered-by");

// Cabeçalhos de segurança básicos
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (config.isProd) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});

// rawBody é necessário para validar a assinatura dos webhooks
app.use(express.json({ limit: "200kb", verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));

app.use(require("./src/routes/loja"));
app.use(require("./src/routes/admin"));

app.get("/healthz", async (req, res) => {
  try { await q("SELECT 1"); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});

// Endereços do site antigo
const REDIRECTS = { "/meus-pedidos.html": "/conta.html", "/painel.html": "/conta.html", "/perfil.html": "/conta.html#dados", "/admin.html": "/admin/", "/admin-login.html": "/admin/", "/admin-login": "/admin/", "/admin": "/admin/", "/confirmação.html": "/conta.html" };
app.use((req, res, next) => (REDIRECTS[decodeURIComponent(req.path)] ? res.redirect(301, REDIRECTS[decodeURIComponent(req.path)]) : next()));

// Só a pasta public/ é servida. O código do servidor e o .env nunca ficam acessíveis.
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: config.isProd ? "1h" : 0 }));

app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "404.html")));

// Erros não tratados
app.use((err, req, res, next) => {
  console.error("[erro]", req.method, req.path, err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido." });
  res.status(500).json({ erro: "Erro interno. Tente novamente." });
});

// Cancela PIX não pagos após 48h (devolve nada ao estoque porque o estoque só baixa no pagamento)
async function limparPendentes() {
  try {
    const { rows } = await q(
      `UPDATE pedidos SET status='cancelado', atualizado_em=NOW()
       WHERE status='aguardando_pagamento' AND metodo='pix' AND criado_em < NOW() - INTERVAL '48 hours' RETURNING id`
    );
    for (const r of rows) await q(`INSERT INTO pedido_eventos (pedido_id, status, nota) VALUES ($1,'cancelado','Cancelado automaticamente: PIX não pago em 48h')`, [r.id]);
    if (rows.length) console.log(`[limpeza] ${rows.length} pedido(s) PIX expirados cancelados`);
  } catch (e) {
    console.error("[limpeza]", e.message);
  }
}

migrar()
  .then(() => {
    app.listen(config.port, () => console.log(`VARG rodando em ${config.baseUrl} (porta ${config.port})`));
    limparPendentes();
    setInterval(limparPendentes, 60 * 60 * 1000);
  })
  .catch((e) => {
    console.error("Erro ao preparar o banco:", e.message);
    process.exit(1);
  });
