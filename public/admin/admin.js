// Painel administrativo VARG
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var brl = function (v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); };
  var data = function (d, hora) { if (!d) return "—"; var o = { day: "2-digit", month: "2-digit", year: "2-digit" }; if (hora !== false) { o.hour = "2-digit"; o.minute = "2-digit"; } return new Date(d).toLocaleString("pt-BR", o); };
  var STATUS = { aguardando_pagamento: "Aguardando pagamento", pago: "Pago", em_separacao: "Em separação", enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado" };
  var METODO = { pix: "PIX", cripto: "Cripto", whatsapp: "WhatsApp" };
  var badge = function (s) { return '<span class="status st-' + s + '">' + STATUS[s] + "</span>"; };
  var TOKEN_KEY = "varg_admin_token";

  // ---------- API ----------
  function api(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem(TOKEN_KEY) || "") },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && url !== "/api/admin/login") { localStorage.removeItem(TOKEN_KEY); mostrarLogin(); throw new Error("Sessão expirada"); }
        if (!r.ok) throw new Error(d.erro || "Erro");
        return d;
      });
    });
  }

  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function load(btn, on) { if (!btn) return; if (on) { btn.dataset.t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; } else { btn.disabled = false; btn.innerHTML = btn.dataset.t; } }

  // ---------- Login ----------
  function mostrarLogin() { $("app").classList.add("hidden"); $("telaLogin").classList.remove("hidden"); }
  $("formLogin").onsubmit = function (e) {
    e.preventDefault();
    var b = $("btnLogin"); load(b, true);
    api("/api/admin/login", { body: { email: $("admEmail").value, senha: $("admSenha").value } })
      .then(function (d) { localStorage.setItem(TOKEN_KEY, d.token); $("telaLogin").classList.add("hidden"); iniciar(); })
      .catch(function (err) { $("msgLogin").innerHTML = '<div class="alert alert-error">' + esc(err.message) + "</div>"; })
      .finally(function () { load(b, false); });
  };

  // ---------- Roteamento ----------
  var rotas = {};
  function rota() {
    var h = location.hash.replace("#", "") || "painel";
    var partes = h.split("/");
    var r = rotas[partes[0]] ? partes[0] : "painel";
    document.querySelectorAll("#menu a").forEach(function (a) { a.classList.toggle("active", a.dataset.r === r); });
    $("side").classList.remove("open");
    $("topAcoes").innerHTML = "";
    $("view").innerHTML = '<div class="skeleton" style="height:240px"></div>';
    rotas[r](partes[1]);
  }
  function titulo(t) { $("titulo").textContent = t; document.title = t + " — Admin VARG"; }

  function iniciar() {
    $("app").classList.remove("hidden");
    window.addEventListener("hashchange", rota);
    rota();
    atualizarPill();
    setInterval(atualizarPill, 60000);
  }
  function atualizarPill() {
    api("/api/admin/pedidos?status=pago").then(function (d) { $("pillPend").textContent = d.total || ""; }).catch(function () {});
  }

  // ========== PAINEL ==========
  rotas.painel = function () {
    titulo("Painel");
    api("/api/admin/resumo").then(function (d) {
      var max = Math.max.apply(null, d.serie.map(function (s) { return s.v; }).concat([1]));
      var ps = d.por_status;
      var aguardando = (ps.pago || 0) + (ps.em_separacao || 0);
      $("view").innerHTML =
        '<div class="kpis">' +
        '<div class="kpi"><span>Vendas hoje</span><b>' + brl(d.hoje.v) + "</b><small>" + d.hoje.n + " pedido(s)</small></div>" +
        '<div class="kpi"><span>Vendas no mês</span><b>' + brl(d.mes.v) + "</b><small>" + d.mes.n + " pedido(s)</small></div>" +
        '<div class="kpi"><span>Ticket médio</span><b>' + brl(d.ticket_medio) + "</b><small>" + d.total.n + " pedidos pagos no total</small></div>" +
        '<div class="kpi"><span>Para enviar</span><b>' + aguardando + '</b><small><a href="#pedidos/pago" style="text-decoration:underline">ver pedidos pagos</a></small></div>' +
        "</div>" +
        '<div class="cols"><div>' +
        '<div class="card-a"><h3>Faturamento — últimos 30 dias</h3><div class="chart">' +
        d.serie.map(function (s) { return '<div class="b" style="height:' + Math.max(1, (s.v / max) * 100) + '%" data-tip="' + s.dia.slice(8) + "/" + s.dia.slice(5, 7) + " · " + brl(s.v) + " · " + s.n + ' ped."></div>'; }).join("") +
        '</div><div class="chart-axis"><span>' + d.serie[0].dia.slice(8) + "/" + d.serie[0].dia.slice(5, 7) + "</span><span>hoje</span></div></div>" +
        '<div class="card-a"><h3>Últimos pedidos</h3><div class="table-wrap" style="border:0"><table class="t"><tbody>' +
        (d.recentes.length ? d.recentes.map(function (p) { return '<tr class="click" onclick="Adm.abrirPedido(' + p.id + ')"><td class="mono">' + esc(p.codigo) + "</td><td>" + esc(p.cliente_nome) + "</td><td>" + badge(p.status) + '</td><td class="num">' + brl(p.total) + "</td></tr>"; }).join("") : '<tr><td class="muted">Nenhum pedido ainda.</td></tr>') +
        "</tbody></table></div></div>" +
        "</div><div>" +
        '<div class="card-a"><h3>Pedidos por status</h3><div class="status-bars">' + Object.keys(STATUS).map(function (s) { return '<div><a href="#pedidos/' + s + '">' + badge(s) + "</a><b>" + (ps[s] || 0) + "</b></div>"; }).join("") + "</div></div>" +
        '<div class="card-a"><h3>Mais vendidos</h3>' + (d.top.length ? '<div class="status-bars">' + d.top.map(function (t) { return "<div><span>" + esc(t.nome) + '</span><span class="muted">' + t.qtd + " un · " + brl(t.receita) + "</span></div>"; }).join("") + "</div>" : '<p class="muted">Sem vendas ainda.</p>') + "</div>" +
        (d.estoque_baixo.length ? '<div class="card-a"><h3>Estoque baixo</h3><div class="status-bars">' + d.estoque_baixo.map(function (e) { return "<div><span>" + esc(e.nome || e.produto_id) + (e.variacao !== "unico" ? " · " + esc(e.variacao) : "") + '</span><b class="' + (e.quantidade === 0 ? "zero" : "lowstock") + '">' + e.quantidade + "</b></div>"; }).join("") + '</div><p style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#estoque">Repor estoque</a></p></div>' : "") +
        "</div></div>";
    }).catch(function (e) { $("view").innerHTML = '<div class="alert alert-error">' + esc(e.message) + "</div>"; });
  };

  // ========== PEDIDOS ==========
  var filtro = { status: "", q: "", pagina: 1, metodo: "" };
  rotas.pedidos = function (arg) {
    titulo("Pedidos");
    if (arg && STATUS[arg]) filtro.status = arg;
    if (arg && /^\d+$/.test(arg)) setTimeout(function () { Adm.abrirPedido(+arg); }, 0);
    $("topAcoes").innerHTML = '<button class="btn btn-ghost btn-sm" id="btnCsv">Exportar CSV</button>';
    $("btnCsv").onclick = exportarCsv;
    $("view").innerHTML =
      '<div class="toolbar"><input class="input grow" id="busca" placeholder="Buscar por código, nome, e-mail ou rastreio" value="' + esc(filtro.q) + '">' +
      '<select class="input" id="fMetodo"><option value="">Todos os pagamentos</option><option value="pix">PIX</option><option value="cripto">Cripto</option><option value="whatsapp">WhatsApp</option></select></div>' +
      '<div class="toolbar"><div class="seg" id="segStatus"><button data-s="">Todos</button>' + Object.keys(STATUS).map(function (s) { return '<button data-s="' + s + '">' + STATUS[s] + "</button>"; }).join("") + "</div></div>" +
      '<div id="lista"></div>';
    $("fMetodo").value = filtro.metodo;
    var tmr;
    $("busca").oninput = function () { clearTimeout(tmr); var v = this.value; tmr = setTimeout(function () { filtro.q = v; filtro.pagina = 1; listar(); }, 300); };
    $("fMetodo").onchange = function () { filtro.metodo = this.value; filtro.pagina = 1; listar(); };
    document.querySelectorAll("#segStatus button").forEach(function (b) { b.onclick = function () { filtro.status = b.dataset.s; filtro.pagina = 1; listar(); }; });
    listar();
  };
  function qsFiltro() { return "status=" + filtro.status + "&metodo=" + filtro.metodo + "&q=" + encodeURIComponent(filtro.q); }
  function listar() {
    document.querySelectorAll("#segStatus button").forEach(function (b) { b.classList.toggle("active", b.dataset.s === filtro.status); });
    api("/api/admin/pedidos?" + qsFiltro() + "&pagina=" + filtro.pagina).then(function (d) {
      if (!$("lista")) return;
      $("lista").innerHTML = '<div class="table-wrap"><table class="t"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>' +
        (d.pedidos.length ? d.pedidos.map(function (p) {
          var itens = p.itens.map(function (i) { return i.quantidade + "× " + i.nome + (i.tamanho ? " " + i.tamanho : ""); }).join(", ");
          return '<tr class="click" onclick="Adm.abrirPedido(' + p.id + ')"><td class="mono">' + esc(p.codigo) + "</td><td>" + data(p.criado_em) + "</td><td>" + esc(p.cliente_nome) + '<div class="dim" style="font-size:.8rem">' + esc(p.cliente_email) + '</div></td><td style="max-width:260px;font-size:.85rem" class="muted">' + esc(itens) + "</td><td>" + METODO[p.metodo] + "</td><td>" + badge(p.status) + (p.codigo_rastreio ? '<div class="dim mono" style="font-size:.75rem;margin-top:4px">' + esc(p.codigo_rastreio) + "</div>" : "") + '</td><td class="num"><b>' + brl(p.total) + "</b></td></tr>";
        }).join("") : '<tr><td colspan="7" class="muted" style="text-align:center;padding:40px">Nenhum pedido encontrado.</td></tr>') +
        "</tbody></table></div>" +
        '<div class="pager"><span>' + d.total + " pedido(s)</span><div>" +
        '<button class="btn btn-ghost btn-sm" ' + (d.pagina <= 1 ? "disabled" : "") + ' onclick="Adm.pagina(-1)">‹ Anterior</button><span style="align-self:center">' + d.pagina + " / " + d.paginas + '</span><button class="btn btn-ghost btn-sm" ' + (d.pagina >= d.paginas ? "disabled" : "") + ' onclick="Adm.pagina(1)">Próxima ›</button></div></div>';
    }).catch(function (e) { toast(e.message); });
  }
  function exportarCsv() {
    fetch("/api/admin/pedidos.csv?" + qsFiltro(), { headers: { Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY) } })
      .then(function (r) { if (!r.ok) throw new Error("Falha ao exportar"); return r.blob(); })
      .then(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "pedidos-varg.csv"; a.click(); })
      .catch(function (e) { toast(e.message); });
  }

  // ---------- Detalhe do pedido ----------
  var PROXIMO = { aguardando_pagamento: "pago", pago: "em_separacao", em_separacao: "enviado", enviado: "entregue" };
  var ROTULO_ACAO = { pago: "Confirmar pagamento", em_separacao: "Iniciar separação", enviado: "Marcar como enviado", entregue: "Marcar como entregue" };

  function abrirPedido(id) {
    $("det").classList.add("open");
    $("detPanel").innerHTML = '<div style="padding:22px"><div class="skeleton" style="height:300px"></div></div>';
    api("/api/admin/pedidos/" + id).then(renderPedido).catch(function (e) { toast(e.message); fecharDet(); });
  }
  function fecharDet() { $("det").classList.remove("open"); }

  function renderPedido(p) {
    var e = p.endereco || {};
    var prox = PROXIMO[p.status];
    var endTxt = e.rua + ", " + e.numero + (e.complemento ? " — " + e.complemento : "") + "\n" + e.bairro + " — " + e.cidade + "/" + e.estado + "\nCEP " + String(e.cep || "").replace(/(\d{5})(\d{3})/, "$1-$2");
    var etiqueta = p.cliente_nome + "\n" + endTxt + "\nTel: " + (p.cliente_telefone || "");
    $("detPanel").innerHTML =
      '<div class="drawer-head"><div><h2 class="mono" style="font-family:var(--head)">' + esc(p.codigo) + '</h2><div class="dim" style="font-size:.85rem">' + data(p.criado_em) + " · " + METODO[p.metodo] + '</div></div><button class="icon-btn" onclick="Adm.fecharDet()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="20"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="sec" style="display:flex;justify-content:space-between;align-items:center;gap:10px">' + badge(p.status) + '<b style="font-family:var(--head);font-size:1.5rem">' + brl(p.total) + "</b></div>" +

      '<div class="sec"><h4>Atualizar pedido</h4>' +
      (prox === "enviado" || p.status === "enviado" ? '<div class="row row-2"><div class="field"><label>Transportadora</label><input class="input" id="dTransp" value="' + esc(p.transportadora || "Correios") + '"></div><div class="field"><label>Código de rastreio</label><input class="input" id="dRastreio" style="text-transform:uppercase" value="' + esc(p.codigo_rastreio || "") + '"></div></div>' : "") +
      '<div class="field"><label>Nota no histórico (opcional, o cliente vê)</label><input class="input" id="dNota" placeholder="Ex.: postado na agência central"></div>' +
      '<label class="check" style="margin-bottom:14px"><input type="checkbox" id="dNotificar" checked> Enviar e-mail ao cliente</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (prox ? '<button class="btn btn-primary" id="btnAvancar">' + ROTULO_ACAO[prox] + "</button>" : "") +
      (p.status === "enviado" ? '<button class="btn btn-ghost" id="btnSalvarRastreio">Salvar rastreio</button>' : "") +
      '<select class="input" id="dStatus" style="width:auto;height:46px"><option value="">Outro status…</option>' + Object.keys(STATUS).filter(function (s) { return s !== p.status; }).map(function (s) { return '<option value="' + s + '">' + STATUS[s] + "</option>"; }).join("") + "</select>" +
      "</div></div>" +

      '<div class="sec"><h4>Itens</h4>' + p.itens.map(function (i) {
        return '<div style="display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:6px 0"><img class="thumb" src="' + esc(i.imagem) + '" alt=""><div><b style="font-weight:600">' + i.quantidade + "× " + esc(i.nome) + "</b>" + (i.tamanho ? '<div class="dim" style="font-size:.82rem">Tamanho ' + esc(i.tamanho) + "</div>" : "") + "</div><span>" + brl(i.preco * i.quantidade) + "</span></div>";
      }).join("") +
      '<div style="display:grid;gap:4px;margin-top:10px;font-size:.92rem"><div class="sum-row"><span>Subtotal</span><span>' + brl(p.subtotal) + "</span></div>" + (Number(p.desconto) > 0 ? '<div class="sum-row"><span>Desconto (' + esc(p.cupom) + ")</span><span>− " + brl(p.desconto) + "</span></div>" : "") + '<div class="sum-row"><span>Frete</span><span>' + brl(p.frete) + "</span></div></div></div>" +

      '<div class="sec"><h4>Cliente e entrega <button class="link-btn" style="float:right" id="btnEtiqueta">copiar etiqueta</button></h4><div class="kv">' +
      "<span>Nome</span><span>" + esc(p.cliente_nome) + "</span>" +
      '<span>E-mail</span><span><a href="mailto:' + esc(p.cliente_email) + '" style="text-decoration:underline">' + esc(p.cliente_email) + "</a></span>" +
      '<span>WhatsApp</span><span>' + (p.cliente_telefone ? '<a target="_blank" rel="noopener" style="text-decoration:underline" href="https://wa.me/55' + esc(p.cliente_telefone) + '">' + esc(p.cliente_telefone) + "</a>" : "—") + "</span>" +
      "<span>CPF</span><span>" + esc(p.cliente_cpf || "—") + "</span>" +
      '<span>Endereço</span><span style="white-space:pre-line">' + esc(endTxt) + "</span>" +
      "</div></div>" +

      '<div class="sec"><h4>Pagamento</h4><div class="kv"><span>Forma</span><span>' + METODO[p.metodo] + "</span>" +
      (p.pagamento_id ? '<span>ID</span><span class="mono" style="word-break:break-all">' + esc(p.pagamento_id) + "</span>" : "") +
      (p.cripto_tx ? '<span>Hash</span><span class="mono" style="word-break:break-all">' + esc(p.cripto_tx) + "</span>" : "") +
      "<span>Pago em</span><span>" + data(p.pago_em) + "</span>" +
      (p.cupom ? "<span>Cupom</span><span>" + esc(p.cupom) + "</span>" : "") +
      "</div></div>" +

      '<div class="sec"><h4>Observação interna (só você vê)</h4><textarea class="input" id="dObs" rows="3">' + esc(p.observacao_admin || "") + '</textarea><div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-ghost btn-sm" id="btnObs">Salvar observação</button><button class="btn btn-ghost btn-sm" id="btnReenviar">Reenviar e-mail do status</button></div></div>' +

      '<div class="sec" style="border:0"><h4>Histórico</h4><ul class="timeline">' + p.eventos.map(function (ev) {
        return "<li><b>" + STATUS[ev.status] + "</b>" + (ev.nota ? '<div class="muted" style="font-size:.9rem">' + esc(ev.nota) + "</div>" : "") + "<small>" + data(ev.criado_em) + " · " + esc(ev.autor) + "</small></li>";
      }).join("") + "</ul></div>";

    function mudar(status, btn) {
      var body = { status: status, nota: $("dNota").value, notificar: $("dNotificar").checked };
      if ($("dRastreio")) { body.codigo_rastreio = $("dRastreio").value; body.transportadora = $("dTransp").value; }
      if (status === "cancelado" && !confirm("Cancelar o pedido " + p.codigo + "? Se o estoque já tinha sido baixado, ele volta.")) { $("dStatus").value = ""; return; }
      load(btn, true);
      api("/api/admin/pedidos/" + p.id + "/status", { body: body }).then(function () {
        toast("Pedido atualizado");
        abrirPedido(p.id);
        if (location.hash.indexOf("#pedidos") === 0 && $("lista")) listar();
        atualizarPill();
      }).catch(function (e) { toast(e.message); load(btn, false); });
    }
    if ($("btnAvancar")) $("btnAvancar").onclick = function () { mudar(prox, this); };
    if ($("btnSalvarRastreio")) $("btnSalvarRastreio").onclick = function () { mudar("enviado", this); };
    $("dStatus").onchange = function () { if (this.value) mudar(this.value, null); };
    $("btnObs").onclick = function () { var b = this; load(b, true); api("/api/admin/pedidos/" + p.id + "/observacao", { body: { observacao: $("dObs").value } }).then(function () { toast("Observação salva"); }).catch(function (e) { toast(e.message); }).finally(function () { load(b, false); }); };
    $("btnReenviar").onclick = function () { var b = this; load(b, true); api("/api/admin/pedidos/" + p.id + "/reenviar-email", { body: {} }).then(function () { toast("E-mail reenviado"); }).catch(function (e) { toast(e.message); }).finally(function () { load(b, false); }); };
    $("btnEtiqueta").onclick = function () { navigator.clipboard.writeText(etiqueta).then(function () { toast("Endereço copiado"); }); };
  }

  // ========== PRODUTOS ==========
  var imagensDisp = [];
  rotas.produtos = function () {
    titulo("Produtos");
    $("topAcoes").innerHTML = '<button class="btn btn-primary btn-sm" onclick="Adm.editarProduto()">+ Novo produto</button>';
    Promise.all([api("/api/admin/produtos"), api("/api/admin/imagens")]).then(function (r) {
      var lista = r[0]; imagensDisp = r[1]; Adm._produtos = lista;
      $("view").innerHTML = '<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Tamanhos</th><th class="num">Preço</th><th>Estoque</th><th>Status</th></tr></thead><tbody>' +
        lista.map(function (p) {
          var tot = p.estoque.length ? p.estoque.reduce(function (s, e) { return s + e.quantidade; }, 0) + " un" : '<span class="dim">sem controle</span>';
          return '<tr class="click" onclick="Adm.editarProduto(\'' + esc(p.id) + '\')"><td><img class="thumb" src="' + esc(p.imagens[0] || "") + '" alt=""></td><td><b style="font-weight:600">' + esc(p.nome) + '</b><div class="dim mono" style="font-size:.75rem">' + esc(p.id) + "</div></td><td>" + esc(p.categoria) + '</td><td class="muted" style="font-size:.85rem">' + (p.tamanhos.join(", ") || "—") + '</td><td class="num">' + brl(p.preco) + (p.preco_antes ? '<div class="strike" style="font-size:.8rem">' + brl(p.preco_antes) + "</div>" : "") + "</td><td>" + tot + "</td><td>" + (p.ativo ? '<span class="status st-pago">Ativo</span>' : '<span class="status st-entregue">Oculto</span>') + (p.destaque ? ' <span class="status st-em_separacao">Destaque</span>' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }).catch(function (e) { toast(e.message); });
  };

  function abrirModal(html) { $("modalBox").innerHTML = html; $("modal").classList.add("open"); }
  function fecharModal() { $("modal").classList.remove("open"); }
  $("modal").addEventListener("click", function (e) { if (e.target === this) fecharModal(); });

  function editarProduto(id) {
    var p = id ? Adm._produtos.find(function (x) { return x.id === id; }) : { nome: "", descricao: "", categoria: "camiseta", preco: "", preco_antes: "", imagens: [], tamanhos: [], ativo: true, destaque: false, ordem: 50 };
    var sel = p.imagens.slice();
    function pick() {
      return imagensDisp.map(function (src) { return '<button type="button" class="' + (sel.indexOf(src) >= 0 ? "on" : "") + '" data-src="' + esc(src) + '"><img src="' + esc(src) + '" alt=""></button>'; }).join("");
    }
    abrirModal(
      "<h2>" + (id ? "Editar produto" : "Novo produto") + "</h2><div id=\"msgProd\"></div>" +
      '<div class="field"><label>Nome</label><input class="input" id="pNome" value="' + esc(p.nome) + '"></div>' +
      '<div class="row row-2"><div class="field"><label>Categoria</label><select class="input" id="pCat"><option value="camiseta">Camiseta / vestuário</option><option value="salt">Smelling salt</option><option value="acessorio">Acessório</option></select></div>' +
      '<div class="field"><label>Ordem na loja</label><input class="input" id="pOrdem" type="number" value="' + esc(p.ordem) + '"></div></div>' +
      '<div class="row row-2"><div class="field"><label>Preço de venda (R$)</label><input class="input" id="pPreco" type="number" step="0.01" min="0" value="' + esc(p.preco) + '"></div>' +
      '<div class="field"><label>Preço "de" riscado (opcional)</label><input class="input" id="pAntes" type="number" step="0.01" min="0" value="' + esc(p.preco_antes || "") + '"></div></div>' +
      '<div class="field"><label>Tamanhos (separados por vírgula; vazio = tamanho único)</label><input class="input" id="pTam" value="' + esc(p.tamanhos.join(", ")) + '" placeholder="P, M, G, GG"></div>' +
      '<div class="field"><label>Descrição</label><textarea class="input" id="pDesc" rows="4">' + esc(p.descricao) + "</textarea></div>" +
      '<div class="field"><label>Imagens (clique para escolher; a primeira é a capa)</label><div class="img-pick" id="pImgs">' + pick() + '</div><input class="input" id="pImgUrl" style="margin-top:8px" placeholder="…ou cole o endereço de uma imagem (https://...) e pressione Enter"></div>' +
      '<div style="display:flex;gap:18px;margin:6px 0 18px"><label class="check"><input type="checkbox" id="pAtivo" ' + (p.ativo ? "checked" : "") + '> Visível na loja</label><label class="check"><input type="checkbox" id="pDest" ' + (p.destaque ? "checked" : "") + "> Destaque</label></div>" +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-ghost" onclick="Adm.fecharModal()">Cancelar</button><button class="btn btn-primary" id="btnSalvarProd">Salvar</button></div>'
    );
    $("pCat").value = p.categoria;
    function bindPick() {
      document.querySelectorAll("#pImgs button").forEach(function (b) {
        b.onclick = function () {
          var s = b.dataset.src, i = sel.indexOf(s);
          if (i >= 0) sel.splice(i, 1); else sel.push(s);
          $("pImgs").innerHTML = pick(); bindPick();
        };
      });
    }
    bindPick();
    $("pImgUrl").onkeydown = function (e) {
      if (e.key !== "Enter") return; e.preventDefault();
      var v = this.value.trim(); if (!/^https?:\/\//.test(v)) return toast("Use um endereço começando com https://");
      if (imagensDisp.indexOf(v) < 0) imagensDisp.push(v); if (sel.indexOf(v) < 0) sel.push(v);
      this.value = ""; $("pImgs").innerHTML = pick(); bindPick();
    };
    $("btnSalvarProd").onclick = function () {
      var b = this; load(b, true);
      var body = { nome: $("pNome").value, categoria: $("pCat").value, ordem: $("pOrdem").value, preco: $("pPreco").value, preco_antes: $("pAntes").value, tamanhos: $("pTam").value, descricao: $("pDesc").value, imagens: sel, ativo: $("pAtivo").checked, destaque: $("pDest").checked };
      api(id ? "/api/admin/produtos/" + encodeURIComponent(id) : "/api/admin/produtos", { method: id ? "PUT" : "POST", body: body })
        .then(function () { fecharModal(); toast("Produto salvo"); rotas.produtos(); })
        .catch(function (e) { $("msgProd").innerHTML = '<div class="alert alert-error">' + esc(e.message) + "</div>"; load(b, false); });
    };
  }

  // ========== ESTOQUE ==========
  rotas.estoque = function () {
    titulo("Estoque");
    api("/api/admin/produtos").then(function (lista) {
      var linhas = [];
      lista.forEach(function (p) {
        var vars = p.tamanhos.length ? p.tamanhos : ["unico"];
        vars.forEach(function (v) {
          var e = p.estoque.find(function (x) { return x.variacao === v; });
          linhas.push({ p: p, v: v, e: e });
        });
      });
      $("view").innerHTML =
        '<div class="alert alert-info">Sem controle = venda liberada sem limite. Com controle, o estoque baixa sozinho quando o pagamento é confirmado e volta se o pedido for cancelado. Ao repor um item zerado, quem está na lista de espera recebe e-mail.</div>' +
        '<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Produto</th><th>Variação</th><th>Controle</th><th>Quantidade</th><th>Alerta abaixo de</th><th></th></tr></thead><tbody>' +
        linhas.map(function (l, i) {
          var q = l.e ? l.e.quantidade : "", a = l.e ? l.e.alerta_minimo : 3;
          var cls = l.e ? (l.e.quantidade === 0 ? "zero" : l.e.quantidade <= l.e.alerta_minimo ? "lowstock" : "") : "";
          return '<tr data-i="' + i + '"><td><img class="thumb" src="' + esc(l.p.imagens[0] || "") + '" alt=""></td><td>' + esc(l.p.nome) + "</td><td><b>" + (l.v === "unico" ? "Único" : esc(l.v)) + "</b></td>" +
            '<td><label class="check"><input type="checkbox" class="ctl" ' + (l.e ? "checked" : "") + "> controlar</label></td>" +
            '<td><input class="input stock-in qtd ' + cls + '" type="number" min="0" value="' + q + '" ' + (l.e ? "" : "disabled") + "></td>" +
            '<td><input class="input stock-in al" type="number" min="0" value="' + a + '" ' + (l.e ? "" : "disabled") + "></td>" +
            '<td><button class="btn btn-ghost btn-sm salvar">Salvar</button></td></tr>';
        }).join("") + "</tbody></table></div>";
      document.querySelectorAll("tr[data-i]").forEach(function (tr) {
        var l = linhas[+tr.dataset.i];
        var ctl = tr.querySelector(".ctl"), qtd = tr.querySelector(".qtd"), al = tr.querySelector(".al");
        ctl.onchange = function () { qtd.disabled = al.disabled = !ctl.checked; if (ctl.checked && qtd.value === "") qtd.value = 0; };
        tr.querySelector(".salvar").onclick = function () {
          var b = this; load(b, true);
          api("/api/admin/estoque", { body: { produto_id: l.p.id, variacao: l.v, controlar: ctl.checked, quantidade: qtd.value, alerta_minimo: al.value } })
            .then(function (d) { toast(d.avisados ? "Salvo · " + d.avisados + " pessoa(s) avisada(s)" : "Estoque salvo"); })
            .catch(function (e) { toast(e.message); })
            .finally(function () { load(b, false); });
        };
      });
    }).catch(function (e) { toast(e.message); });
  };

  // ========== CUPONS ==========
  rotas.cupons = function () {
    titulo("Cupons");
    $("topAcoes").innerHTML = '<button class="btn btn-primary btn-sm" onclick="Adm.novoCupom()">+ Novo cupom</button>';
    api("/api/admin/cupons").then(function (lista) {
      $("view").innerHTML = '<div class="table-wrap"><table class="t"><thead><tr><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Usos</th><th>Validade</th><th>Status</th><th></th></tr></thead><tbody>' +
        (lista.length ? lista.map(function (c) {
          return '<tr><td class="mono"><b>' + esc(c.codigo) + "</b></td><td>" + (c.tipo === "fixo" ? brl(c.valor) : Number(c.valor) + "%") + "</td><td>" + (Number(c.minimo) > 0 ? brl(c.minimo) : "—") + "</td><td>" + c.usos + (c.limite_usos ? " / " + c.limite_usos : "") + "</td><td>" + (c.validade ? data(c.validade, false) : "—") + "</td><td>" + (c.ativo ? '<span class="status st-pago">Ativo</span>' : '<span class="status st-entregue">Pausado</span>') + '</td><td class="num"><button class="btn btn-ghost btn-sm" onclick="Adm.alternarCupom(' + c.id + ')">' + (c.ativo ? "Pausar" : "Ativar") + "</button></td></tr>";
        }).join("") : '<tr><td colspan="7" class="muted" style="text-align:center;padding:40px">Nenhum cupom criado.</td></tr>') + "</tbody></table></div>";
    }).catch(function (e) { toast(e.message); });
  };
  function novoCupom() {
    abrirModal('<h2>Novo cupom</h2><div id="msgCup"></div>' +
      '<div class="field"><label>Código</label><input class="input" id="cCod" style="text-transform:uppercase" placeholder="MATILHA10"></div>' +
      '<div class="row row-2"><div class="field"><label>Tipo</label><select class="input" id="cTipo"><option value="percentual">Percentual (%)</option><option value="fixo">Valor fixo (R$)</option></select></div><div class="field"><label>Desconto</label><input class="input" id="cVal" type="number" step="0.01" value="10"></div></div>' +
      '<div class="row row-2"><div class="field"><label>Compra mínima (R$, opcional)</label><input class="input" id="cMin" type="number" step="0.01"></div><div class="field"><label>Limite de usos (opcional)</label><input class="input" id="cLim" type="number"></div></div>' +
      '<div class="field"><label>Válido até (opcional)</label><input class="input" id="cVal2" type="date"></div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-ghost" onclick="Adm.fecharModal()">Cancelar</button><button class="btn btn-primary" id="btnCup">Criar cupom</button></div>');
    $("btnCup").onclick = function () {
      var b = this; load(b, true);
      api("/api/admin/cupons", { body: { codigo: $("cCod").value, tipo: $("cTipo").value, valor: $("cVal").value, minimo: $("cMin").value, limite_usos: $("cLim").value, validade: $("cVal2").value } })
        .then(function () { fecharModal(); toast("Cupom criado"); rotas.cupons(); })
        .catch(function (e) { $("msgCup").innerHTML = '<div class="alert alert-error">' + esc(e.message) + "</div>"; load(b, false); });
    };
  }

  // ========== CLIENTES ==========
  rotas.clientes = function () {
    titulo("Clientes");
    $("view").innerHTML = '<div class="toolbar"><input class="input grow" id="buscaCli" placeholder="Buscar por nome ou e-mail"></div><div id="listaCli"></div>';
    var tmr;
    function carregar() {
      api("/api/admin/clientes?q=" + encodeURIComponent($("buscaCli").value)).then(function (l) {
        $("listaCli").innerHTML = '<div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Cadastro</th><th class="num">Pedidos pagos</th><th class="num">Total gasto</th><th>Último pedido</th></tr></thead><tbody>' +
          (l.length ? l.map(function (c) {
            return "<tr><td><b style=\"font-weight:600\">" + esc(c.nome) + '</b><div class="dim" style="font-size:.8rem">' + esc(c.email) + "</div></td><td>" + (c.telefone ? '<a target="_blank" rel="noopener" style="text-decoration:underline" href="https://wa.me/55' + esc(c.telefone) + '">' + esc(c.telefone) + "</a>" : "—") + "</td><td>" + data(c.criado_em, false) + '</td><td class="num">' + c.pedidos + '</td><td class="num">' + brl(c.gasto) + "</td><td>" + data(c.ultimo_pedido, false) + "</td></tr>";
          }).join("") : '<tr><td colspan="6" class="muted" style="text-align:center;padding:40px">Nenhum cliente.</td></tr>') + "</tbody></table></div>";
      }).catch(function (e) { toast(e.message); });
    }
    $("buscaCli").oninput = function () { clearTimeout(tmr); tmr = setTimeout(carregar, 300); };
    carregar();
  };

  // ========== LISTA DE ESPERA ==========
  rotas.espera = function () {
    titulo("Lista de espera");
    api("/api/admin/lista-espera").then(function (l) {
      $("view").innerHTML = '<p class="muted" style="margin-bottom:14px">Quando você repõe um item que estava zerado na tela de Estoque, todos que aguardam esse item recebem um e-mail automático.</p>' +
        '<div class="table-wrap"><table class="t"><thead><tr><th>Produto</th><th>Variação</th><th>Nome</th><th>E-mail</th><th>Pediu em</th><th>Avisado</th></tr></thead><tbody>' +
        (l.length ? l.map(function (x) {
          return "<tr><td>" + esc(x.produto_nome || x.produto_id) + "</td><td>" + (x.variacao === "unico" ? "Único" : esc(x.variacao)) + "</td><td>" + esc(x.nome || "—") + "</td><td>" + esc(x.email) + "</td><td>" + data(x.criado_em) + "</td><td>" + (x.avisado_em ? data(x.avisado_em) : '<span class="status st-aguardando_pagamento">Aguardando</span>') + "</td></tr>";
        }).join("") : '<tr><td colspan="6" class="muted" style="text-align:center;padding:40px">Ninguém na lista de espera.</td></tr>') + "</tbody></table></div>";
    }).catch(function (e) { toast(e.message); });
  };

  // ---------- Exposição global e início ----------
  window.Adm = {
    abrirPedido: abrirPedido, fecharDet: fecharDet, editarProduto: editarProduto, fecharModal: fecharModal, novoCupom: novoCupom,
    pagina: function (d) { filtro.pagina += d; listar(); },
    alternarCupom: function (id) { api("/api/admin/cupons/" + id + "/alternar", { body: {} }).then(function () { rotas.cupons(); }).catch(function (e) { toast(e.message); }); },
    sair: function () { localStorage.removeItem(TOKEN_KEY); location.hash = ""; mostrarLogin(); },
    _produtos: [],
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { fecharDet(); fecharModal(); } });

  if (localStorage.getItem(TOKEN_KEY)) iniciar(); else mostrarLogin();
})();
