const express = require("express");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "123",
});

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// LOGIN
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0)
      return res.json({
        success: false,
        message: "E-mail ou senha incorretos.",
      });
    const usuario = result.rows[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    if (!senhaCorreta)
      return res.json({
        success: false,
        message: "E-mail ou senha incorretos.",
      });
    res.json({ success: true, nome: usuario.nome });
  } catch (err) {
    console.error("Erro no login:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

// CADASTRO
app.post("/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha)
    return res.json({ success: false, message: "Preencha todos os campos." });
  try {
    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email],
    );
    if (existe.rows.length > 0)
      return res.json({
        success: false,
        message: "Este e-mail já está cadastrado.",
      });
    const hash = await bcrypt.hash(senha, 10);
    await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3)",
      [nome, email, hash],
    );
    res.json({ success: true, message: "Cadastro realizado com sucesso!" });
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.json({ success: false, message: "Erro interno do servidor." });
  }
});

// PIX - cria pagamento via PixGo
app.post("/pix", async (req, res) => {
  const amountCents = parseInt(req.body.amount ?? 3990);
  const valor = amountCents / 100;
  const payload = JSON.stringify({
    amount: valor,
    description: "Pedido VARG",
    external_id: "VARG_" + Date.now(),
    webhook_url:
      "https://fhtba-149-102-234-69.run.pinggy-free.link/webhook/pixgo",
  });
  const options = {
    hostname: "pixgo.org",
    path: "/api/v1/payment/create",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key":
        "pk_a11c371cd9771d6c91e5211016d350e15f349161f001754109a8eb0a2e92233b",
      "Content-Length": Buffer.byteLength(payload),
    },
  };
  const request = https.request(options, (response) => {
    let data = "";
    response.on("data", (chunk) => (data += chunk));
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        if (json.success && json.data) {
          res.json({
            success: true,
            qr_image: json.data.qr_image_url ?? "",
            pix_code: json.data.qr_code ?? "",
          });
        } else {
          res.json({
            error: json.message ?? json.error ?? "Erro desconhecido",
          });
        }
      } catch (e) {
        res.json({ error: "Resposta inválida da API" });
      }
    });
  });
  request.on("error", (e) =>
    res.json({ error: "Falha na conexão: " + e.message }),
  );
  request.write(payload);
  request.end();
});

// MERCADO PAGO - Checkout Pro
app.post("/mp-preference", async (req, res) => {
  const { cart } = req.body;
  if (!cart || cart.length === 0) return res.json({ error: "Carrinho vazio" });
  const items = cart.map((i) => ({
    title: i.nome,
    quantity: parseInt(i.quantidade),
    unit_price: parseFloat(i.preco),
    currency_id: "BRL",
  }));
  const payload = JSON.stringify({
    items,
    notification_url:
      "https://fhtba-149-102-234-69.run.pinggy-free.link/webhook/mercadopago",
    back_urls: {
      success: "https://www.mercadopago.com.br",
      failure: "https://www.mercadopago.com.br",
      pending: "https://www.mercadopago.com.br",
    },
    auto_return: "approved",
  });
  const options = {
    hostname: "api.mercadopago.com",
    path: "/checkout/preferences",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Bearer TEST-8514428929430007-051219-1ffa08d06b14b182133e70460fcdd29c-239972134",
      "Content-Length": Buffer.byteLength(payload),
    },
  };
  const request = https.request(options, (response) => {
    let data = "";
    response.on("data", (chunk) => (data += chunk));
    response.on("end", () => {
      try {
        const json = JSON.parse(data);
        if (json.init_point) {
          res.json({ init_point: json.init_point });
        } else {
          console.error("Erro MP:", json);
          res.json({ error: "Erro ao criar preferência", raw: json });
        }
      } catch (e) {
        res.json({ error: "Resposta inválida do MP" });
      }
    });
  });
  request.on("error", (e) => res.json({ error: e.message }));
  request.write(payload);
  request.end();
});

// CONFIGURAÇÃO DE E-MAIL OUTLOOK
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: "varg.oficial@outlook.com",
    pass: "159357VARG@", // ← TROQUE PELA SENHA DO OUTLOOK
  },
  tls: { ciphers: "SSLv3" },
});

// WEBHOOK PIXGO
const PIXGO_WEBHOOK_SECRET =
  "whsec_5fcff2c2534505e4d0d9fbceed4c47f39e1d558bf508712a531f957e0ee3c99d";

app.post("/webhook/pixgo", async (req, res) => {
  const timestamp = req.headers["x-webhook-timestamp"];
  const signature = req.headers["x-webhook-signature"];
  const event = req.headers["x-webhook-event"];
  const rawBody = req.rawBody;

  if (!timestamp || !signature || !rawBody) {
    return res.status(400).json({ error: "Headers ausentes" });
  }

  const signaturePayload = timestamp + "." + rawBody;
  const expected = crypto
    .createHmac("sha256", PIXGO_WEBHOOK_SECRET)
    .update(signaturePayload)
    .digest("hex");

  try {
    const sigOk = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
    if (!sigOk) return res.status(401).json({ error: "Assinatura inválida" });
  } catch {
    return res.status(401).json({ error: "Erro ao verificar assinatura" });
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: "Timestamp expirado" });
  }

  const data = req.body;
  console.log(`📨 Webhook PixGo recebido: ${event}`);

  switch (event) {
    case "payment.completed":
      console.log(`💰 Pagamento ${data.data?.payment_id} CONFIRMADO!`);
      console.log(`   Cliente: ${data.data?.customer?.name}`);
      console.log(`   Valor: R$ ${data.data?.amounts?.gross}`);
      console.log(`   Pedido: ${data.data?.external_id}`);

      try {
        await pool.query(
          `INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status)
           VALUES ($1, $2, $3, $4, $5, 'pago')`,
          [
            data.data?.payment_id,
            data.data?.external_id,
            data.data?.customer?.name || "",
            "",
            data.data?.amounts?.gross || 0,
          ],
        );
        console.log("✅ Pedido salvo no banco!");

        await transporter.sendMail({
          from: '"VARG" <varg.oficial@outlook.com>',
          to: "varg.oficial@outlook.com",
          subject: `💰 Novo pedido pago - ${data.data?.payment_id}`,
          html: `<h2>Pedido confirmado!</h2>
                 <p><strong>Cliente:</strong> ${data.data?.customer?.name || "N/A"}</p>
                 <p><strong>Valor:</strong> R$ ${data.data?.amounts?.gross || "N/A"}</p>
                 <p><strong>ID:</strong> ${data.data?.payment_id}</p>
                 <p><strong>Pedido:</strong> ${data.data?.external_id}</p>`,
        });
        console.log("📧 E-mail enviado para o Outlook!");
      } catch (err) {
        console.error("❌ Erro ao salvar/notificar:", err);
      }
      break;

    case "payment.expired":
      console.log(`⏰ Pagamento ${data.data?.payment_id} expirou`);
      break;

    case "payment.refunded":
      console.log(`↩️ Pagamento ${data.data?.payment_id} estornado`);
      break;
  }

  res.status(200).json({ received: true });
});

// WEBHOOK MERCADO PAGO
app.post("/webhook/mercadopago", async (req, res) => {
  console.log("📨 Webhook Mercado Pago recebido:", req.body);
  const { type, data } = req.body;
  if (type === "payment") {
    console.log(`💳 Pagamento MP ID: ${data.id}`);
  }
  if (type === "merchant_order") {
    console.log(`📦 Merchant order MP ID: ${data.id}`);
  }
  res.status(200).json({ received: true });
});

// ROTA DE TESTE
app.get("/testar-webhook", (req, res) => {
  const simulatedEvent = "payment.completed";
  const simulatedData = {
    event: "payment.completed",
    data: {
      payment_id: "teste_" + Date.now(),
      external_id: "VARG_TESTE",
      amounts: { gross: 39.9, net: 39.11 },
      customer: { name: "Cliente Teste" },
      payer: { name: "Pagador Teste" },
    },
  };

  console.log(`📨 Webhook PixGo recebido: ${simulatedEvent}`);
  console.log(`💰 Pagamento ${simulatedData.data.payment_id} CONFIRMADO!`);
  console.log(`   Valor: R$ ${simulatedData.data.amounts.gross}`);
  console.log(`   Cliente: ${simulatedData.data.customer.name}`);
  console.log(`   Pedido: ${simulatedData.data.external_id}`);

  res.send(`
    <html>
    <body style="font-family:Arial;padding:40px">
      <h2>✅ Webhook testado com sucesso!</h2>
      <p>Verifique o terminal do servidor para ver os logs.</p>
      <br>
      <a href="/testar-webhook" style="padding:10px 20px;background:#4CAF50;color:white;text-decoration:none;border-radius:5px">Testar Novamente</a>
    </body>
    </html>
  `);
});

// ADMIN - Listar pedidos
app.get("/admin", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY criado_em DESC",
    );
    let html = `
      <html>
      <head>
        <title>Admin VARG</title>
        <style>
          body { font-family: Arial; padding: 40px; background: #f5f5f5; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          th { background: #4CAF50; color: white; padding: 12px; text-align: left; }
          td { padding: 10px 12px; border-bottom: 1px solid #ddd; }
          tr:hover { background: #f9f9f9; }
          .pago { color: green; font-weight: bold; }
          .pendente { color: orange; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>📋 Pedidos VARG</h1>
        <p>Total: ${result.rows.length} pedido(s)</p>
        <table>
          <tr>
            <th>Pagamento</th><th>Cliente</th><th>Email</th>
            <th>Valor</th><th>Status</th><th>Data</th>
          </tr>`;

    result.rows.forEach((p) => {
      html += `<tr>
        <td>${p.payment_id || "-"}</td>
        <td>${p.cliente_nome || "-"}</td>
        <td>${p.cliente_email || "-"}</td>
        <td>R$ ${parseFloat(p.valor).toFixed(2)}</td>
        <td class="${p.status}">${p.status}</td>
        <td>${new Date(p.criado_em).toLocaleString("pt-BR")}</td>
      </tr>`;
    });

    html += `</table></body></html>`;
    res.send(html);
  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
    res.status(500).send("Erro ao carregar pedidos");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor VARG rodando em http://localhost:${PORT}`);
});
