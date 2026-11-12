const config = require("./config");
const { Resend } = require("resend");

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function enviar({ to, subject, html }) {
  if (!to) return;
  if (!resend) {
    console.log(`[email] (RESEND_API_KEY ausente) para=${to} assunto="${subject}"`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: config.emailFrom, to, subject, html });
    if (error) console.error("[email] erro:", JSON.stringify(error));
  } catch (e) {
    console.error("[email] falha:", e.message);
  }
}

function layout({ titulo, preheader = "", corpo, botao }) {
  const btn = botao
    ? `<tr><td style="padding:8px 0 4px"><a href="${esc(botao.url)}" style="display:inline-block;background:#DC143C;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:.04em;text-transform:uppercase">${esc(botao.texto)}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0b0b0c;padding:24px 12px">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#141416;border:1px solid #232327;border-radius:14px;overflow:hidden">
  <tr><td style="padding:22px 28px;border-bottom:1px solid #232327">
    <span style="font-family:Arial Black,Arial,sans-serif;font-size:22px;letter-spacing:.18em;color:#fff">VARG</span>
    <span style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.2em;color:#DC143C;margin-left:8px;text-transform:uppercase">A Matilha</span>
  </td></tr>
  <tr><td style="padding:28px;font-family:Arial,sans-serif;color:#d6d6da;font-size:15px;line-height:1.6">
    <h1 style="margin:0 0 16px;font-size:20px;color:#fff">${esc(titulo)}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:Arial,sans-serif;color:#d6d6da;font-size:15px;line-height:1.6">${corpo}</td></tr>${btn}</table>
  </td></tr>
  <tr><td style="padding:18px 28px;border-top:1px solid #232327;font-family:Arial,sans-serif;font-size:12px;color:#6e6e76">
    © ${new Date().getFullYear()} VARG — A Matilha · <a href="${esc(config.baseUrl)}" style="color:#9a9aa2">${esc(config.baseUrl.replace(/^https?:\/\//, ""))}</a>
  </td></tr>
</table></body></html>`;
}

function resumoPedido(p) {
  const itens = (p.itens || [])
    .map((i) => `<tr><td style="padding:6px 0;color:#d6d6da">${i.quantidade}× ${esc(i.nome)}${i.tamanho ? ` <span style="color:#8a8a92">(${esc(i.tamanho)})</span>` : ""}</td><td align="right" style="padding:6px 0;color:#d6d6da;white-space:nowrap">${brl(i.preco * i.quantidade)}</td></tr>`)
    .join("");
  const linha = (rotulo, valor, forte) =>
    `<tr><td style="padding:4px 0;color:${forte ? "#fff" : "#8a8a92"};${forte ? "font-weight:700" : ""}">${rotulo}</td><td align="right" style="padding:4px 0;color:${forte ? "#fff" : "#8a8a92"};${forte ? "font-weight:700" : ""}">${valor}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#0f0f11;border:1px solid #232327;border-radius:10px;padding:14px 16px">
    <tr><td colspan="2" style="padding-bottom:8px;color:#8a8a92;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Pedido ${esc(p.codigo)}</td></tr>
    ${itens}
    <tr><td colspan="2" style="border-top:1px solid #232327;padding-top:6px"></td></tr>
    ${linha("Subtotal", brl(p.subtotal))}
    ${Number(p.desconto) > 0 ? linha(`Desconto${p.cupom ? " (" + esc(p.cupom) + ")" : ""}`, "− " + brl(p.desconto)) : ""}
    ${linha("Frete", Number(p.frete) > 0 ? brl(p.frete) : "Grátis")}
    ${linha("Total", brl(p.total), true)}
  </table>`;
}

const linkPedido = (p) => `${config.baseUrl}/pedido.html?codigo=${encodeURIComponent(p.codigo)}`;
const METODO = { pix: "PIX", cripto: "Cripto (USDT)", whatsapp: "WhatsApp" };

const templates = {
  boasVindas: (nome) => ({
    subject: "Bem-vindo à matilha, " + nome,
    html: layout({
      titulo: `Bem-vindo à matilha, ${nome}`,
      corpo: `<p>Sua conta VARG está pronta. Por ela você acompanha seus pedidos, o status de envio e o código de rastreio.</p>`,
      botao: { texto: "Ver a loja", url: config.baseUrl },
    }),
  }),

  resetSenha: (nome, link) => ({
    subject: "VARG — Redefinição de senha",
    html: layout({
      titulo: "Redefinir sua senha",
      corpo: `<p>Olá, ${esc(nome)}. Recebemos um pedido para redefinir sua senha. O link vale por 1 hora.</p><p style="color:#8a8a92;font-size:13px">Se não foi você, ignore este e-mail.</p>`,
      botao: { texto: "Criar nova senha", url: link },
    }),
  }),

  pedidoRecebido: (p) => ({
    subject: `VARG — Pedido ${p.codigo} recebido`,
    html: layout({
      titulo: "Recebemos seu pedido",
      preheader: `Pedido ${p.codigo} — aguardando pagamento`,
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. Seu pedido foi registrado e está <b style="color:#fff">aguardando pagamento</b> via ${METODO[p.metodo] || p.metodo}.</p>${resumoPedido(p)}<p>Assim que o pagamento for confirmado, você recebe outro e-mail.</p>`,
      botao: { texto: "Ver pedido e pagar", url: linkPedido(p) },
    }),
  }),

  pagamentoConfirmado: (p) => ({
    subject: `VARG — Pagamento confirmado (${p.codigo})`,
    html: layout({
      titulo: "Pagamento confirmado",
      preheader: `Pedido ${p.codigo} pago`,
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. Confirmamos o pagamento do seu pedido. Agora ele entra na fila de separação.</p>${resumoPedido(p)}`,
      botao: { texto: "Acompanhar pedido", url: linkPedido(p) },
    }),
  }),

  emSeparacao: (p) => ({
    subject: `VARG — Pedido ${p.codigo} em separação`,
    html: layout({
      titulo: "Seu pedido está sendo preparado",
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. Estamos separando e embalando seu pedido. Você recebe o código de rastreio assim que ele for postado.</p>`,
      botao: { texto: "Acompanhar pedido", url: linkPedido(p) },
    }),
  }),

  enviado: (p) => ({
    subject: `VARG — Pedido ${p.codigo} enviado`,
    html: layout({
      titulo: "Seu pedido foi enviado",
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. Seu pedido está a caminho.</p>
        ${p.codigo_rastreio ? `<p style="margin:18px 0;padding:14px 16px;background:#0f0f11;border:1px solid #232327;border-radius:10px">${p.transportadora ? `<span style="color:#8a8a92">${esc(p.transportadora)}</span><br>` : ""}<span style="font-size:18px;color:#fff;font-weight:700;letter-spacing:.06em">${esc(p.codigo_rastreio)}</span></p>` : ""}`,
      botao: { texto: "Rastrear pedido", url: linkPedido(p) },
    }),
  }),

  entregue: (p) => ({
    subject: `VARG — Pedido ${p.codigo} entregue`,
    html: layout({
      titulo: "Pedido entregue",
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. Seu pedido consta como entregue. Obrigado por fazer parte da matilha.</p>`,
      botao: { texto: "Comprar de novo", url: config.baseUrl },
    }),
  }),

  cancelado: (p) => ({
    subject: `VARG — Pedido ${p.codigo} cancelado`,
    html: layout({
      titulo: "Pedido cancelado",
      corpo: `<p>Olá, ${esc(p.cliente_nome)}. O pedido ${esc(p.codigo)} foi cancelado. Se o pagamento já tinha sido feito, entre em contato para resolvermos.</p>`,
    }),
  }),

  adminNovoPedido: (p) => ({
    subject: `Novo pedido pago — ${p.codigo} — ${brl(p.total)}`,
    html: layout({
      titulo: "Novo pedido pago",
      corpo: `<p><b>${esc(p.cliente_nome)}</b> · ${esc(p.cliente_email)} · ${esc(p.cliente_telefone || "")}</p>${resumoPedido(p)}<p style="color:#8a8a92">${esc(p.endereco?.rua)}, ${esc(p.endereco?.numero)} — ${esc(p.endereco?.cidade)}/${esc(p.endereco?.estado)}</p>`,
      botao: { texto: "Abrir no admin", url: `${config.baseUrl}/admin/#pedidos/${p.id}` },
    }),
  }),

  adminPedidoManual: (p) => ({
    subject: `Pedido ${METODO[p.metodo]} aguardando — ${p.codigo} — ${brl(p.total)}`,
    html: layout({
      titulo: `Pedido via ${METODO[p.metodo]} aguardando confirmação`,
      corpo: `<p><b>${esc(p.cliente_nome)}</b> · ${esc(p.cliente_email)} · ${esc(p.cliente_telefone || "")}</p>${resumoPedido(p)}${p.cripto_tx ? `<p>Hash informado: <code>${esc(p.cripto_tx)}</code></p>` : ""}<p>Confira o pagamento e marque como pago no admin.</p>`,
      botao: { texto: "Abrir no admin", url: `${config.baseUrl}/admin/#pedidos/${p.id}` },
    }),
  }),

  estoqueBaixo: (produto, variacao, qtd) => ({
    subject: `${qtd === 0 ? "Esgotado" : "Estoque baixo"}: ${produto}${variacao !== "unico" ? " (" + variacao + ")" : ""}`,
    html: layout({
      titulo: qtd === 0 ? "Produto esgotado" : "Estoque baixo",
      corpo: `<p>${esc(produto)}${variacao !== "unico" ? " — tamanho " + esc(variacao) : ""}: <b style="color:#fff">${qtd}</b> unidade(s).</p>`,
      botao: { texto: "Gerenciar estoque", url: `${config.baseUrl}/admin/#estoque` },
    }),
  }),

  voltouEstoque: (nome, produto, url) => ({
    subject: `${produto} voltou ao estoque`,
    html: layout({
      titulo: "Voltou ao estoque",
      corpo: `<p>Olá${nome ? ", " + esc(nome) : ""}. O produto <b style="color:#fff">${esc(produto)}</b> que você pediu para ser avisado está disponível de novo.</p>`,
      botao: { texto: "Comprar agora", url },
    }),
  }),
};

module.exports = { enviar, templates, esc, brl };
