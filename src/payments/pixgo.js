const crypto = require("crypto");
const config = require("../config");

const nome = "pixgo";

async function criarCobranca({ valor, referencia, descricao }) {
  if (!config.pixgoApiKey) throw new Error("PIXGO_API_KEY não configurada");
  const r = await fetch("https://pixgo.org/api/v1/payment/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": config.pixgoApiKey },
    body: JSON.stringify({
      amount: Number(valor.toFixed(2)),
      description: descricao,
      external_id: referencia,
      webhook_url: `${config.baseUrl}/webhook/pixgo`,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!json.success || !json.data) throw new Error(json.message || json.error || `PixGo HTTP ${r.status}`);
  return {
    id: json.data.payment_id || json.data.id || null,
    copiaCola: json.data.qr_code || "",
    qrImagem: json.data.qr_image_url || "",
    expiraEm: json.data.expires_at ? new Date(json.data.expires_at) : new Date(Date.now() + 30 * 60 * 1000),
  };
}

function lerWebhook(req) {
  const ts = req.headers["x-webhook-timestamp"];
  const assinatura = req.headers["x-webhook-signature"];
  const evento = req.headers["x-webhook-event"];
  if (!ts || !assinatura || !req.rawBody || !config.pixgoWebhookSecret) return null;
  const esperado = crypto.createHmac("sha256", config.pixgoWebhookSecret).update(ts + "." + req.rawBody).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(String(assinatura), "hex"))) return null;
  } catch {
    return null;
  }
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) return null;
  const d = req.body?.data || {};
  return {
    evento: evento === "payment.completed" ? "pago" : evento === "payment.expired" ? "expirado" : "outro",
    referencia: d.external_id,
    pagamentoId: d.payment_id,
    valor: Number(d.amounts?.gross || 0),
  };
}

module.exports = { nome, criarCobranca, lerWebhook };
