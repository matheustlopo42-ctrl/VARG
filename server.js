const express = require("express");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const cors = require("cors");
const jwt = require("jsonwebtoken");

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
const PIXGO_API_KEY   = process.env.PIXGO_API_KEY   || "pk_a11c371cd9771d6c91e5211016d350e15f349161f001754109a8eb0a2e92233b";
const PIXGO_WEBHOOK_SECRET = process.env.PIXGO_WEBHOOK_SECRET || "whsec_5fcff2c2534505e4d0d9fbceed4c47f39e1d558bf508712a531f957e0ee3c99d";
const BASE_URL        = process.env.BASE_URL        || "https://varg-bnlz.onrender.com";
const EMAIL_DESTINO   = process.env.EMAIL_DESTINO   || "varg.oficialstore@gmail.com";
const WA_PHONE        = process.env.WA_PHONE        || "5512988875509";
const WA_APIKEY       = process.env.WA_APIKEY       || "";
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || "159357456258";
const JWT_SECRET      = process.env.JWT_SECRET      || "varg_jwt_secret_2025";

// ==================== RESEND ====================
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_H34dbCvj_JYsUmRBKpMNXbCaLf6ZKeEM3";
const { Resend } = require("resend");
const resend = new Resend(RESEND_API_KEY);

async function enviarEmail({ to, subject, html }) {
  const { error } = await resend.emails.send({
    from: "VARG <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
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

// ==================== EMAIL TEMPLATES ====================
function emailConfirmacaoCliente({ nome, pedidoId, itens, entrega, valor, metodo }) {
  const itensHtml = itens.length > 0
    ? "<ul>" + itens.map(i => `<li>${i.quantidade}x ${i.nome} — R$ ${parseFloat(i.preco * i.quantidade).toFixed(2)}</li>`).join("") + "</ul>"
    : "<p>Produto VARG</p>";
  const entregaHtml = entrega
    ? `<p><b>Endereço:</b> ${entrega.rua}, ${entrega.numero}${entrega.complemento ? " " + entrega.complemento : ""} — ${entrega.bairro}, ${entrega.cidade}/${entrega.estado} — CEP: ${entrega.cep}</p>`
    : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0a0a0a;color:#eee;border-radius:12px;overflow:hidden;">
      <div style="background:#DC143C;padding:25px 30px;text-align:center;">
        <h1 style="color:#fff;margin:0;letter-spacing:3px;">VARG</h1>
        <p style="color:rgba(255,255,255,0.8);margin:5px 0 0;">Pedido Confirmado ✅</p>
      </div>
      <div style="padding:30px;">
        <p>Olá, <b>${nome}</b>!</p>
        <p>Recebemos seu pedido e estamos processando. Em breve você receberá mais atualizações.</p>
        <div style="background:#1a1a1a;border-radius:10px;padding:20px;margin:20px 0;border-left:4px solid #DC143C;">
          <p style="color:#DC143C;font-weight:bold;margin:0 0 10px;">Resumo do Pedido #${pedidoId}</p>
          ${itensHtml}
          <p style="margin-top:12px;"><b>Total:</b> <span style="color:#DC143C;font-size:1.1em;font-weight:bold;">R$ ${parseFloat(valor).toFixed(2)}</span></p>
          <p><b>Pagamento:</b> ${metodo}</p>
        </div>
        ${entregaHtml}
        <p style="color:#888;font-size:0.9em;margin-top:20px;">Prazo de entrega: 25 a 40 dias úteis. Em caso de dúvidas, entre em contato via <a href="https://wa.me/${WA_PHONE}" style="color:#DC143C;">WhatsApp</a>.</p>
      </div>
      <div style="background:#050505;padding:15px;text-align:center;color:#555;font-size:0.8em;">
        © 2026 VARG - A Matilha &nbsp;|&nbsp; <a href="${BASE_URL}" style="color:#DC143C;text-decoration:none;">vargmatilha.com.br</a>
      </div>
    </div>`;
}

// ==================== HELPER ESTOQUE ====================
function getProdutoId(nomeItem) {
  const nome = (nomeItem || "").toLowerCase();
  if (nome.includes("salt") || nome.includes("varg salt")) return "varg-salt";
  if (nome.includes("preta") && nome.includes("branco")) return "camiseta-preta-branco";
  if (nome.includes("preta") && nome.includes("azul"))   return "camiseta-preta-azul";
  if (nome.includes("branca")) return "camiseta-branca-preto";
  if (nome.includes("dourado")) return "camiseta-preta-dourado";
  if (nome.includes("azul"))   return "camiseta-azul-branco";
  return null;
}
function getVariacao(nomeItem) {
  const match = (nomeItem || "").match(/Tam\.\s*(\w+)/i);
  return match ? match[1] : "unico";
}
async function decrementarEstoque(itens) {
  for (const item of itens) {
    const produtoId = getProdutoId(item.nome);
    if (!produtoId) continue;
    const variacao = getVariacao(item.nome);
    const qtd = parseInt(item.quantidade) || 1;
    try {
      await pool.query(
        "UPDATE estoque SET quantidade = GREATEST(quantidade - $1, 0), atualizado_em = NOW() WHERE produto_id = $2 AND variacao = $3",
        [qtd, produtoId, variacao]
      );
      const check = await pool.query(
        "SELECT quantidade, alerta_minimo FROM estoque WHERE produto_id = $1 AND variacao = $2",
        [produtoId, variacao]
      );
      if (check.rows.length > 0) {
        const { quantidade, alerta_minimo } = check.rows[0];
        if (parseInt(quantidade) <= parseInt(alerta_minimo)) {
          const varLabel = variacao === "unico" ? "" : " - " + variacao;
          const subject = quantidade === 0
            ? "VARG - Estoque ESGOTADO: " + produtoId + varLabel
            : "VARG - Estoque baixo: " + produtoId + varLabel;
          const cor = quantidade === 0 ? "#ff4d4d" : "orange";
          await enviarEmail({
            to: EMAIL_DESTINO, subject,
            html: `<h2 style="color:${cor}">⚠️ Alerta de Estoque</h2><p><b>Produto:</b> ${produtoId}${varLabel}</p><p><b>Quantidade restante:</b> <span style="color:${cor};font-size:1.5em;font-weight:bold;">${quantidade}</span></p>${quantidade===0?'<p style="color:#ff4d4d;font-weight:bold;">Produto ESGOTADO! Reponha o estoque.</p>':`<p>Abaixo do mínimo (${alerta_minimo}). Considere repor.</p>`}<p><a href="${BASE_URL}/admin-estoque.html" style="background:#DC143C;color:white;padding:10px 20px;border-radius:20px;text-decoration:none;font-weight:bold;">Gerenciar Estoque</a></p>`,
          }).catch(e => console.error("Erro email alerta estoque:", e.message));
        }
      }
    } catch (e) { console.error("Erro ao decrementar estoque:", e.message); }
  }
}

// ==================== ADMIN AUTH ====================
function adminAuth(req, res, next) {
  const expected = Buffer.from("admin:" + ADMIN_PASSWORD).toString("base64");
  const auth = req.headers["x-admin-token"] || req.query.token;
  if (auth === expected) return next();
  res.redirect("/admin-login");
}

// ==================== INIT ====================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ==================== LOGIN (com JWT) ====================
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (!result.rows.length) return res.json({ success: false, message: "E-mail ou senha incorretos." });
    const usuario = result.rows[0];
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) return res.json({ success: false, message: "E-mail ou senha incorretos." });
    const token = jwt.sign({ id: usuario.id, email: usuario.email, nome: usuario.nome }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ success: true, nome: usuario.nome, token });
  } catch (err) {
    console.error("Erro login:", err);
    res.json({ success: false, message: "Erro interno." });
  }
});

// ==================== CADASTRO ====================
app.post("/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const existe = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
    if (existe.rows.length) return res.json({ success: false, message: "Este e-mail já está cadastrado." });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query("INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3)", [nome, email, hash]);
    // Email boas-vindas
    enviarEmail({
      to: email,
      subject: "Bem-vindo à matilha, " + nome + "!",
      html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#eee;padding:30px;border-radius:10px;max-width:500px;margin:auto;"><div style="text-align:center;margin-bottom:20px;"><h1 style="color:#DC143C;letter-spacing:3px;">VARG</h1></div><h2 style="color:#DC143C;">Bem-vindo à matilha, ${nome}! 🐺</h2><p>Sua conta foi criada com sucesso. Agora você faz parte da matilha dos mais fortes.</p><p style="margin-top:15px;"><a href="${BASE_URL}/index.html" style="background:#DC143C;color:#fff;padding:12px 25px;border-radius:25px;text-decoration:none;font-weight:bold;">Ir às compras</a></p></div>`
    }).catch(e => console.error("Erro email boas-vindas:", e.message));
    res.json({ success: true, message: "Cadastro realizado!" });
  } catch (err) {
    console.error("Erro cadastro:", err);
    res.json({ success: false, message: "Erro interno." });
  }
});

// ==================== ESQUECI / REDEFINE SENHA ====================
app.post("/esqueci-senha", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: "Informe o e-mail." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (!result.rows.length) return res.json({ success: false, message: "E-mail não encontrado." });
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query("UPDATE usuarios SET reset_token = $1, reset_expires = $2 WHERE email = $3", [token, expires, email]);
    const resetLink = BASE_URL + "/redefinir-senha.html?token=" + token;
    await enviarEmail({
      to: email,
      subject: "VARG - Redefinição de senha",
      html: `<h2 style="color:#DC143C">Redefinição de Senha</h2><p>Olá, ${result.rows[0].nome}!</p><p><a href="${resetLink}" style="background:#DC143C;color:white;padding:12px 25px;border-radius:25px;text-decoration:none;font-weight:bold;">Redefinir Senha</a></p><p style="color:#888;font-size:0.9em;">Este link expira em 1 hora.</p>`
    });
    res.json({ success: true, message: "Email enviado! Verifique sua caixa de entrada." });
  } catch (err) { res.json({ success: false, message: "Erro interno." }); }
});

app.post("/redefinir-senha", async (req, res) => {
  const { token, novaSenha } = req.body;
  if (!token || !novaSenha) return res.json({ success: false, message: "Dados incompletos." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE reset_token = $1 AND reset_expires > NOW()", [token]);
    if (!result.rows.length) return res.json({ success: false, message: "Link inválido ou expirado." });
    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query("UPDATE usuarios SET senha = $1, reset_token = NULL, reset_expires = NULL WHERE reset_token = $2", [hash, token]);
    res.json({ success: true, message: "Senha redefinida com sucesso!" });
  } catch (err) { res.json({ success: false, message: "Erro interno." }); }
});

// ==================== PIX ====================
app.post("/pix", async (req, res) => {
  const amountCents = parseInt(req.body.amount ?? 3990);
  const valor = amountCents / 100;
  const cart = req.body.cart || [];
  const entrega = req.body.entrega || null;
  const externalId = "VARG_" + Date.now();

  // Salva pedido pendente
  await pool.query(
    "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens, entrega, cupom) VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7, $8) ON CONFLICT (payment_id) DO NOTHING",
    ["PIX_PENDING_" + externalId, externalId, req.body.nome || "", req.body.email || "", valor, JSON.stringify(cart), entrega ? JSON.stringify(entrega) : null, req.body.cupom || null]
  ).catch(err => console.error("Erro INSERT pendente:", err.message));

  const payload = JSON.stringify({
    amount: valor,
    description: "Pedido VARG",
    external_id: externalId,
    webhook_url: BASE_URL + "/webhook/pixgo",
  });
  const options = {
    hostname: "pixgo.org",
    path: "/api/v1/payment/create",
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": PIXGO_API_KEY, "Content-Length": Buffer.byteLength(payload) },
  };
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
      } catch (e) { res.json({ error: "Resposta inválida da API" }); }
    });
  });
  request.on("error", (e) => res.json({ error: "Falha na conexão: " + e.message }));
  request.write(payload);
  request.end();
});

// ==================== PEDIDO WHATSAPP ====================
app.post("/api/pedido-whatsapp", async (req, res) => {
  const { cart, entrega, total, cupom, nomeCliente, emailCliente } = req.body;
  if (!cart || !entrega) return res.json({ success: false, message: "Dados incompletos." });
  const externalId = "WA_" + Date.now();
  try {
    await pool.query(
      "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens, entrega, cupom) VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7, $8)",
      [externalId, externalId, nomeCliente || entrega.nome || "", emailCliente || "", parseFloat(total), JSON.stringify(cart), JSON.stringify(entrega), cupom || null]
    );
    res.json({ success: true, pedidoId: externalId });

    // Notifica admin
    const itensHtml = cart.map(i => `<li>${i.quantidade}x ${i.nome} — R$ ${parseFloat(i.preco*i.quantidade).toFixed(2)}</li>`).join("");
    await enviarEmail({
      to: EMAIL_DESTINO,
      subject: "VARG - Novo pedido WhatsApp — R$ " + parseFloat(total).toFixed(2),
      html: `<h2 style="color:#25D366">📱 Novo pedido via WhatsApp!</h2><p><b>Cliente:</b> ${nomeCliente}</p><p><b>Telefone:</b> ${entrega.telefone}</p><p><b>Valor:</b> R$ ${parseFloat(total).toFixed(2)}</p><ul>${itensHtml}</ul><p><b>Endereço:</b> ${entrega.rua}, ${entrega.numero} — ${entrega.cidade}/${entrega.estado}</p>${cupom?`<p><b>Cupom:</b> ${cupom}</p>`:''}`
    }).catch(e => console.error("Erro email WhatsApp:", e.message));

    await enviarWhatsApp(`VARG - Pedido WhatsApp!\nCliente: ${nomeCliente}\nValor: R$ ${parseFloat(total).toFixed(2)}\nID: ${externalId}`);
  } catch (err) {
    console.error("Erro pedido WhatsApp:", err.message);
    res.json({ success: true }); // Não bloqueia o fluxo
  }
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
      return res.status(401).json({ error: "Assinatura inválida" });
  } catch { return res.status(401).json({ error: "Erro ao verificar assinatura" }); }
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > 300)
    return res.status(401).json({ error: "Timestamp expirado" });

  const data = req.body;
  res.status(200).json({ received: true });

  if (event === "payment.completed") {
    const pid = data.data?.payment_id;
    const nome = data.data?.customer?.name || "N/A";
    const emailCliente = data.data?.customer?.email || "";
    const valor = data.data?.amounts?.gross || 0;
    const pedido = data.data?.external_id;
    console.log("PAGO via PIX!", pid, nome, valor);

    let itens = "[]", entregaStr = null;
    try {
      const row = await pool.query("SELECT itens, entrega, cupom, cliente_email FROM pedidos WHERE external_id = $1 LIMIT 1", [pedido]);
      if (row.rows.length > 0) { itens = row.rows[0].itens || "[]"; entregaStr = row.rows[0].entrega; }
    } catch (e) {}

    try {
      await pool.query(
        "INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status, itens, entrega) VALUES ($1, $2, $3, $4, $5, 'pago', $6, $7) ON CONFLICT (payment_id) DO UPDATE SET status = 'pago', itens = $6, entrega = $7",
        [pid, pedido, nome, emailCliente, valor, itens, entregaStr]
      );
      let itensParsed = [];
      try { itensParsed = JSON.parse(itens); } catch (e) {}
      if (itensParsed.length > 0) await decrementarEstoque(itensParsed);
    } catch (err) { console.error("Erro salvar pedido PIX:", err.message); }

    // Notificações
    try {
      let itensParsed = [];
      try { itensParsed = JSON.parse(itens); } catch (e) {}
      let entregaParsed = null;
      try { entregaParsed = entregaStr ? JSON.parse(entregaStr) : null; } catch (e) {}

      const itensHtml = itensParsed.length > 0 ? "<ul>" + itensParsed.map(i => `<li>${i.quantidade}x ${i.nome}</li>`).join("") + "</ul>" : "";
      const entregaHtml = entregaParsed ? `<p><b>Entrega:</b> ${entregaParsed.rua}, ${entregaParsed.numero} — ${entregaParsed.cidade}/${entregaParsed.estado}</p>` : "";

      // Email admin
      await enviarEmail({ to: EMAIL_DESTINO, subject: "Nova venda PIX - R$ " + valor, html: `<h2 style="color:#DC143C">Nova venda PIX!</h2><p><b>Cliente:</b> ${nome}</p><p><b>Valor:</b> R$ ${valor}</p>${itensHtml}${entregaHtml}<p><b>Pedido:</b> ${pedido}</p>` });

      // Email cliente
      if (emailCliente) {
        const emailHtml = emailConfirmacaoCliente({ nome, pedidoId: pedido, itens: itensParsed, entrega: entregaParsed, valor, metodo: "PIX" });
        await enviarEmail({ to: emailCliente, subject: "VARG - Pedido confirmado! 🐺", html: emailHtml });
      }

      const itensWa = itensParsed.length > 0 ? "\nProdutos:\n" + itensParsed.map(i => "  - " + i.quantidade + "x " + i.nome).join("\n") : "";
      const entregaWa = entregaParsed ? "\nEntrega: " + entregaParsed.rua + ", " + entregaParsed.numero + " - " + entregaParsed.cidade + "/" + entregaParsed.estado : "";
      await enviarWhatsApp("VARG - Nova venda PIX!\nCliente: " + nome + "\nValor: R$ " + valor + itensWa + entregaWa + "\nPedido: " + pedido);
    } catch (err) { console.error("Erro notificações PIX:", err.message); }
  }
  if (event === "payment.expired") console.log("PIX expirou:", data.data?.payment_id);
});

// ==================== ATUALIZAR ENVIO ====================
app.post("/api/pedidos/:id/envio", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { codigo_rastreio, status_envio } = req.body;
  try {
    await pool.query("UPDATE pedidos SET codigo_rastreio = $1, status_envio = $2 WHERE id = $3", [codigo_rastreio || null, status_envio || "enviado", id]);
    res.json({ success: true });
    // Notifica cliente
    const pedido = (await pool.query("SELECT * FROM pedidos WHERE id = $1", [id])).rows[0];
    if (!pedido) return;
    let itens = [];
    try { itens = JSON.parse(pedido.itens || "[]"); } catch (e) {}
    const itensHtml = itens.length > 0 ? "<ul>" + itens.map(i => `<li>${i.quantidade}x ${i.nome}</li>`).join("") + "</ul>" : "<p>Produto VARG</p>";
    if (pedido.cliente_email) {
      await enviarEmail({
        to: pedido.cliente_email,
        subject: "VARG - Seu pedido foi enviado! 🐺",
        html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#eee;padding:30px;border-radius:10px;max-width:500px;margin:auto;"><h1 style="color:#DC143C;">VARG</h1><h2>Seu pedido está a caminho! 📦</h2><p>Olá, ${pedido.cliente_nome || "Cliente"}!</p><p>Código de rastreio: <b style="color:#00BFFF;font-size:1.2em;">${codigo_rastreio || ""}</b></p><p>Rastreie em <a href="https://rastreamento.correios.com.br" style="color:#DC143C;">rastreamento.correios.com.br</a></p>${itensHtml}</div>`
      }).catch(e => console.error("Erro email envio:", e.message));
    }
    await enviarEmail({ to: EMAIL_DESTINO, subject: "VARG - Pedido enviado: " + (pedido.external_id || id), html: `<h2>Pedido marcado como enviado</h2><p><b>Cliente:</b> ${pedido.cliente_nome}</p><p><b>Rastreio:</b> ${codigo_rastreio}</p>` });
    await enviarWhatsApp("VARG - Pedido enviado!\nCliente: " + (pedido.cliente_nome || "-") + "\nRastreio: " + codigo_rastreio + "\nPedido: " + (pedido.external_id || id));
  } catch (err) { console.error("Erro atualizar envio:", err); res.status(500).json({ success: false }); }
});

// ==================== API PEDIDOS ====================
app.get("/api/pedidos", async (req, res) => {
  try {
    res.json((await pool.query("SELECT * FROM pedidos ORDER BY criado_em DESC")).rows);
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

// ==================== CUPONS ====================
app.get("/admin-cupons.html", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "admin-cupons.html")));
app.get("/api/cupons", adminAuth, async (req, res) => {
  try { res.json((await pool.query("SELECT * FROM cupons ORDER BY criado_em DESC")).rows); }
  catch (err) { res.status(500).json({ error: "Erro" }); }
});
app.post("/api/cupons", adminAuth, async (req, res) => {
  const { codigo, desconto_pix, desconto_cartao } = req.body;
  if (!codigo) return res.json({ success: false, message: "Código obrigatório." });
  try {
    await pool.query("INSERT INTO cupons (codigo, desconto_pix, desconto_cartao) VALUES ($1, $2, $3)", [codigo.toUpperCase().trim(), parseFloat(desconto_pix)||10, parseFloat(desconto_cartao)||10]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === "23505") return res.json({ success: false, message: "Código já existe." });
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
    if (!result.rows.length) return res.json({ valido: false, message: "Cupom inválido ou desativado." });
    const c = result.rows[0];
    res.json({ valido: true, codigo: c.codigo, desconto_pix: parseFloat(c.desconto_pix), desconto_cartao: parseFloat(c.desconto_cartao) });
  } catch (err) { res.status(500).json({ valido: false, message: "Erro ao validar cupom." }); }
});

// ==================== PAINEL ADMIN ====================
app.get("/admin.html", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/admin", adminAuth, (req, res) => res.redirect("/admin.html?token=" + (req.query.token || "")));

// ==================== ESTOQUE ====================
app.get("/api/estoque", adminAuth, async (req, res) => {
  try { res.json((await pool.query("SELECT * FROM estoque ORDER BY produto_id, variacao")).rows); }
  catch (err) { res.status(500).json({ error: "Erro" }); }
});
app.post("/api/estoque", adminAuth, async (req, res) => {
  const { produto_id, variacao, quantidade, alerta_minimo } = req.body;
  const qtd = parseInt(quantidade) || 0;
  const alerta = parseInt(alerta_minimo) || 5;
  try {
    await pool.query(
      "INSERT INTO estoque (produto_id, variacao, quantidade, alerta_minimo, atualizado_em) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (produto_id, variacao) DO UPDATE SET quantidade = $3, alerta_minimo = $4, atualizado_em = NOW()",
      [produto_id, variacao || "unico", qtd, alerta]
    );
    res.json({ success: true });
    if (qtd <= alerta) {
      const varLabel = variacao && variacao !== "unico" ? " - " + variacao : "";
      enviarEmail({
        to: EMAIL_DESTINO,
        subject: qtd === 0 ? "VARG - Estoque ESGOTADO: " + produto_id + varLabel : "VARG - Estoque baixo: " + produto_id + varLabel,
        html: `<h2 style="color:${qtd===0?'#ff4d4d':'orange'}">⚠️ Alerta de Estoque</h2><p><b>Produto:</b> ${produto_id}${varLabel}</p><p><b>Quantidade:</b> ${qtd}</p>`
      }).catch(e => console.error(e.message));
    }
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.get("/api/estoque-resumo", async (req, res) => {
  try { res.json((await pool.query("SELECT produto_id, variacao, quantidade FROM estoque")).rows); }
  catch (err) { res.status(500).json({ error: "Erro" }); }
});

// ==================== LISTA DE ESPERA ====================
app.post("/api/lista-espera", async (req, res) => {
  const { produto_id, variacao, email, nome } = req.body;
  if (!produto_id || !email) return res.json({ success: false, message: "Dados incompletos." });
  try {
    const existe = await pool.query("SELECT id FROM lista_espera WHERE produto_id = $1 AND variacao = $2 AND email = $3", [produto_id, variacao || "unico", email]);
    if (existe.rows.length) return res.json({ success: false, message: "Você já está na lista!" });
    await pool.query("INSERT INTO lista_espera (produto_id, variacao, email, nome) VALUES ($1, $2, $3, $4)", [produto_id, variacao || "unico", email, nome || ""]);
    res.json({ success: true, message: "Adicionado à lista de espera!" });
  } catch (err) { res.status(500).json({ success: false, message: "Erro ao entrar na lista." }); }
});
app.get("/api/lista-espera", adminAuth, async (req, res) => {
  try { res.json((await pool.query("SELECT * FROM lista_espera ORDER BY criado_em DESC")).rows); }
  catch (err) { res.status(500).json({ error: "Erro" }); }
});
app.get("/admin-estoque.html", adminAuth, (req, res) => res.sendFile(path.join(__dirname, "admin-estoque.html")));

// ==================== PÁGINAS ESTÁTICAS ====================
app.get("/redefinir-senha.html", (req, res) => res.sendFile(path.join(__dirname, "redefinir-senha.html")));

// ==================== LIMPEZA PENDENTES ====================
setInterval(async () => {
  try {
    const result = await pool.query("DELETE FROM pedidos WHERE payment_id LIKE 'PIX_PENDING_%' AND status = 'pendente' AND criado_em < NOW() - INTERVAL '24 hours'");
    if (result.rowCount > 0) console.log("Limpeza: " + result.rowCount + " pedidos removidos");
  } catch (err) { console.error("Erro limpeza:", err.message); }
}, 6 * 60 * 60 * 1000);

// ==================== 404 ====================
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "404.html")));

// ==================== INICIAR ====================
pool.connect()
  .then(() => {
    console.log("Conectado ao PostgreSQL");
    app.listen(PORT, () => console.log("Servidor VARG rodando em http://localhost:" + PORT));
  })
  .catch((err) => { console.error("Erro ao conectar no banco:", err.message); process.exit(1); });
