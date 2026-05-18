const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

// Configuração do PostgreSQL via variáveis de ambiente (Railway)
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Middleware para capturar raw body (necessário para webhook)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static(__dirname));

// ==================== ROTAS DA API ====================

// Listar todos os pedidos
app.get("/api/pedidos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pedidos ORDER BY criado_em DESC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar pedidos:", err.message);
    res.status(500).json({ error: "Erro ao listar pedidos" });
  }
});

// Buscar um pedido por ID
app.get("/api/pedidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM pedidos WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar pedido:", err.message);
    res.status(500).json({ error: "Erro ao buscar pedido" });
  }
});

// Criar um novo pedido
app.post("/api/pedidos", async (req, res) => {
  try {
    const { cliente_nome, cliente_email, valor, items } = req.body;
    const result = await pool.query(
      `INSERT INTO pedidos (cliente_nome, cliente_email, valor, items)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [cliente_nome, cliente_email, valor, JSON.stringify(items || [])],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao criar pedido:", err.message);
    res.status(500).json({ error: "Erro ao criar pedido" });
  }
});

// Atualizar status de um pedido
app.put("/api/pedidos/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_id, external_id } = req.body;
    const result = await pool.query(
      `UPDATE pedidos SET status = $1,
       payment_id = COALESCE($2, payment_id),
       external_id = COALESCE($3, external_id)
       WHERE id = $4 RETURNING *`,
      [status, payment_id || null, external_id || null, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar pedido:", err.message);
    res.status(500).json({ error: "Erro ao atualizar pedido" });
  }
});

// ==================== WEBHOOK MERCADO PAGO ====================

app.post("/api/webhook/mercadopago", async (req, res) => {
  // Sempre retorna 200 primeiro para o Mercado Pago não reenviar
  res.status(200).json({ received: true });

  try {
    const notification = req.body;
    console.log("Webhook recebido:", JSON.stringify(notification, null, 2));

    // Extrair dados da notificação
    const paymentId =
      notification.data?.id || notification.resource?.id || notification.id;

    if (!paymentId) {
      console.log("Webhook sem payment_id, ignorando");
      return;
    }

    // Se tiver access token configurado, busca detalhes do pagamento
    if (process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      try {
        const https = require("https");
        const options = {
          hostname: "api.mercadopago.com",
          path: `/v1/payments/${paymentId}`,
          headers: {
            Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
          },
        };

        const paymentData = await new Promise((resolve, reject) => {
          https
            .get(options, (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => resolve(JSON.parse(data)));
            })
            .on("error", reject);
        });

        const statusMap = {
          approved: "aprovado",
          rejected: "recusado",
          cancelled: "cancelado",
          refunded: "reembolsado",
          in_process: "pendente",
          pending: "pendente",
        };

        const novoStatus = statusMap[paymentData.status] || "pendente";
        const externalRef = paymentData.external_reference;

        if (externalRef) {
          await pool.query(
            `UPDATE pedidos SET status = $1, payment_id = $2
             WHERE external_id = $3`,
            [novoStatus, paymentId, externalRef],
          );
          console.log(`Pedido ${externalRef} atualizado para ${novoStatus}`);
        }
      } catch (apiErr) {
        console.error("Erro ao consultar API do Mercado Pago:", apiErr.message);
      }
    }
  } catch (err) {
    console.error("Erro no processamento do webhook:", err.message);
  }
});

// ==================== ERROR HANDLER GLOBAL ====================

app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ==================== INICIAR SERVIDOR ====================

const PORT = process.env.PORT || 3000;

pool
  .connect()
  .then(() => {
    console.log("Conectado ao PostgreSQL");
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Acesse http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erro ao conectar no banco:", err.message);
    process.exit(1);
  });
