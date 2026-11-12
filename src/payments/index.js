// Camada de pagamentos PIX. Cada provedor expõe:
//   criarCobranca({ valor, referencia, descricao, cliente }) -> { id, copiaCola, qrImagem, expiraEm }
//   lerWebhook(req) -> null (inválido) | { evento: 'pago'|'expirado'|'outro', referencia, pagamentoId, valor }
// Para trocar de provedor basta mudar PIX_PROVIDER no ambiente.
const config = require("../config");

const provedores = {
  pixgo: require("./pixgo"),
  braspay: require("./braspay"),
};

function provedorPix() {
  const p = provedores[config.pixProvider];
  if (!p) throw new Error(`PIX_PROVIDER inválido: ${config.pixProvider}`);
  return p;
}

module.exports = { provedorPix, provedores };
