const crypto = require("crypto");
const config = require("./config");
const { q, pool } = require("./db");
const { enviar, templates } = require("./email");
const { avisarWhatsApp } = require("./whatsapp");

const STATUS = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const arred = (v) => Math.round(v * 100) / 100;

function gerarCodigo() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return "VG-" + Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

async function buscarCupom(codigo) {
  if (!codigo) return null;
  const { rows } = await q(`SELECT * FROM cupons WHERE codigo = $1`, [String(codigo).toUpperCase().trim()]);
  return rows[0] || null;
}

function validarCupom(c, base) {
  if (!c || !c.ativo) return "Cupom inválido ou desativado.";
  if (c.validade && new Date(c.validade) < new Date()) return "Cupom expirado.";
  if (c.limite_usos != null && c.usos >= c.limite_usos) return "Cupom esgotado.";
  if (Number(c.minimo) > 0 && base < Number(c.minimo)) return `Cupom válido para compras a partir de R$ ${Number(c.minimo).toFixed(2).replace(".", ",")}.`;
  return null;
}

// Recalcula o carrinho no servidor. O preço que o navegador manda é ignorado.
async function calcular(itensEntrada, codigoCupom) {
  if (!Array.isArray(itensEntrada) || !itensEntrada.length) return { erro: "Carrinho vazio." };
  if (itensEntrada.length > 30) return { erro: "Carrinho com itens demais." };

  const ids = [...new Set(itensEntrada.map((i) => String(i.produto_id || "")))];
  const { rows: produtos } = await q(`SELECT * FROM produtos WHERE id = ANY($1) AND ativo = TRUE`, [ids]);
  const { rows: estoque } = await q(`SELECT * FROM estoque WHERE produto_id = ANY($1)`, [ids]);
  const mapaEstoque = new Map(estoque.map((e) => [e.produto_id + "|" + e.variacao, e.quantidade]));

  const agrupado = new Map();
  for (const i of itensEntrada) {
    const p = produtos.find((x) => x.id === i.produto_id);
    if (!p) return { erro: "Um dos produtos não está mais disponível. Atualize o carrinho." };
    const tamanhos = p.tamanhos || [];
    const tamanho = tamanhos.length ? String(i.tamanho || "") : null;
    if (tamanhos.length && !tamanhos.includes(tamanho)) return { erro: `Escolha um tamanho válido para ${p.nome}.` };
    const quantidade = parseInt(i.quantidade, 10);
    if (!(quantidade >= 1 && quantidade <= 50)) return { erro: `Quantidade inválida para ${p.nome}.` };
    const chave = p.id + "|" + (tamanho || "unico");
    const atual = agrupado.get(chave);
    if (atual) atual.quantidade += quantidade;
    else agrupado.set(chave, { produto_id: p.id, nome: p.nome, tamanho, preco: Number(p.preco), quantidade, imagem: (p.imagens || [])[0] || "" });
  }

  const itens = [...agrupado.values()];
  for (const it of itens) {
    const disp = mapaEstoque.get(it.produto_id + "|" + (it.tamanho || "unico"));
    if (disp !== undefined && it.quantidade > disp) {
      return { erro: disp > 0 ? `Só temos ${disp} unidade(s) de ${it.nome}${it.tamanho ? " " + it.tamanho : ""}.` : `${it.nome}${it.tamanho ? " " + it.tamanho : ""} está esgotado.` };
    }
  }

  const subtotal = arred(itens.reduce((s, i) => s + i.preco * i.quantidade, 0));
  let desconto = 0, cupom = null, erroCupom = null;
  if (codigoCupom) {
    const c = await buscarCupom(codigoCupom);
    erroCupom = validarCupom(c, subtotal);
    if (!erroCupom) {
      cupom = c.codigo;
      desconto = c.tipo === "fixo" ? Math.min(Number(c.valor), subtotal) : arred(subtotal * (Number(c.valor) / 100));
    }
  }
  const base = arred(subtotal - desconto);
  const frete = config.freteGratisAcima > 0 && base >= config.freteGratisAcima ? 0 : arred(config.freteFixo);
  return { itens, subtotal, desconto: arred(desconto), frete, total: arred(base + frete), cupom, erroCupom };
}

async function registrarEvento(pedidoId, status, nota, autor = "sistema", client = null) {
  await (client || pool).query(`INSERT INTO pedido_eventos (pedido_id, status, nota, autor) VALUES ($1,$2,$3,$4)`, [pedidoId, status, nota || null, autor]);
}

async function baixarEstoque(client, pedido) {
  for (const it of pedido.itens) {
    const variacao = it.tamanho || "unico";
    const { rows } = await client.query(
      `UPDATE estoque SET quantidade = GREATEST(quantidade - $1, 0), atualizado_em = NOW()
       WHERE produto_id = $2 AND variacao = $3 RETURNING quantidade, alerta_minimo`,
      [it.quantidade, it.produto_id, variacao]
    );
    if (rows[0] && rows[0].quantidade <= rows[0].alerta_minimo) {
      const t = templates.estoqueBaixo(it.nome, variacao, rows[0].quantidade);
      enviar({ to: config.emailAdmin, ...t });
    }
  }
}

async function devolverEstoque(client, pedido) {
  for (const it of pedido.itens) {
    await client.query(
      `UPDATE estoque SET quantidade = quantidade + $1, atualizado_em = NOW() WHERE produto_id = $2 AND variacao = $3`,
      [it.quantidade, it.produto_id, it.tamanho || "unico"]
    );
  }
}

// Única porta de entrada para mudar o status de um pedido.
async function mudarStatus(pedidoId, novo, { autor = "sistema", nota = null, transportadora, codigo_rastreio, pagamentoId, notificar = true } = {}) {
  if (!STATUS[novo]) throw new Error("Status inválido");
  const client = await pool.connect();
  let pedido, anterior;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM pedidos WHERE id = $1 FOR UPDATE`, [pedidoId]);
    pedido = rows[0];
    if (!pedido) throw new Error("Pedido não encontrado");
    anterior = pedido.status;

    const sets = ["status = $2", "atualizado_em = NOW()"];
    const vals = [pedidoId, novo];
    const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (transportadora !== undefined) add("transportadora", transportadora || null);
    if (codigo_rastreio !== undefined) add("codigo_rastreio", codigo_rastreio || null);
    if (pagamentoId) add("pagamento_id", pagamentoId);
    if (novo === "enviado" && !pedido.enviado_em) sets.push("enviado_em = NOW()");
    if (novo === "entregue" && !pedido.entregue_em) sets.push("entregue_em = NOW()");

    const pagoAgora = ["pago", "em_separacao", "enviado", "entregue"].includes(novo);
    if (pagoAgora && !pedido.pago_em) sets.push("pago_em = NOW()");
    if (pagoAgora && !pedido.estoque_baixado) {
      await baixarEstoque(client, pedido);
      sets.push("estoque_baixado = TRUE");
      if (pedido.cupom) await client.query(`UPDATE cupons SET usos = usos + 1 WHERE codigo = $1`, [pedido.cupom]);
    }
    if (novo === "cancelado" && pedido.estoque_baixado) {
      await devolverEstoque(client, pedido);
      sets.push("estoque_baixado = FALSE");
    }

    const upd = await client.query(`UPDATE pedidos SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, vals);
    pedido = upd.rows[0];
    if (anterior !== novo || nota) await registrarEvento(pedidoId, novo, nota, autor, client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  if (notificar && anterior !== novo) notificarStatus(pedido, anterior);
  return pedido;
}

function notificarStatus(p, anterior) {
  const mapa = { pago: "pagamentoConfirmado", em_separacao: "emSeparacao", enviado: "enviado", entregue: "entregue", cancelado: "cancelado" };
  const t = mapa[p.status] && templates[mapa[p.status]](p);
  if (t) enviar({ to: p.cliente_email, ...t });
  if (p.status === "pago" && anterior === "aguardando_pagamento") {
    enviar({ to: config.emailAdmin, ...templates.adminNovoPedido(p) });
    avisarWhatsApp(`VARG — pedido pago ${p.codigo}\n${p.cliente_nome}\nTotal: R$ ${Number(p.total).toFixed(2)}`);
  }
}

// Formato enviado para o cliente (sem campos internos)
function publico(p, eventos) {
  return {
    codigo: p.codigo,
    status: p.status,
    status_label: STATUS[p.status],
    metodo: p.metodo,
    itens: p.itens,
    subtotal: Number(p.subtotal),
    desconto: Number(p.desconto),
    frete: Number(p.frete),
    total: Number(p.total),
    cupom: p.cupom,
    endereco: p.endereco,
    cliente_nome: p.cliente_nome,
    transportadora: p.transportadora,
    codigo_rastreio: p.codigo_rastreio,
    pix_copia_cola: p.status === "aguardando_pagamento" ? p.pix_copia_cola : null,
    pix_qr: p.status === "aguardando_pagamento" ? p.pix_qr : null,
    pix_expira_em: p.pix_expira_em,
    cripto_tx: p.cripto_tx,
    criado_em: p.criado_em,
    pago_em: p.pago_em,
    enviado_em: p.enviado_em,
    entregue_em: p.entregue_em,
    eventos: eventos ? eventos.map((e) => ({ status: e.status, status_label: STATUS[e.status], nota: e.nota, criado_em: e.criado_em })) : undefined,
  };
}

module.exports = { STATUS, calcular, gerarCodigo, mudarStatus, registrarEvento, publico, buscarCupom, validarCupom };
