const express = require("express");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const https = require("https");

const app = express();
const PORT = 3000;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "123",
});

app.use(express.json());
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

// PIX
app.post("/pix", async (req, res) => {
  const amountCents = parseInt(req.body.amount ?? 3990);
  const valor = amountCents / 100;

  const payload = JSON.stringify({
    amount: valor,
    description: "Pedido VARG",
    external_id: "VARG_" + Date.now(),
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

app.listen(PORT, () => {
  console.log(`✅ Servidor VARG rodando em http://localhost:${PORT}`);
});
