// Card de produto + lista de espera (usado na home e na página de produto)
(function () {
  var V = VARG;
  var Vitrine = { produtos: [] };

  Vitrine.card = function (p) {
    var url = "/produto.html?id=" + encodeURIComponent(p.id);
    var pct = p.preco_antes ? Math.round((1 - p.preco / p.preco_antes) * 100) : 0;
    var tag = p.esgotado ? '<span class="tag dark">' + V.t("l.card.soldout") + "</span>" : pct > 0 ? '<span class="tag">−' + pct + "%</span>" : "";
    var cat = p.categoria === "salt" ? "Smelling Salt" : p.categoria === "camiseta" ? "VARG Wear" : V.esc(p.categoria);
    var acao;
    if (p.esgotado) acao = '<button class="btn btn-ghost btn-sm btn-block add" onclick="Vitrine.espera(\'' + p.id + "')\">" + V.t("l.card.notify") + "</button>";
    else if (p.tamanhos && p.tamanhos.length) acao = '<a class="btn btn-ghost btn-sm btn-block add" href="' + url + '">' + V.t("l.card.choose") + "</a>";
    else acao = '<button class="btn btn-primary btn-sm btn-block add" onclick="Vitrine.add(\'' + p.id + "')\">" + V.t("l.card.add") + "</button>";
    return '<article class="card"><a class="media" href="' + url + '"><img src="' + V.esc((p.imagens || [])[0] || "") + '" alt="' + V.esc(p.nome) + '" loading="lazy">' + tag + "</a>" +
      '<div class="body"><span class="cat">' + cat + '</span><a class="title" href="' + url + '">' + V.esc(p.nome) + "</a>" +
      '<div class="prices"><span class="price">' + V.brl(p.preco) + "</span>" + (p.preco_antes ? '<span class="strike">' + V.brl(p.preco_antes) + "</span>" : "") + "</div>" +
      acao + "</div></article>";
  };

  Vitrine.add = function (id) {
    var p = Vitrine.produtos.find(function (x) { return x.id === id; });
    if (p) V.Carrinho.adicionar(p, null, 1);
  };

  var espera = null;
  Vitrine.espera = function (id, variacao) {
    var p = Vitrine.produtos.find(function (x) { return x.id === id; });
    espera = { produto_id: id, variacao: variacao || "unico" };
    document.getElementById("esperaProduto").textContent = (p ? p.nome : "") + (variacao && variacao !== "unico" ? " — " + variacao : "");
    var u = V.Sessao.usuario();
    if (u) document.getElementById("esperaEmail").value = u.email;
    document.getElementById("modalEspera").classList.add("open");
  };
  window.fecharEspera = function () { document.getElementById("modalEspera").classList.remove("open"); };
  window.enviarEspera = function () {
    var btn = document.getElementById("btnEspera");
    V.carregando(btn, true);
    V.api("/api/lista-espera", { body: Object.assign({ email: document.getElementById("esperaEmail").value }, espera) })
      .then(function (d) { window.fecharEspera(); V.toast(d.mensagem); })
      .catch(function (e) { V.toast(e.message); })
      .finally(function () { V.carregando(btn, false); });
  };

  window.Vitrine = Vitrine;
})();
