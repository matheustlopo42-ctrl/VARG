const express = require("express");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== BANCO DE DADOS ====================
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { host: "localhost", port: 5432, database: "postgres", user: "postgres", password: "123" }
);

// ==================== MIDDLEWARES ====================
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ==================== CREDENCIAIS ====================
const PIXGO_API_KEY = process.env.PIXGO_API_KEY || "pk_a11c371cd9771d6c91e5211016d350e15f349161f001754109a8eb0a2e92233b";
const PIXGO_WEBHOOK_SECRET = process.env.PIXGO_WEBHOOK_SECRET || "whsec_5fcff2c2534505e4d0d9fbceed4c47f39e1d558bf508712a531f957e0ee3c99d";
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "TEST-8514428929430007-051219-1ffa08d06b14b182133e70460fcdd29c-239972134";
const BASE_URL = process.env.BASE_URL || "https://varg-bnlz.onrender.com";
const EMAIL_USER = process.env.EMAIL_USER || "matheustlopo42@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "pplezzjcvzyakzdc";
const EMAIL_DESTINO = process.env.EMAIL_DESTINO || "varg.oficialstore@gmail.com";
const WA_PHONE = process.env.WA_PHONE || "5512988875509";
const WA_APIKEY = process.env.WA_APIKEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "159357456258";

// ==================== RESEND ====================
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_H34dbCvj_JYsUmRBKpMNXbCaLf6ZKeEM3";
const resend = new (require("resend").Resend)(RESEND_API_KEY);

async function enviarEmail({ to, subject, html }) {
  const { error } = await resend.emails.send({ from: "VARG <onboarding@resend.dev>", to, subject, html });
  if (error) throw new Error(JSON.stringify(error));
}

// ==================== WHATSAPP ====================
async function enviarWhatsApp(mensagem) {
  if (!WA_APIKEY) return console.log("WA_APIKEY nao configurada");
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encodeURIComponent(mensagem)}&apikey=${WA_APIKEY}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { console.log("WhatsApp enviado:", data); resolve(); });
    }).on("error", (e) => { console.error("Erro WhatsApp:", e.message); resolve(); });
  });
}

// ==================== ADMIN AUTH ====================
function adminAuth(req, res, next) {
  const expected = Buffer.from("admin:" + ADMIN_PASSWORD).toString("base64");
  const auth = req.headers["x-admin-token"] || req.query.token;
  if (auth === expected) return next();
  res.redirect("/admin-login");
}

// ==================== PAGINA INICIAL ====================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ==================== LOGIN ====================
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.json({ success: false, message: "E-mail ou senha incorretos." });
    const usuario = result.rows[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta) return res.json({ success: false, message: "E-mail ou senha incorretos." });
    res.json({ success: true, nome: usuario.nome });
  } catch (err) {
    console.error("Erro no login:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

// ==================== CADASTRO ====================
app.post("/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const existe = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
    if (existe.rows.length > 0) return res.json({ success: false, message: "Este e-mail ja esta cadastrado." });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query("INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3)", [nome, email, hash]);
    res.json({ success: true, message: "Cadastro realizado com sucesso!" });
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

// ==================== ESQUECI SENHA ====================
app.post("/esqueci-senha", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: "Informe o e-mail." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.json({ success: false, message: "E-mail nao encontrado." });
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query("UPDATE usuarios SET reset_token = $1, reset_expires = $2 WHERE email = $3", [token, expires, email]);
    const resetLink = BASE_URL + "/redefinir-senha.html?token=" + token;
    await enviarEmail({
      to: EMAIL_DESTINO,
      subject: "VARG - Redefinicao de senha para " + email,
      html: "<h2 style='color:#DC143C'>Redefinicao de Senha</h2><p>Ola, " + result.rows[0].nome + "!</p><p>Clique abaixo para redefinir sua senha:</p><p><a href='" + resetLink + "' style='background:#DC143C;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;font-weight:bold;'>Redefinir Senha</a></p><p style='color:#888;font-size:0.9em;'>Este link expira em 1 hora.</p>"
    });
    res.json({ success: true, message: "Email enviado! Verifique sua caixa de entrada." });
  } catch (err) {
    console.error("Erro esqueci-senha:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

app.post("/redefinir-senha", async (req, res) => {
  const { token, novaSenha } = req.body;
  if (!token || !novaSenha) return res.json({ success: false, message: "Dados incompletos." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE reset_token = $1 AND reset_expires > NOW()", [token]);
    if (result.rows.length === 0) return res.json({ success: false, message: "Link invalido ou expirado." });
    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query("UPDATE usuarios SET senha = $1, reset_token = NULL, reset_expires = NULL WHERE reset_token = $2", [hash, token]);
    res.json({ success: true, message: "Senha redefinida com sucesso!" });
  } catch (err) {
    console.error("Erro redefinir-senha:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

// ==================== PIX ====================
app.post("/pix", async (req, res) => {
  const amountCents = parseInt(req.body.amount ?? 3990);
  const valor = amountCents / 100;
  const cart = req.body.cart || [];
  const entrega = req.body.entrega || null;
  const externalId = "VARG_" + Date.now();

  await pool.query(
    "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens, entrega) VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7) ON CONFLICT (payment_id) DO NOTHING",
    ["PIX_PENDING_" + externalId, externalId, req.body.nome || "", "", valor, JSON.stringify(cart), entrega ? JSON.stringify(entrega) : null]
  ).catch(() => {});

  const payload = JSON.stringify({ amount: valor, description: "Pedido VARG", external_id: externalId, webhook_url: BASE_URL + "/webhook/pixgo" });
  const options = { hostname: "pixgo.org", path: "/api/v1/payment/create", method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": PIXGO_API_KEY, "Content-Length": Buffer.byteLength(payload) } };
  const request = https.request(options, (response) => {
    let data = "";
    response.on("data", (chunk) => (data += chunk));
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        if (json.success && json.data) {
          res.json({ success: true, qr_image: json.data.qr_image_url ?? "", pix_code: json.data.qr_code ?? "" });
        } else {
          res.json({ error: json.message ?? json.error ?? "Erro desconhecido" });
        }
      } catch (e) { res.json({ error: "Resposta invalida da API" }); }
    });
  });
  request.on("error", (e) => res.json({ error: "Falha na conexao: " + e.message }));
  request.write(payload);
  request.end();
});

// ==================== MERCADO PAGO ====================
app.post("/mp-preference", async (req, res) => {
  const { cart } = req.body;
  if (!cart || cart.length === 0) return res.json({ error: "Carrinho vazio" });
  const items = cart.map((i) => ({ title: i.nome, quantity: parseInt(i.quantidade), unit_price: parseFloat(i.preco), currency_id: "BRL" }));
  const payload = JSON.stringify({ items, notification_url: BASE_URL + "/webhook/mercadopago", back_urls: { success: "https://www.mercadopago.com.br", failure: "https://www.mercadopago.com.br", pending: "https://www.mercadopago.com.br" }, auto_return: "approved" });
  const options = { hostname: "api.mercadopago.com", path: "/checkout/preferences", method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + MP_ACCESS_TOKEN, "Content-Length": Buffer.byteLength(payload) } };
  const request = https.request(options, (response) => {
    let data = "";
    response.on("data", (chunk) => (data += chunk));
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        if (json.init_point) { res.json({ init_point: json.init_point }); }
        else { res.json({ error: "Erro ao criar preferencia" }); }
      } catch (e) { res.json({ error: "Resposta invalida do MP" }); }
    });
  });
  request.on("error", (e) => res.json({ error: e.message }));
  request.write(payload);
  request.end();
});

// ==================== WEBHOOK PIXGO ====================
app.post("/webhook/pixgo", async (req, res) => {
  const timestamp = req.headers["x-webhook-timestamp"];
  const signature = req.headers["x-webhook-signature"];
  const event = req.headers["x-webhook-event"];
  const rawBody = req.rawBody;
  if (!timestamp || !signature || !rawBody) return res.status(400).json({ error: "Headers ausentes" });
  const expected = crypto.createHmac("sha256", PIXGO_WEBHOOK_SECRET).update(timestamp + "." + rawBody).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex")))
      return res.status(401).json({ error: "Assinatura invalida" });
  } catch { return res.status(401).json({ error: "Erro ao verificar assinatura" }); }
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > 300)
    return res.status(401).json({ error: "Timestamp expirado" });

  const data = req.body;
  console.log("Webhook PixGo:", event);
  res.status(200).json({ received: true });

  if (event === "payment.completed") {
    const pid = data.data?.payment_id;
    const nome = data.data?.customer?.name || "N/A";
    const valor = data.data?.amounts?.gross || 0;
    const pedido = data.data?.external_id;
    console.log("PAGO via PIX!", pid, nome, valor);

    let itens = "[]";
    let entrega = null;
    try {
      const row = await pool.query("SELECT itens, entrega FROM pedidos WHERE external_id = $1 LIMIT 1", [pedido]);
      if (row.rows.length > 0) { itens = row.rows[0].itens || "[]"; entrega = row.rows[0].entrega; }
    } catch(e) {}

    try {
      await pool.query(
        "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens, entrega) VALUES ($1, $2, $3, $4, $5, 'pago', $6, $7) ON CONFLICT (payment_id) DO UPDATE SET status = 'pago', itens = $6, entrega = $7",
        [pid, pedido, nome, data.data?.customer?.email || "", valor, itens, entrega]
      );
      console.log("Pedido salvo!");
    } catch (err) { console.error("Erro ao salvar pedido:", err.message); }

    try {
      let itensPix = [];
      try { itensPix = JSON.parse(itens); } catch(e) {}
      let entregaPix = null;
      try { entregaPix = entrega ? JSON.parse(entrega) : null; } catch(e) {}
      const itensHtml = itensPix.length > 0 ? "<p><b>Produtos:</b></p><ul>" + itensPix.map(i => "<li>" + i.quantidade + "x " + i.nome + " - R$ " + parseFloat(i.preco).toFixed(2) + "</li>").join("") + "</ul>" : "";
      const entregaHtml = entregaPix ? "<p><b>Entrega:</b></p><p>" + entregaPix.nome + " | " + entregaPix.telefone + " | CPF: " + entregaPix.cpf + "</p><p>" + entregaPix.rua + ", " + entregaPix.numero + " - " + entregaPix.bairro + "</p><p>" + entregaPix.cidade + "/" + entregaPix.estado + " - CEP: " + entregaPix.cep + "</p>" : "";
      await enviarEmail({ to: EMAIL_DESTINO, subject: "Nova venda PIX - R$ " + valor, html: "<h2 style='color:#DC143C'>Nova venda confirmada!</h2><p><b>Metodo:</b> PIX</p><p><b>Cliente:</b> " + nome + "</p><p><b>Valor:</b> R$ " + valor + "</p>" + itensHtml + entregaHtml + "<p><b>Pedido:</b> " + pedido + "</p>" });
      console.log("Email enviado!");
      const itensWa = itensPix.length > 0 ? "\nProdutos:\n" + itensPix.map(i => "  - " + i.quantidade + "x " + i.nome).join("\n") : "";
      const entregaWa = entregaPix ? "\nEntrega: " + entregaPix.rua + ", " + entregaPix.numero + " - " + entregaPix.cidade + "/" + entregaPix.estado : "";
      await enviarWhatsApp("VARG - Nova venda PIX!\nCliente: " + nome + "\nValor: R$ " + valor + itensWa + entregaWa + "\nPedido: " + pedido);
    } catch (err) { console.error("Erro notificacoes:", err.message); }
  }
  if (event === "payment.expired") console.log("PIX expirou:", data.data?.payment_id);
});

// ==================== WEBHOOK MERCADO PAGO ====================
app.post("/webhook/mercadopago", async (req, res) => {
  res.status(200).json({ received: true });
  const paymentId = req.body.data?.id || req.body.resource?.id;
  if (!paymentId) return;
  try {
    const options = { hostname: "api.mercadopago.com", path: "/v1/payments/" + paymentId, headers: { Authorization: "Bearer " + MP_ACCESS_TOKEN } };
    const paymentData = await new Promise((resolve, reject) => {
      https.get(options, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(JSON.parse(d))); }).on("error", reject);
    });
    if (paymentData.status === "approved") {
      const nome = ((paymentData.payer?.first_name || "") + " " + (paymentData.payer?.last_name || "")).trim();
      const valor = paymentData.transaction_amount;
      const pid = String(paymentData.id);
      console.log("MP APROVADO!", pid, nome, valor);
      const cartMp = paymentData.additional_info?.items || [];
      const itensMp = cartMp.map(i => ({ nome: i.title, quantidade: i.quantity, preco: i.unit_price }));
      try {
        await pool.query(
          "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens) VALUES ($1, $2, $3, $4, $5, 'pago', $6) ON CONFLICT (payment_id) DO NOTHING",
          [pid, paymentData.external_reference || "", nome, paymentData.payer?.email || "", valor, JSON.stringify(itensMp)]
        );
        const entregaRow = await pool.query("SELECT entrega FROM pedidos WHERE external_id = $1 AND entrega IS NOT NULL LIMIT 1", [paymentData.external_reference || ""]);
        if (entregaRow.rows.length > 0 && entregaRow.rows[0].entrega)
          await pool.query("UPDATE pedidos SET entrega = $1 WHERE payment_id = $2", [entregaRow.rows[0].entrega, pid]);
      } catch (err) { console.error("Erro salvar pedido MP:", err.message); }
      try {
        const itensHtml = itensMp.length > 0 ? "<ul>" + itensMp.map(i => "<li>" + i.quantidade + "x " + i.nome + "</li>").join("") + "</ul>" : "";
        await enviarEmail({ to: EMAIL_DESTINO, subject: "Nova venda Cartao - R$ " + valor, html: "<h2 style='color:#009EE3'>Nova venda no cartao!</h2><p><b>Cliente:</b> " + nome + "</p><p><b>Valor:</b> R$ " + valor + "</p>" + itensHtml });
        const itensWa = itensMp.length > 0 ? "\nProdutos:\n" + itensMp.map(i => "  - " + i.quantidade + "x " + i.nome).join("\n") : "";
        await enviarWhatsApp("VARG - Nova venda cartao!\nCliente: " + nome + "\nValor: R$ " + valor + itensWa + "\nID: " + pid);
      } catch (err) { console.error("Erro notificacoes MP:", err.message); }
    }
  } catch (err) { console.error("Erro webhook MP:", err.message); }
});

// ==================== ATUALIZAR ENVIO ====================
app.post("/api/pedidos/:id/envio", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { codigo_rastreio, status_envio } = req.body;
  try {
    await pool.query("UPDATE pedidos SET codigo_rastreio = $1, status_envio = $2 WHERE id = $3", [codigo_rastreio || null, status_envio || "enviado", id]);
    res.json({ success: true });
    try {
      const result = await pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
      if (result.rows.length === 0) return;
      const pedido = result.rows[0];
      let itens = [];
      try { itens = JSON.parse(pedido.itens || "[]"); } catch(e) {}
      const itensHtml = itens.length > 0 ? "<ul>" + itens.map(i => "<li>" + i.quantidade + "x " + i.nome + "</li>").join("") + "</ul>" : "<p>Produto VARG</p>";
      await enviarEmail({ to: EMAIL_DESTINO, subject: "Seu pedido foi enviado! - VARG", html: "<h2 style='color:#DC143C'>Seu pedido esta a caminho!</h2><p>Ola, " + (pedido.cliente_nome || "Cliente") + "!</p><p>Codigo de rastreio: <b style='color:#00BFFF;font-size:1.2em;'>" + (codigo_rastreio || "") + "</b></p><p>Rastreie em <a href='https://rastreamento.correios.com.br' style='color:#DC143C;'>rastreamento.correios.com.br</a></p>" + itensHtml });
      await enviarWhatsApp("VARG - Pedido enviado!\nCliente: " + (pedido.cliente_nome || "-") + "\nRastreio: " + codigo_rastreio + "\nPedido: " + (pedido.external_id || id));
    } catch(err) { console.error("Erro notificacao envio:", err.message); }
  } catch (err) { console.error("Erro atualizar envio:", err); res.status(500).json({ success: false }); }
});

// ==================== API PEDIDOS ====================
app.get("/api/pedidos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pedidos ORDER BY criado_em DESC");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Erro ao listar pedidos" }); }
});

// ==================== ADMIN LOGIN ====================
app.get("/admin-login", (req, res) => res.sendFile(path.join(__dirname, "admin-login.html")));
app.post("/admin-login", (req, res) => {
  const { senha } = req.body;
  if (senha === ADMIN_PASSWORD) {
    res.json({ success: true, token: Buffer.from("admin:" + ADMIN_PASSWORD).toString("base64") });
  } else {
    res.json({ success: false, message: "Senha incorreta." });
  }
});

// ==================== ADMIN CUPONS ====================
app.get("/admin-cupons.html", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "admin-cupons.html")));
app.get("/api/cupons", adminAuth, async (req, res) => {
  try { res.json((await pool.query("SELECT * FROM cupons ORDER BY criado_em DESC")).rows); }
  catch (err) { res.status(500).json({ error: "Erro ao listar cupons" }); }
});
app.post("/api/cupons", adminAuth, async (req, res) => {
  const { codigo, desconto_pix, desconto_cartao } = req.body;
  if (!codigo) return res.json({ success: false, message: "Codigo obrigatorio." });
  try {
    await pool.query("INSERT INTO cupons (codigo, desconto_pix, desconto_cartao) VALUES ($1, $2, $3)", [codigo.toUpperCase().trim(), parseFloat(desconto_pix) || 10, parseFloat(desconto_cartao) || 10]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === "23505") return res.json({ success: false, message: "Codigo ja existe." });
    res.status(500).json({ success: false, message: "Erro ao criar cupom." });
  }
});
app.post("/api/cupons/:id/toggle", adminAuth, async (req, res) => {
  try { await pool.query("UPDATE cupons SET ativo = NOT ativo WHERE id = $1", [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false }); }
});
app.post("/api/cupom/validar", async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.json({ valido: false, message: "Informe o cupom." });
  try {
    const result = await pool.query("SELECT * FROM cupons WHERE codigo = $1 AND ativo = true", [codigo.toUpperCase().trim()]);
    if (result.rows.length === 0) return res.json({ valido: false, message: "Cupom invalido ou desativado." });
    const cupom = result.rows[0];
    res.json({ valido: true, codigo: cupom.codigo, desconto_pix: parseFloat(cupom.desconto_pix), desconto_cartao: parseFloat(cupom.desconto_cartao) });
  } catch (err) { res.status(500).json({ valido: false, message: "Erro ao validar cupom." }); }
});

// ==================== PAINEL ADMIN ====================
app.get("/admin.html", adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin", adminAuth, async (req, res) => {
  // Redirect to static admin page
  res.redirect("/admin.html?token=" + (req.query.token || ""));
});

app.get("/admin-legacy", adminAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pedidos ORDER BY criado_em DESC");
    const tk = req.query.token || "";
    let html = `<!DOCTYPE html><html><head><title>Admin VARG</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial;background:#0a0a0a;color:#eee;padding-top:70px;}
header{position:fixed;top:0;width:100%;background:rgba(0,0,0,0.95);padding:12px 25px;display:flex;justify-content:space-between;align-items:center;z-index:1000;border-bottom:1px solid #222;font-size:15px;}
nav ul{list-style:none;display:flex;gap:25px;align-items:center;}
nav ul li a{color:#fff;font-weight:600;text-decoration:none;font-size:15px;}
nav ul li a:hover{color:#DC143C;}
.main{padding:30px 40px;}
h1{color:#DC143C;margin-bottom:5px;}
.top-bar{display:flex;align-items:center;gap:20px;margin-bottom:20px;flex-wrap:wrap;}
.top-bar p{color:#888;font-size:0.9em;}
.btn-cupons{background:#00BFFF;color:#111;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:0.85em;text-decoration:none;display:inline-block;}
.btn-excel{background:#1D6F42;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:0.85em;}
table{width:100%;border-collapse:collapse;background:#1a1a1a;}
th{background:#DC143C;color:white;padding:12px;text-align:left;}
td{padding:10px 12px;border-bottom:1px solid #333;font-size:0.9em;vertical-align:top;}
tr:hover{background:#222;}
.pago{color:#00ff88;font-weight:bold;}
.pendente{color:orange;}
.btn-enviar{background:#DC143C;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:0.8em;margin-top:5px;display:block;}
.input-rastreio{background:#222;border:1px solid #444;color:#eee;padding:5px 8px;border-radius:4px;font-size:0.8em;width:160px;margin-bottom:5px;display:block;}
.tag-enviado{background:rgba(0,191,255,0.15);color:#00BFFF;border:1px solid #00BFFF;padding:3px 8px;border-radius:12px;font-size:0.8em;}
.tag-aguardando{background:rgba(255,165,0,0.15);color:orange;border:1px solid orange;padding:3px 8px;border-radius:12px;font-size:0.8em;}
footer{background:#050505;padding:30px 40px;border-top:1px solid #222;color:#888;font-size:0.85em;text-align:center;margin-top:40px;}
footer a{color:#333;text-decoration:none;font-size:0.75em;}
</style>
<script src="/admin-scripts.js"></script>
</head><body>
<header>
  <nav><ul>
    <li><a href="/index.html">Inicio</a></li>
    <li><a href="/admin?token=${tk}" style="color:#DC143C;font-weight:bold;">Pedidos</a></li>
    <li><a href="/admin-cupons.html?token=${tk}" style="color:#00BFFF;">Cupons</a></li>
  </ul></nav>
  <a href="/admin-login" style="color:#888;font-size:0.85em;text-decoration:none;">Sair</a>
</header>
<div class="main">
<h1><img src='/img/lobovinho-removebg-preview.png' style='height:35px;vertical-align:middle;margin-right:10px;'>Pedidos VARG</h1>
<div class="top-bar">
  <p>Total: ${result.rows.length} pedido(s)</p>
  <a href="/admin-cupons.html?token=${tk}" class="btn-cupons">Gerenciar Cupons</a>
  <button class="btn-excel" onclick="exportarExcel()">Exportar Excel</button>
</div>
<table id="tabelaPedidos"><tr>
  <th>ID Pagamento</th><th>Cliente</th><th>Email</th><th>Produtos</th><th>Valor</th><th>Entrega</th><th>Status</th><th>Envio</th><th>Data</th>
</tr>`;

    result.rows.forEach((p) => {
      let itens = [];
      try { itens = JSON.parse(p.itens || "[]"); } catch(e) {}
      const itensHtml = itens.length > 0 ? itens.map(i => i.quantidade + "x " + i.nome).join("<br>") : "-";
      let entrega = null;
      try { entrega = p.entrega ? JSON.parse(p.entrega) : null; } catch(e) {}
      const entregaHtml = entrega ? entrega.nome + "<br>" + entrega.telefone + "<br>" + entrega.cpf + "<br>" + entrega.rua + ", " + entrega.numero + (entrega.complemento ? " " + entrega.complemento : "") + "<br>" + entrega.bairro + "<br>" + entrega.cidade + "/" + entrega.estado + "<br>CEP: " + entrega.cep : "-";
      let envioHtml;
      if (p.status_envio === "enviado" && p.codigo_rastreio) {
        envioHtml = '<span class="tag-enviado">Enviado</span><br><small style="color:#aaa;display:block;margin-top:4px;">' + p.codigo_rastreio + '</small><a href="https://rastreamento.correios.com.br/app/index.php?numero=' + p.codigo_rastreio + '" target="_blank" style="color:#00BFFF;font-size:0.8em;text-decoration:none;display:block;margin-top:4px;">Rastrear</a>';
      } else if (p.status === "pago") {
        envioHtml = '<span class="tag-aguardando">Aguardando</span><br><input class="input-rastreio" id="rastreio_' + p.id + '" placeholder="Codigo dos Correios" /><br><button class="btn-enviar" onclick="marcarEnviado(' + p.id + ')">Marcar como Enviado</button>';
      } else {
        envioHtml = "-";
      }
      html += "<tr><td style='font-size:0.75em'>" + (p.payment_id || "-") + "</td><td>" + (p.cliente_nome || "-") + "</td><td>" + (p.cliente_email || "-") + "</td><td>" + itensHtml + "</td><td>R$ " + parseFloat(p.valor || 0).toFixed(2) + "</td><td>" + entregaHtml + "</td><td class='" + p.status + "'>" + (p.status === "pago" ? "Pago" : p.status) + "</td><td>" + envioHtml + "</td><td>" + new Date(p.criado_em).toLocaleString("pt-BR") + "</td></tr>";
    });

    html += `</table></div>
<footer style="background:#050505;padding:20px 40px;border-top:1px solid #222;color:#888;font-size:14px;text-align:center;margin-top:40px;">
  &copy; 2026 VARG - A Matilha. Todos os direitos reservados. &nbsp;|&nbsp;
  <a href="/admin-login" style="color:#555;text-decoration:none;font-size:0.85em;">Sair do Admin</a>
</footer>
</body></html>`;
    res.send(html);
  } catch (err) { res.status(500).send("Erro: " + err.message); }
});

// ==================== TESTES ====================
app.get("/teste-email-pedido", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 1");
    if (result.rows.length === 0) return res.send("Nenhum pedido encontrado.");
    const p = result.rows[0];
    await enviarEmail({ to: EMAIL_DESTINO, subject: "VARG - Teste de Email", html: "<h2>Teste</h2><p>Cliente: " + (p.cliente_nome || "-") + "</p><p>Valor: R$ " + parseFloat(p.valor).toFixed(2) + "</p>" });
    res.send("Email enviado!");
  } catch (err) { res.status(500).send("Erro: " + err.message); }
});

app.get("/test-whatsapp", async (req, res) => {
  try { await enviarWhatsApp("VARG - Teste de WhatsApp!"); res.send("Mensagem enviada!"); }
  catch (err) { res.status(500).send("Erro: " + err.message); }
});

app.get("/test-whatsapp-pedido", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 1");
    if (result.rows.length === 0) return res.send("Nenhum pedido encontrado.");
    const p = result.rows[0];
    let itens = [];
    try { itens = JSON.parse(p.itens || "[]"); } catch(e) {}
    const itensTexto = itens.length > 0 ? "\nProdutos:\n" + itens.map(i => "  - " + i.quantidade + "x " + i.nome).join("\n") : "";
    await enviarWhatsApp("VARG - Pedido!\nCliente: " + (p.cliente_nome || "-") + "\nValor: R$ " + parseFloat(p.valor).toFixed(2) + itensTexto);
    res.send("WhatsApp enviado!");
  } catch (err) { res.status(500).send("Erro: " + err.message); }
});

// ==================== LIMPEZA PENDENTES ====================
setInterval(async () => {
  try {
    const result = await pool.query("DELETE FROM pedidos WHERE payment_id LIKE 'PIX_PENDING_%' AND status = 'pendente' AND criado_em < NOW() - INTERVAL '24 hours'");
    if (result.rowCount > 0) console.log("Limpeza: " + result.rowCount + " pedidos removidos");
  } catch (err) { console.error("Erro limpeza:", err.message); }
}, 6 * 60 * 60 * 1000);

// ==================== ESQUECI SENHA ====================
app.get("/redefinir-senha.html", (req, res) => res.sendFile(path.join(__dirname, "redefinir-senha.html")));

// ==================== 404 ====================
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "404.html")));

// ==================== INICIAR ====================
pool.connect()
  .then(() => {
    console.log("Conectado ao PostgreSQL");
    app.listen(PORT, () => console.log("Servidor rodando em http://localhost:" + PORT));
  })
  .catch((err) => { console.error("Erro ao conectar no banco:", err.message); process.exit(1); });
