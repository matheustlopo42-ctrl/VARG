const express = require("express");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== BANCO DE DADOS ====================
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: "localhost",
        port: 5432,
        database: "postgres",
        user: "postgres",
        password: "123",
      },
);

// ==================== MIDDLEWARES ====================
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// ==================== CREDENCIAIS ====================
const PIXGO_API_KEY =
  process.env.PIXGO_API_KEY ||
  "pk_a11c371cd9771d6c91e5211016d350e15f349161f001754109a8eb0a2e92233b";
const PIXGO_WEBHOOK_SECRET =
  process.env.PIXGO_WEBHOOK_SECRET ||
  "whsec_5fcff2c2534505e4d0d9fbceed4c47f39e1d558bf508712a531f957e0ee3c99d";
const MP_ACCESS_TOKEN =
  process.env.MP_ACCESS_TOKEN ||
  "TEST-8514428929430007-051219-1ffa08d06b14b182133e70460fcdd29c-239972134";
const BASE_URL = process.env.BASE_URL || "https://varg-bnlz.onrender.com";
const EMAIL_USER = process.env.EMAIL_USER || "matheustlopo42@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "pplezzjcvzyakzdc";
const EMAIL_DESTINO = process.env.EMAIL_DESTINO || "matheustlopo42@gmail.com";
const WA_PHONE = process.env.WA_PHONE || "5512988875509";
const WA_APIKEY = process.env.WA_APIKEY || "";

// ==================== WHATSAPP (CallMeBot) ====================
async function enviarWhatsApp(mensagem) {
  if (!WA_APIKEY)
    return console.log("⚠️ WA_APIKEY não configurada, pulando WhatsApp");
  const encoded = encodeURIComponent(mensagem);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encoded}&apikey=${WA_APIKEY}`;
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          console.log("📱 WhatsApp enviado:", data);
          resolve();
        });
      })
      .on("error", (e) => {
        console.error("❌ Erro WhatsApp:", e.message);
        resolve();
      });
  });
}

// ==================== PÁGINA INICIAL ====================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==================== LOGIN ====================
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

// ==================== CADASTRO ====================
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

// ==================== PIX (PixGo) ====================
app.post("/pix", async (req, res) => {
  const amountCents = parseInt(req.body.amount ?? 3990);
  const valor = amountCents / 100;
  const payload = JSON.stringify({
    amount: valor,
    description: "Pedido VARG",
    external_id: "VARG_" + Date.now(),
    webhook_url: BASE_URL + "/webhook/pixgo",
  });
  const options = {
    hostname: "pixgo.org",
    path: "/api/v1/payment/create",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": PIXGO_API_KEY,
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

// ==================== MERCADO PAGO ====================
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
    notification_url: BASE_URL + "/webhook/mercadopago",
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
      Authorization: "Bearer " + MP_ACCESS_TOKEN,
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

// ==================== WEBHOOK PIXGO ====================
app.post("/webhook/pixgo", async (req, res) => {
  const timestamp = req.headers["x-webhook-timestamp"];
  const signature = req.headers["x-webhook-signature"];
  const event = req.headers["x-webhook-event"];
  const rawBody = req.rawBody;

  if (!timestamp || !signature || !rawBody)
    return res.status(400).json({ error: "Headers ausentes" });

  const expected = crypto
    .createHmac("sha256", PIXGO_WEBHOOK_SECRET)
    .update(timestamp + "." + rawBody)
    .digest("hex");

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(signature, "hex"),
      )
    )
      return res.status(401).json({ error: "Assinatura inválida" });
  } catch {
    return res.status(401).json({ error: "Erro ao verificar assinatura" });
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > 300)
    return res.status(401).json({ error: "Timestamp expirado" });

  const data = req.body;
  console.log(`📨 Webhook PixGo: ${event}`);
  res.status(200).json({ received: true });

  if (event === "payment.completed") {
    const pid = data.data?.payment_id;
    const nome = data.data?.customer?.name || "N/A";
    const valor = data.data?.amounts?.gross || 0;
    const pedido = data.data?.external_id;

    console.log(`💰 PAGO via PIX! ${pid} | ${nome} | R$ ${valor}`);

    try {
      await pool.query(
        `INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status)
         VALUES ($1, $2, $3, $4, $5, 'pago')
         ON CONFLICT (payment_id) DO NOTHING`,
        [pid, pedido, nome, data.data?.customer?.email || "", valor],
      );
      console.log("✅ Pedido salvo no banco!");
    } catch (err) {
      console.error("❌ Erro ao salvar pedido:", err.message);
    }

    try {
      await transporter.sendMail({
        from: `"VARG" <${EMAIL_USER}>`,
        to: EMAIL_DESTINO,
        subject: `💰 Nova venda PIX - R$ ${valor}`,
        html: `<h2 style="color:#DC143C">🐺 Nova venda confirmada!</h2>
               <p><b>Método:</b> PIX</p>
               <p><b>Cliente:</b> ${nome}</p>
               <p><b>Valor:</b> R$ ${valor}</p>
               <p><b>Pedido:</b> ${pedido}</p>
               <p><b>ID Pagamento:</b> ${pid}</p>`,
      });
      console.log("📧 Email enviado!");
    } catch (err) {
      console.error("❌ Erro email:", err.message);
    }

    try {
      await enviarWhatsApp(
        `🐺 VARG - Nova venda PIX!\nCliente: ${nome}\nValor: R$ ${valor}\nPedido: ${pedido}`,
      );
    } catch (err) {
      console.error("❌ Erro WhatsApp:", err.message);
    }
  }

  if (event === "payment.expired") {
    console.log(`⏰ PIX expirou: ${data.data?.payment_id}`);
  }
});

// ==================== WEBHOOK MERCADO PAGO ====================
app.post("/webhook/mercadopago", async (req, res) => {
  res.status(200).json({ received: true });
  console.log("📨 Webhook MP:", JSON.stringify(req.body));

  const paymentId = req.body.data?.id || req.body.resource?.id;
  if (!paymentId) return;

  try {
    const options = {
      hostname: "api.mercadopago.com",
      path: `/v1/payments/${paymentId}`,
      headers: { Authorization: "Bearer " + MP_ACCESS_TOKEN },
    };
    const paymentData = await new Promise((resolve, reject) => {
      https
        .get(options, (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => resolve(JSON.parse(d)));
        })
        .on("error", reject);
    });

    if (paymentData.status === "approved") {
      const nome =
        (paymentData.payer?.first_name || "") +
        " " +
        (paymentData.payer?.last_name || "");
      const valor = paymentData.transaction_amount;
      const pid = String(paymentData.id);

      console.log(`💳 MP APROVADO! ${pid} | ${nome} | R$ ${valor}`);

      try {
        await pool.query(
          `INSERT INTO pedidos (payment_id, external_id, cliente_nome, cliente_email, valor, status)
           VALUES ($1, $2, $3, $4, $5, 'pago')
           ON CONFLICT (payment_id) DO NOTHING`,
          [
            pid,
            paymentData.external_reference || "",
            nome.trim(),
            paymentData.payer?.email || "",
            valor,
          ],
        );
      } catch (err) {
        console.error("❌ Erro ao salvar pedido MP:", err.message);
      }

      try {
        await transporter.sendMail({
          from: `"VARG" <${EMAIL_USER}>`,
          to: EMAIL_DESTINO,
          subject: `💳 Nova venda Cartão - R$ ${valor}`,
          html: `<h2 style="color:#009EE3">🐺 Nova venda no cartão!</h2>
                 <p><b>Método:</b> Cartão (Mercado Pago)</p>
                 <p><b>Cliente:</b> ${nome.trim()}</p>
                 <p><b>Valor:</b> R$ ${valor}</p>
                 <p><b>ID:</b> ${pid}</p>`,
        });
      } catch (err) {
        console.error("❌ Erro email MP:", err.message);
      }

      try {
        await enviarWhatsApp(
          `🐺 VARG - Nova venda cartão!\nCliente: ${nome.trim()}\nValor: R$ ${valor}\nID: ${pid}`,
        );
      } catch (err) {
        console.error("❌ Erro WhatsApp MP:", err.message);
      }
    }
  } catch (err) {
    console.error("Erro ao processar webhook MP:", err.message);
  }
});

// ==================== ROTAS DE PEDIDOS ====================
app.get("/api/pedidos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY criado_em DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar pedidos" });
  }
});

// ==================== PAINEL ADMIN ====================
app.get("/admin", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY criado_em DESC",
    );
    let html = `<html><head><title>Admin VARG</title>
    <style>
      body{font-family:Arial;padding:40px;background:#0a0a0a;color:#eee;}
      h1{color:#DC143C;margin-bottom:5px;}
      p{color:#888;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;background:#1a1a1a;}
      th{background:#DC143C;color:white;padding:12px;text-align:left;}
      td{padding:10px 12px;border-bottom:1px solid #333;font-size:0.9em;}
      tr:hover{background:#222;}
      .pago{color:#00ff88;font-weight:bold;}
      .pendente{color:orange;}
    </style></head><body>
    <h1>🐺 Pedidos VARG</h1>
    <p>Total: ${result.rows.length} pedido(s)</p>
    <table><tr>
      <th>ID Pagamento</th><th>Cliente</th><th>Email</th>
      <th>Valor</th><th>Status</th><th>Data</th>
    </tr>`;
    result.rows.forEach((p) => {
      html += `<tr>
        <td style="font-size:0.75em">${p.payment_id || "-"}</td>
        <td>${p.cliente_nome || "-"}</td>
        <td>${p.cliente_email || "-"}</td>
        <td>R$ ${parseFloat(p.valor || 0).toFixed(2)}</td>
        <td class="${p.status}">${p.status}</td>
        <td>${new Date(p.criado_em).toLocaleString("pt-BR")}</td>
      </tr>`;
    });
    html += `</table></body></html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send("Erro ao carregar pedidos: " + err.message);
  }
});

// ==================== TESTE EMAIL COM PEDIDO REAL ====================
app.get("/teste-email-pedido", async (req, res) => {
  try {
    // pega o pedido mais recente
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 1",
    );

    if (result.rows.length === 0) {
      return res.send("Nenhum pedido encontrado no banco.");
    }

    const pedido = result.rows[0];

    // monta o HTML bonito
    const html = `
      <h2 style="color:#DC143C">🐺 Nova venda confirmada!</h2>
      <p><b>Cliente:</b> ${pedido.cliente_nome || "-"}</p>
      <p><b>Email:</b> ${pedido.cliente_email || "-"}</p>
      <p><b>Valor:</b> R$ ${parseFloat(pedido.valor).toFixed(2)}</p>
      <p><b>Status:</b> ${pedido.status}</p>
      <p><b>ID do Pagamento:</b> ${pedido.payment_id}</p>
      <p><b>Pedido (external_id):</b> ${pedido.external_id}</p>
      <p><b>Data:</b> ${new Date(pedido.criado_em).toLocaleString("pt-BR")}</p>
    `;

    // envia o e-mail
    await transporter.sendMail({
      from: `"VARG" <${EMAIL_USER}>`,
      to: EMAIL_DESTINO,
      subject: `🐺 VARG – Teste de Email com Pedido Real`,
      html: html,
    });

    console.log("📧 Email TESTE com pedido real enviado!");
    res.send("Email enviado com dados reais do último pedido!");
  } catch (err) {
    console.error("❌ Erro teste-email-pedido:", err.message);
    res.status(500).send("Erro ao enviar email: " + err.message);
  }
});

// ==================== INICIAR ====================
pool
  .connect()
  .then(() => {
    console.log("✅ Conectado ao PostgreSQL");
    app.listen(PORT, () =>
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar no banco:", err.message);
    process.exit(1);
  });
