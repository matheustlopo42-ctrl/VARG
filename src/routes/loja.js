const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const QRCode = require("qrcode");
const config = require("../config");
const { q } = require("../db");
const { enviar, templates } = require("../email");
const { assinarCliente, exigirCliente, limitar, rota } = require("../auth");
const P = require("../pedidos");
const { provedorPix, provedores } = require("../payments");

const r = express.Router();
const limiteAuth = limitar({ janelaMs: 15 * 60 * 1000, max: 20 });

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ""));
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const texto = (s, max = 200) => String(s ?? "").trim().slice(0, max);

function cpfValido(cpf) {
  cpf = soDigitos(cpf);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(cpf[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(cpf[t])) return false;
  }
  return true;
}

function produtoPublico(p, estoque) {
  const tamanhos = p.tamanhos || [];
  const disp = (v) => {
    const e = estoque.find((x) => x.produto_id === p.id && x.variacao === v);
    return e ? e.quantidade : null; // null = sem controle de estoque
  };
  const variacoes = tamanhos.length ? tamanhos.map((t) => ({ tamanho: t, disponivel: disp(t) })) : [];
  const unico = disp("unico");
  const esgotado = tamanhos.length ? variacoes.every((v) => v.disponivel === 0) : unico === 0;
  return {
    id: p.id, nome: p.nome, descricao: p.descricao, categoria: p.categoria,
    preco: Number(p.preco), preco_antes: p.preco_antes ? Number(p.preco_antes) : null,
    imagens: p.imagens || [], tamanhos, variacoes, disponivel: tamanhos.length ? null : unico,
    esgotado, destaque: p.destaque,
  };
}

// ===================== CATÁLOGO =====================
r.get("/api/produtos", rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM produtos WHERE ativo = TRUE ORDER BY ordem, nome`);
  const { rows: est } = await q(`SELECT * FROM estoque`);
  res.json(rows.map((p) => produtoPublico(p, est)));
}));

r.get("/api/produtos/:id", rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM produtos WHERE id = $1 AND ativo = TRUE`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Produto não encontrado." });
  const { rows: est } = await q(`SELECT * FROM estoque WHERE produto_id = $1`, [req.params.id]);
  res.json(produtoPublico(rows[0], est));
}));

r.get("/api/config-publica", (req, res) => {
  res.json({
    frete_fixo: config.freteFixo,
    frete_gratis_acima: config.freteGratisAcima,
    cripto_ativo: !!config.cryptoWallet,
    whatsapp_ativo: !!config.whatsappPhone,
    pix_ativo: provedorPixConfigurado(),
  });
});

function provedorPixConfigurado() {
  if (config.pixProvider === "pixgo") return !!config.pixgoApiKey;
  return config.pixProvider in provedores;
}

r.post("/api/carrinho/cotacao", rota(async (req, res) => {
  const c = await P.calcular(req.body.itens, req.body.cupom);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  res.json(c);
}));

r.post("/api/lista-espera", limitar({ janelaMs: 60 * 60 * 1000, max: 20 }), rota(async (req, res) => {
  const { produto_id, variacao, email, nome } = req.body;
  if (!produto_id || !emailValido(email)) return res.status(400).json({ erro: "Informe um e-mail válido." });
  const v = texto(variacao || "unico", 20);
  const existe = await q(`SELECT 1 FROM lista_espera WHERE produto_id=$1 AND variacao=$2 AND lower(email)=lower($3) AND avisado_em IS NULL`, [produto_id, v, email]);
  if (!existe.rowCount) await q(`INSERT INTO lista_espera (produto_id, variacao, email, nome) VALUES ($1,$2,$3,$4)`, [texto(produto_id, 80), v, texto(email, 160), texto(nome, 80)]);
  res.json({ ok: true, mensagem: "Pronto! Avisamos por e-mail quando voltar." });
}));

// ===================== CONTA =====================
r.post("/api/auth/cadastro", limiteAuth, rota(async (req, res) => {
  const nome = texto(req.body.nome, 80);
  const email = texto(req.body.email, 160).toLowerCase();
  const senha = String(req.body.senha || "");
  if (nome.length < 2) return res.status(400).json({ erro: "Informe seu nome." });
  if (!emailValido(email)) return res.status(400).json({ erro: "E-mail inválido." });
  if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
  const existe = await q(`SELECT 1 FROM usuarios WHERE lower(email) = $1`, [email]);
  if (existe.rowCount) return res.status(409).json({ erro: "Este e-mail já tem cadastro. Faça login." });
  const hash = await bcrypt.hash(senha, 10);
  const { rows } = await q(`INSERT INTO usuarios (nome, email, senha) VALUES ($1,$2,$3) RETURNING id, nome, email`, [nome, email, hash]);
  enviar({ to: email, ...templates.boasVindas(nome) });
  res.json({ token: assinarCliente(rows[0]), usuario: rows[0] });
}));

r.post("/api/auth/login", limiteAuth, rota(async (req, res) => {
  const email = texto(req.body.email, 160).toLowerCase();
  const { rows } = await q(`SELECT * FROM usuarios WHERE lower(email) = $1`, [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(String(req.body.senha || ""), u.senha))) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  res.json({ token: assinarCliente(u), usuario: { id: u.id, nome: u.nome, email: u.email } });
}));

r.post("/api/auth/esqueci-senha", limiteAuth, rota(async (req, res) => {
  const email = texto(req.body.email, 160).toLowerCase();
  const { rows } = await q(`SELECT * FROM usuarios WHERE lower(email) = $1`, [email]);
  if (rows[0]) {
    const tk = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(tk).digest("hex");
    await q(`UPDATE usuarios SET reset_token=$1, reset_expires=NOW() + INTERVAL '1 hour' WHERE id=$2`, [hash, rows[0].id]);
    enviar({ to: rows[0].email, ...templates.resetSenha(rows[0].nome, `${config.baseUrl}/redefinir-senha.html?token=${tk}`) });
  }
  // Mesma resposta sempre, para não revelar quais e-mails têm cadastro
  res.json({ ok: true, mensagem: "Se este e-mail tiver cadastro, você vai receber um link em instantes." });
}));

r.post("/api/auth/redefinir-senha", limiteAuth, rota(async (req, res) => {
  const senha = String(req.body.senha || "");
  if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
  const hash = crypto.createHash("sha256").update(String(req.body.token || "")).digest("hex");
  const { rows } = await q(`SELECT id FROM usuarios WHERE reset_token=$1 AND reset_expires > NOW()`, [hash]);
  if (!rows[0]) return res.status(400).json({ erro: "Link inválido ou expirado. Peça um novo." });
  await q(`UPDATE usuarios SET senha=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2`, [await bcrypt.hash(senha, 10), rows[0].id]);
  res.json({ ok: true });
}));

r.get("/api/conta", exigirCliente, rota(async (req, res) => {
  const { rows } = await q(`SELECT id, nome, email, cpf, telefone, endereco, criado_em FROM usuarios WHERE id=$1`, [req.usuario.id]);
  if (!rows[0]) return res.status(401).json({ erro: "Conta não encontrada." });
  res.json(rows[0]);
}));

r.put("/api/conta", exigirCliente, rota(async (req, res) => {
  const nome = texto(req.body.nome, 80);
  if (nome.length < 2) return res.status(400).json({ erro: "Informe seu nome." });
  const cpf = soDigitos(req.body.cpf);
  if (cpf && !cpfValido(cpf)) return res.status(400).json({ erro: "CPF inválido." });
  await q(`UPDATE usuarios SET nome=$1, cpf=$2, telefone=$3 WHERE id=$4`, [nome, cpf || null, texto(req.body.telefone, 30) || null, req.usuario.id]);
  res.json({ ok: true });
}));

r.put("/api/conta/senha", exigirCliente, rota(async (req, res) => {
  const { rows } = await q(`SELECT senha FROM usuarios WHERE id=$1`, [req.usuario.id]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body.atual || ""), rows[0].senha))) return res.status(400).json({ erro: "Senha atual incorreta." });
  if (String(req.body.nova || "").length < 8) return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 8 caracteres." });
  await q(`UPDATE usuarios SET senha=$1 WHERE id=$2`, [await bcrypt.hash(String(req.body.nova), 10), req.usuario.id]);
  res.json({ ok: true });
}));

r.get("/api/conta/pedidos", exigirCliente, rota(async (req, res) => {
  const { rows } = await q(`SELECT * FROM pedidos WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 100`, [req.usuario.id]);
  res.json(rows.map((p) => P.publico(p)));
}));

async function pedidoDoCliente(req) {
  const { rows } = await q(`SELECT * FROM pedidos WHERE codigo=$1 AND usuario_id=$2`, [String(req.params.codigo).toUpperCase(), req.usuario.id]);
  return rows[0];
}

r.get("/api/conta/pedidos/:codigo", exigirCliente, rota(async (req, res) => {
  const p = await pedidoDoCliente(req);
  if (!p) return res.status(404).json({ erro: "Pedido não encontrado." });
  const { rows: ev } = await q(`SELECT * FROM pedido_eventos WHERE pedido_id=$1 ORDER BY criado_em`, [p.id]);
  res.json(P.publico(p, ev));
}));

// ===================== CHECKOUT =====================
async function gerarPix(p) {
  const pix = await provedorPix().criarCobranca({
    valor: Number(p.total),
    referencia: p.codigo,
    descricao: `Pedido VARG ${p.codigo}`,
    cliente: { nome: p.cliente_nome, email: p.cliente_email, cpf: p.cliente_cpf, telefone: p.cliente_telefone },
  });
  // Se o provedor não mandar a imagem, geramos o QR a partir do copia e cola
  if (!pix.qrImagem && pix.copiaCola) pix.qrImagem = await QRCode.toDataURL(pix.copiaCola, { margin: 1, width: 360 });
  const { rows } = await q(
    `UPDATE pedidos SET pagamento_id=$2, pix_copia_cola=$3, pix_qr=$4, pix_expira_em=$5, atualizado_em=NOW() WHERE id=$1 RETURNING *`,
    [p.id, pix.id, pix.copiaCola, pix.qrImagem, pix.expiraEm]
  );
  return rows[0];
}

r.post("/api/pedidos", exigirCliente, limitar({ janelaMs: 10 * 60 * 1000, max: 15 }), rota(async (req, res) => {
  const { itens, cupom, metodo, cliente = {}, endereco = {} } = req.body;
  if (!["pix", "cripto", "whatsapp"].includes(metodo)) return res.status(400).json({ erro: "Escolha a forma de pagamento." });
  if (metodo === "cripto" && !config.cryptoWallet) return res.status(400).json({ erro: "Pagamento em cripto indisponível no momento." });
  if (metodo === "whatsapp" && !config.whatsappPhone) return res.status(400).json({ erro: "Pedido por WhatsApp indisponível no momento." });

  const nome = texto(cliente.nome, 100);
  const cpf = soDigitos(cliente.cpf);
  const telefone = soDigitos(cliente.telefone);
  if (nome.length < 3) return res.status(400).json({ erro: "Informe o nome completo." });
  if (!cpfValido(cpf)) return res.status(400).json({ erro: "CPF inválido." });
  if (telefone.length < 10) return res.status(400).json({ erro: "Telefone inválido." });

  const end = {
    cep: soDigitos(endereco.cep), rua: texto(endereco.rua, 120), numero: texto(endereco.numero, 20), complemento: texto(endereco.complemento, 80),
    bairro: texto(endereco.bairro, 80), cidade: texto(endereco.cidade, 80), estado: texto(endereco.estado, 2).toUpperCase(),
  };
  if (end.cep.length !== 8 || !end.rua || !end.numero || !end.bairro || !end.cidade || end.estado.length !== 2)
    return res.status(400).json({ erro: "Preencha o endereço completo." });

  const c = await P.calcular(itens, cupom);
  if (c.erro) return res.status(400).json({ erro: c.erro });
  if (cupom && c.erroCupom) return res.status(400).json({ erro: c.erroCupom });

  let pedido;
  for (let tentativa = 0; tentativa < 3 && !pedido; tentativa++) {
    try {
      const { rows } = await q(
        `INSERT INTO pedidos (codigo, usuario_id, cliente_nome, cliente_email, cliente_telefone, cliente_cpf, endereco, itens, subtotal, desconto, frete, total, cupom, metodo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [P.gerarCodigo(), req.usuario.id, nome, req.usuario.email, telefone, cpf, JSON.stringify(end), JSON.stringify(c.itens), c.subtotal, c.desconto, c.frete, c.total, c.cupom, metodo]
      );
      pedido = rows[0];
    } catch (e) {
      if (e.code !== "23505") throw e; // código repetido: tenta de novo
    }
  }
  await P.registrarEvento(pedido.id, "aguardando_pagamento", `Pedido criado (${metodo})`, "cliente");

  // Guarda dados do cliente para o próximo checkout
  await q(`UPDATE usuarios SET cpf=COALESCE(cpf,$1), telefone=COALESCE(telefone,$2), endereco=$3 WHERE id=$4`, [cpf, telefone, JSON.stringify(end), req.usuario.id]);

  let aviso = null;
  if (metodo === "pix") {
    try {
      pedido = await gerarPix(pedido);
    } catch (e) {
      console.error("[pix] erro ao gerar:", e.message);
      aviso = "Não conseguimos gerar o PIX agora. Tente de novo na página do pedido.";
    }
  }
  enviar({ to: pedido.cliente_email, ...templates.pedidoRecebido(pedido) });
  if (metodo === "whatsapp") enviar({ to: config.emailAdmin, ...templates.adminPedidoManual(pedido) });

  res.json({ pedido: P.publico(pedido), aviso, whatsapp: metodo === "whatsapp" ? config.whatsappPhone : undefined, carteira: metodo === "cripto" ? config.cryptoWallet : undefined });
}));

r.post("/api/conta/pedidos/:codigo/pix", exigirCliente, rota(async (req, res) => {
  let p = await pedidoDoCliente(req);
  if (!p) return res.status(404).json({ erro: "Pedido não encontrado." });
  if (p.status !== "aguardando_pagamento" || p.metodo !== "pix") return res.status(400).json({ erro: "Este pedido não está aguardando PIX." });
  try {
    p = await gerarPix(p);
  } catch (e) {
    console.error("[pix] erro ao gerar:", e.message);
    return res.status(502).json({ erro: "Não foi possível gerar o PIX agora. Tente em instantes." });
  }
  res.json(P.publico(p));
}));

r.post("/api/conta/pedidos/:codigo/cripto", exigirCliente, rota(async (req, res) => {
  const p = await pedidoDoCliente(req);
  if (!p || p.metodo !== "cripto" || p.status !== "aguardando_pagamento") return res.status(400).json({ erro: "Pedido inválido." });
  const tx = texto(req.body.tx, 120);
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return res.status(400).json({ erro: "Cole o hash da transação (começa com 0x)." });
  const { rows } = await q(`UPDATE pedidos SET cripto_tx=$2, atualizado_em=NOW() WHERE id=$1 RETURNING *`, [p.id, tx]);
  await P.registrarEvento(p.id, p.status, "Cliente informou o hash da transação", "cliente");
  enviar({ to: config.emailAdmin, ...templates.adminPedidoManual(rows[0]) });
  res.json(P.publico(rows[0]));
}));

r.get("/api/carteira-cripto", exigirCliente, (req, res) => res.json({ carteira: config.cryptoWallet || null, rede: config.cryptoNetwork }));

// Rastreio público: código do pedido + e-mail da compra
r.get("/api/rastrear", limitar({ janelaMs: 15 * 60 * 1000, max: 40 }), rota(async (req, res) => {
  const codigo = texto(req.query.codigo, 20).toUpperCase();
  const email = texto(req.query.email, 160).toLowerCase();
  const { rows } = await q(`SELECT * FROM pedidos WHERE codigo=$1 AND lower(cliente_email)=$2`, [codigo, email]);
  if (!rows[0]) return res.status(404).json({ erro: "Não encontramos um pedido com esse código e e-mail." });
  const { rows: ev } = await q(`SELECT * FROM pedido_eventos WHERE pedido_id=$1 ORDER BY criado_em`, [rows[0].id]);
  const pub = P.publico(rows[0], ev);
  delete pub.endereco; delete pub.pix_copia_cola; delete pub.pix_qr;
  res.json(pub);
}));

// ===================== WEBHOOKS =====================
async function processarWebhook(provedor, req, res) {
  const w = provedor.lerWebhook(req);
  if (!w) return res.status(401).json({ erro: "assinatura inválida" });
  res.json({ recebido: true });
  if (w.evento !== "pago" || !w.referencia) return;
  try {
    const { rows } = await q(`SELECT * FROM pedidos WHERE codigo=$1`, [w.referencia]);
    const p = rows[0];
    if (!p) return console.error("[webhook] pedido não encontrado:", w.referencia);
    if (p.status !== "aguardando_pagamento" && p.status !== "cancelado") return; // já processado
    if (w.valor && Math.abs(w.valor - Number(p.total)) > 0.05) {
      await P.registrarEvento(p.id, p.status, `Valor recebido (R$ ${w.valor}) diferente do total. Conferir.`);
      return console.error("[webhook] valor divergente", w.referencia, w.valor, p.total);
    }
    await P.mudarStatus(p.id, "pago", { autor: provedor.nome, nota: `Pagamento PIX confirmado (${provedor.nome})`, pagamentoId: w.pagamentoId });
  } catch (e) {
    console.error("[webhook] erro:", e.message);
  }
}
r.post("/webhook/pixgo", (req, res) => processarWebhook(provedores.pixgo, req, res));
r.post("/webhook/braspay", (req, res) => processarWebhook(provedores.braspay, req, res));

module.exports = r;
