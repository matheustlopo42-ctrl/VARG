const express = require("express");
const crypto = require("crypto");
const config = require("../config");
const { q } = require("../db");
const { enviar, templates } = require("../email");
const { assinarAdmin, exigirAdmin, limitar, rota } = require("../auth");
const P = require("../pedidos");

const r = express.Router();
const texto = (s, max = 200) => String(s ?? "").trim().slice(0, max);

function igual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

r.post("/api/admin/login", limitar({ janelaMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const okEmail = igual(String(req.body.email || "").toLowerCase().trim(), config.adminEmail);
  const okSenha = igual(String(req.body.senha || ""), config.adminPassword);
  if (!okEmail || !okSenha) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  res.json({ token: assinarAdmin() });
});

r.use("/api/admin", exigirAdmin);

// ===================== RESUMO =====================
r.get("/api/admin/resumo", rota(async (req, res) => {
  const pagos = `status IN ('pago','em_separacao','enviado','entregue')`;
  const [hoje, mes, total, porStatus, serie, top, recentes, estoqueBaixo] = await Promise.all([
    q(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float v FROM pedidos WHERE ${pagos} AND pago_em >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`),
    q(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float v FROM pedidos WHERE ${pagos} AND pago_em >= date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`),
    q(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float v FROM pedidos WHERE ${pagos}`),
    q(`SELECT status, COUNT(*)::int n FROM pedidos GROUP BY status`),
    q(`SELECT to_char(d, 'YYYY-MM-DD') dia, COALESCE(SUM(p.total),0)::float v, COUNT(p.id)::int n
       FROM generate_series((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 29, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, '1 day') d
       LEFT JOIN pedidos p ON (p.pago_em AT TIME ZONE 'America/Sao_Paulo')::date = d AND p.${pagos}
       GROUP BY d ORDER BY d`),
    q(`SELECT i->>'nome' nome, SUM((i->>'quantidade')::int)::int qtd, SUM((i->>'quantidade')::int * (i->>'preco')::numeric)::float receita
       FROM pedidos, jsonb_array_elements(itens) i WHERE ${pagos} GROUP BY 1 ORDER BY qtd DESC LIMIT 6`),
    q(`SELECT id, codigo, cliente_nome, total, status, metodo, criado_em FROM pedidos ORDER BY criado_em DESC LIMIT 8`),
    q(`SELECT e.*, p.nome FROM estoque e LEFT JOIN produtos p ON p.id = e.produto_id WHERE e.quantidade <= e.alerta_minimo ORDER BY e.quantidade LIMIT 10`),
  ]);
  res.json({
    hoje: hoje.rows[0], mes: mes.rows[0], total: total.rows[0],
    ticket_medio: total.rows[0].n ? total.rows[0].v / total.rows[0].n : 0,
    por_status: Object.fromEntries(porStatus.rows.map((x) => [x.status, x.n])),
    serie: serie.rows, top: top.rows, recentes: recentes.rows, estoque_baixo: estoqueBaixo.rows,
  });
}));

// ===================== PEDIDOS =====================
function filtrosPedidos(query) {
  const where = [], vals = [];
  if (query.status && P.STATUS[query.status]) { vals.push(query.status); where.push(`status = $${vals.length}`); }
  if (query.metodo) { vals.push(query.metodo); where.push(`metodo = $${vals.length}`); }
  if (query.q) {
    vals.push(`%${texto(query.q, 80)}%`);
    where.push(`(codigo ILIKE $${vals.length} OR cliente_nome ILIKE $${vals.length} OR cliente_email ILIKE $${vals.length} OR codigo_rastreio ILIKE $${vals.length})`);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", vals };
}

r.get("/api/admin/pedidos", rota(async (req, res) => {
  const { sql, vals } = filtrosPedidos(req.query);
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = 25;
  const [lista, cont] = await Promise.all([
    q(`SELECT id, codigo, cliente_nome, cliente_email, total, status, metodo, codigo_rastreio, itens, criado_em FROM pedidos ${sql} ORDER BY criado_em DESC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, vals),
    q(`SELECT COUNT(*)::int n FROM pedidos ${sql}`, vals),
  ]);
  res.json({ pedidos: lista.rows, total: cont.rows[0].n, pagina, paginas: Math.max(1, Math.ceil(cont.rows[0].n / porPagina)) });
}));

r.get("/api/admin/pedidos.csv", rota(async (req, res) => {
  const { sql, vals } = filtrosPedidos(req.query);
  const { rows } = await q(`SELECT * FROM pedidos ${sql} ORDER BY criado_em DESC`, vals);
  const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [["codigo", "data", "status", "metodo", "cliente", "email", "telefone", "cpf", "itens", "subtotal", "desconto", "frete", "total", "cupom", "cidade", "uf", "cep", "rastreio"].join(";")];
  for (const p of rows) {
    linhas.push([
      p.codigo, new Date(p.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), P.STATUS[p.status], p.metodo, p.cliente_nome, p.cliente_email, p.cliente_telefone, p.cliente_cpf,
      p.itens.map((i) => `${i.quantidade}x ${i.nome}${i.tamanho ? " " + i.tamanho : ""}`).join(" | "),
      p.subtotal, p.desconto, p.frete, p.total, p.cupom, p.endereco?.cidade, p.endereco?.estado, p.endereco?.cep, p.codigo_rastreio,
    ].map(cel).join(";"));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pedidos-varg-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + linhas.join("\n"));
}));

r.get("/api/admin/pedidos/:id", rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM pedidos WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Pedido não encontrado." });
  const { rows: ev } = await q(`SELECT * FROM pedido_eventos WHERE pedido_id=$1 ORDER BY criado_em DESC`, [req.params.id]);
  res.json({ ...rows[0], eventos: ev });
}));

r.post("/api/admin/pedidos/:id/status", rota(async (req, res) => {
  const { status, transportadora, codigo_rastreio, nota, notificar } = req.body;
  if (!P.STATUS[status]) return res.status(400).json({ erro: "Status inválido." });
  if (status === "enviado" && !texto(codigo_rastreio)) return res.status(400).json({ erro: "Informe o código de rastreio para marcar como enviado." });
  const p = await P.mudarStatus(req.params.id, status, {
    autor: "admin", nota: texto(nota, 500) || null,
    transportadora: transportadora !== undefined ? texto(transportadora, 60) : undefined,
    codigo_rastreio: codigo_rastreio !== undefined ? texto(codigo_rastreio, 60).toUpperCase() : undefined,
    notificar: notificar !== false,
  });
  res.json(p);
}));

r.post("/api/admin/pedidos/:id/observacao", rota(async (req, res) => {
  await q(`UPDATE pedidos SET observacao_admin=$2, atualizado_em=NOW() WHERE id=$1`, [req.params.id, texto(req.body.observacao, 2000)]);
  res.json({ ok: true });
}));

r.post("/api/admin/pedidos/:id/reenviar-email", rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM pedidos WHERE id=$1`, [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ erro: "Pedido não encontrado." });
  const mapa = { aguardando_pagamento: "pedidoRecebido", pago: "pagamentoConfirmado", em_separacao: "emSeparacao", enviado: "enviado", entregue: "entregue", cancelado: "cancelado" };
  await enviar({ to: p.cliente_email, ...templates[mapa[p.status]](p) });
  await P.registrarEvento(p.id, p.status, "E-mail do status reenviado ao cliente", "admin");
  res.json({ ok: true });
}));

// ===================== PRODUTOS =====================
function lerProduto(b) {
  const lista = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim()).filter(Boolean);
  const preco = parseFloat(b.preco);
  const antes = b.preco_antes === "" || b.preco_antes == null ? null : parseFloat(b.preco_antes);
  if (!texto(b.nome)) return { erro: "Informe o nome." };
  if (!(preco > 0)) return { erro: "Preço inválido." };
  if (antes !== null && !(antes > preco)) return { erro: "O preço 'de' precisa ser maior que o preço de venda (ou deixe vazio)." };
  return {
    nome: texto(b.nome, 120), descricao: texto(b.descricao, 3000), categoria: texto(b.categoria || "camiseta", 40),
    preco, preco_antes: antes, imagens: lista(b.imagens).slice(0, 8), tamanhos: lista(b.tamanhos).map((t) => t.toUpperCase()).slice(0, 15),
    ativo: b.ativo !== false, destaque: !!b.destaque, ordem: parseInt(b.ordem, 10) || 0,
  };
}

r.get("/api/admin/produtos", rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM produtos ORDER BY ordem, nome`);
  const { rows: est } = await q(`SELECT * FROM estoque`);
  res.json(rows.map((p) => ({ ...p, estoque: est.filter((e) => e.produto_id === p.id) })));
}));

r.post("/api/admin/produtos", rota(async (req, res) => {
  const d = lerProduto(req.body);
  if (d.erro) return res.status(400).json(d);
  const id = texto(req.body.id || d.nome, 80).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) return res.status(400).json({ erro: "ID inválido." });
  try {
    await q(
      `INSERT INTO produtos (id, nome, descricao, categoria, preco, preco_antes, imagens, tamanhos, ativo, destaque, ordem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, d.nome, d.descricao, d.categoria, d.preco, d.preco_antes, JSON.stringify(d.imagens), JSON.stringify(d.tamanhos), d.ativo, d.destaque, d.ordem]
    );
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ erro: "Já existe um produto com esse ID." });
    throw e;
  }
  res.json({ ok: true, id });
}));

r.put("/api/admin/produtos/:id", rota(async (req, res) => {
  const d = lerProduto(req.body);
  if (d.erro) return res.status(400).json(d);
  const { rowCount } = await q(
    `UPDATE produtos SET nome=$2, descricao=$3, categoria=$4, preco=$5, preco_antes=$6, imagens=$7, tamanhos=$8, ativo=$9, destaque=$10, ordem=$11, atualizado_em=NOW() WHERE id=$1`,
    [req.params.id, d.nome, d.descricao, d.categoria, d.preco, d.preco_antes, JSON.stringify(d.imagens), JSON.stringify(d.tamanhos), d.ativo, d.destaque, d.ordem]
  );
  if (!rowCount) return res.status(404).json({ erro: "Produto não encontrado." });
  res.json({ ok: true });
}));

// Lista as imagens disponíveis em public/img (para escolher no cadastro)
r.get("/api/admin/imagens", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(__dirname, "..", "..", "public", "img");
  const arquivos = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f)).map((f) => "/img/" + f);
  res.json(arquivos);
});

// ===================== ESTOQUE =====================
r.post("/api/admin/estoque", rota(async (req, res) => {
  const { produto_id } = req.body;
  const variacao = texto(req.body.variacao || "unico", 20);
  const { rows: prod } = await q(`SELECT * FROM produtos WHERE id=$1`, [produto_id]);
  if (!prod[0]) return res.status(404).json({ erro: "Produto não encontrado." });

  if (req.body.controlar === false) {
    await q(`DELETE FROM estoque WHERE produto_id=$1 AND variacao=$2`, [produto_id, variacao]);
    return res.json({ ok: true });
  }
  const qtd = Math.max(0, parseInt(req.body.quantidade, 10) || 0);
  const alerta = Math.max(0, parseInt(req.body.alerta_minimo, 10) || 0);
  const { rows: antes } = await q(`SELECT quantidade FROM estoque WHERE produto_id=$1 AND variacao=$2`, [produto_id, variacao]);
  await q(
    `INSERT INTO estoque (produto_id, variacao, quantidade, alerta_minimo, atualizado_em) VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (produto_id, variacao) DO UPDATE SET quantidade=$3, alerta_minimo=$4, atualizado_em=NOW()`,
    [produto_id, variacao, qtd, alerta]
  );

  // Voltou ao estoque → avisa quem está na lista de espera
  let avisados = 0;
  if (antes[0] && antes[0].quantidade === 0 && qtd > 0) {
    const { rows: lista } = await q(`SELECT * FROM lista_espera WHERE produto_id=$1 AND variacao=$2 AND avisado_em IS NULL`, [produto_id, variacao]);
    const nomeProd = prod[0].nome + (variacao !== "unico" ? ` (${variacao})` : "");
    for (const l of lista) {
      enviar({ to: l.email, ...templates.voltouEstoque(l.nome, nomeProd, `${config.baseUrl}/produto.html?id=${encodeURIComponent(produto_id)}`) });
    }
    if (lista.length) await q(`UPDATE lista_espera SET avisado_em=NOW() WHERE id = ANY($1)`, [lista.map((l) => l.id)]);
    avisados = lista.length;
  }
  res.json({ ok: true, avisados });
}));

// ===================== CUPONS =====================
r.get("/api/admin/cupons", rota(async (req, res) => {
  res.json((await q(`SELECT * FROM cupons ORDER BY criado_em DESC`)).rows);
}));

r.post("/api/admin/cupons", rota(async (req, res) => {
  const codigo = texto(req.body.codigo, 30).toUpperCase().replace(/\s+/g, "");
  const tipo = req.body.tipo === "fixo" ? "fixo" : "percentual";
  const valor = parseFloat(req.body.valor);
  if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return res.status(400).json({ erro: "Código: 3 a 30 letras/números, sem espaços." });
  if (!(valor > 0) || (tipo === "percentual" && valor > 90)) return res.status(400).json({ erro: "Valor do desconto inválido." });
  try {
    await q(`INSERT INTO cupons (codigo, tipo, valor, minimo, limite_usos, validade) VALUES ($1,$2,$3,$4,$5,$6)`, [
      codigo, tipo, valor, parseFloat(req.body.minimo) || 0,
      parseInt(req.body.limite_usos, 10) || null, req.body.validade ? new Date(req.body.validade + "T23:59:59-03:00") : null,
    ]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ erro: "Esse código já existe." });
    throw e;
  }
  res.json({ ok: true });
}));

r.post("/api/admin/cupons/:id/alternar", rota(async (req, res) => {
  await q(`UPDATE cupons SET ativo = NOT ativo WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

// ===================== CLIENTES E LISTA DE ESPERA =====================
r.get("/api/admin/clientes", rota(async (req, res) => {
  const busca = texto(req.query.q, 80);
  const { rows } = await q(
    `SELECT u.id, u.nome, u.email, u.telefone, u.criado_em,
       COUNT(p.id) FILTER (WHERE p.status IN ('pago','em_separacao','enviado','entregue'))::int pedidos,
       COALESCE(SUM(p.total) FILTER (WHERE p.status IN ('pago','em_separacao','enviado','entregue')),0)::float gasto,
       MAX(p.criado_em) ultimo_pedido
     FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id
     WHERE ($1 = '' OR u.nome ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%')
     GROUP BY u.id ORDER BY u.criado_em DESC LIMIT 200`,
    [busca]
  );
  res.json(rows);
}));

r.get("/api/admin/lista-espera", rota(async (req, res) => {
  const { rows } = await q(`SELECT l.*, p.nome produto_nome FROM lista_espera l LEFT JOIN produtos p ON p.id = l.produto_id ORDER BY l.avisado_em NULLS FIRST, l.criado_em DESC LIMIT 300`);
  res.json(rows);
}));

module.exports = r;
