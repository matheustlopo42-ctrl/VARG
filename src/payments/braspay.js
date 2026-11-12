// Braspay (Braskey) — PIX.
// TODO: copiar a integração que já funciona no PEPMASTERS (criação de cobrança + validação do webhook)
// e preencher as duas funções abaixo mantendo o mesmo formato de retorno do pixgo.js.
// Depois é só definir PIX_PROVIDER=braspay no Render.
const nome = "braspay";

async function criarCobranca() {
  throw new Error("Integração Braspay ainda não configurada");
}

function lerWebhook() {
  return null;
}

module.exports = { nome, criarCobranca, lerWebhook };
