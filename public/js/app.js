// VARG — script comum a todas as páginas da loja:
// header, footer, carrinho, sessão do cliente, API e utilidades.
(function () {
  "use strict";

  // ---------- Utilidades ----------
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var brl = function (v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); };
  var t = function (k, vars) {
    var s = (window.PEP_LANG && window.PEP_LANG.t(k)) || k;
    if (s === k) {
      var d = window.PEPMASTERS_I18N && window.PEPMASTERS_I18N[k];
      if (d) s = d[localStorage.getItem("varg_lang") || "pt"] || d.pt || k;
    }
    if (vars) Object.keys(vars).forEach(function (n) { s = s.replace("{" + n + "}", vars[n]); });
    return s;
  };
  var qs = function (sel, root) { return (root || document).querySelector(sel); };
  var param = function (n) { return new URLSearchParams(location.search).get(n); };

  var ICON = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.2 12.1a2 2 0 0 1-2 1.9H9.2a2 2 0 0 1-2-1.9L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.2 12.1a2 2 0 0 1-2 1.9H9.2a2 2 0 0 1-2-1.9L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  };

  // ---------- Sessão do cliente ----------
  var Sessao = {
    token: function () { return localStorage.getItem("varg_token"); },
    usuario: function () { try { return JSON.parse(localStorage.getItem("varg_usuario")); } catch (e) { return null; } },
    salvar: function (token, usuario) {
      localStorage.setItem("varg_token", token);
      localStorage.setItem("varg_usuario", JSON.stringify(usuario));
    },
    sair: function () {
      localStorage.removeItem("varg_token");
      localStorage.removeItem("varg_usuario");
      location.href = "/";
    },
    exigir: function () {
      if (!Sessao.token()) {
        location.href = "/login.html?voltar=" + encodeURIComponent(location.pathname + location.search);
        return false;
      }
      return true;
    },
  };
  // limpa sessão do site antigo
  ["usuarioNome", "usuarioEmail", "carrinho"].forEach(function (k) { localStorage.removeItem(k); });

  // ---------- API ----------
  function api(url, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (Sessao.token()) headers.Authorization = "Bearer " + Sessao.token();
    return fetch(url, { method: opts.method || (opts.body ? "POST" : "GET"), headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && Sessao.token() && url.indexOf("/api/auth/") !== 0) {
            localStorage.removeItem("varg_token");
            localStorage.removeItem("varg_usuario");
          }
          if (!r.ok) { var e = new Error(d.erro || "Erro inesperado. Tente novamente."); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  // ---------- Carrinho (só guarda id/tamanho/qtd; preço vem do servidor) ----------
  var CART_KEY = "varg_carrinho";
  var Carrinho = {
    itens: function () { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } },
    salvar: function (l) { localStorage.setItem(CART_KEY, JSON.stringify(l)); Carrinho.render(); },
    adicionar: function (p, tamanho, qtd) {
      var l = Carrinho.itens();
      var ex = l.find(function (i) { return i.produto_id === p.id && (i.tamanho || null) === (tamanho || null); });
      if (ex) ex.quantidade = Math.min(50, ex.quantidade + qtd);
      else l.push({ produto_id: p.id, tamanho: tamanho || null, quantidade: qtd, nome: p.nome, preco: p.preco, imagem: (p.imagens || [])[0] || "" });
      Carrinho.salvar(l);
      toast(t("l.added"));
      abrirCarrinho();
    },
    alterar: function (idx, delta) {
      var l = Carrinho.itens();
      if (!l[idx]) return;
      l[idx].quantidade += delta;
      if (l[idx].quantidade <= 0) l.splice(idx, 1);
      Carrinho.salvar(l);
    },
    remover: function (idx) { var l = Carrinho.itens(); l.splice(idx, 1); Carrinho.salvar(l); },
    limpar: function () { localStorage.removeItem(CART_KEY); Carrinho.render(); },
    qtd: function () { return Carrinho.itens().reduce(function (s, i) { return s + i.quantidade; }, 0); },
    subtotal: function () { return Carrinho.itens().reduce(function (s, i) { return s + i.preco * i.quantidade; }, 0); },
    // Atualiza nome/preço salvos com o catálogo atual
    sincronizar: function (produtos) {
      var l = Carrinho.itens().filter(function (i) { return produtos.some(function (p) { return p.id === i.produto_id; }); });
      l.forEach(function (i) {
        var p = produtos.find(function (x) { return x.id === i.produto_id; });
        i.nome = p.nome; i.preco = p.preco; i.imagem = (p.imagens || [])[0] || i.imagem;
      });
      localStorage.setItem(CART_KEY, JSON.stringify(l));
      Carrinho.render();
    },
    render: function () {
      var badge = qs("#cartBadge");
      var n = Carrinho.qtd();
      if (badge) { badge.textContent = n; badge.classList.toggle("hidden", !n); }
      var body = qs("#drawerBody"), foot = qs("#drawerFoot");
      if (!body) return;
      var l = Carrinho.itens();
      if (!l.length) {
        body.innerHTML = '<div class="empty">' + ICON.bag + "<p>" + t("l.cart.empty") + '</p><p style="margin-top:18px"><a class="btn btn-ghost btn-sm" href="/#loja" onclick="VARG.fecharCarrinho()">' + t("l.cart.keep") + "</a></p></div>";
        foot.classList.add("hidden");
        return;
      }
      body.innerHTML = l.map(function (i, idx) {
        return '<div class="cart-line"><img src="' + esc(i.imagem) + '" alt=""><div><div class="name">' + esc(i.nome) + "</div>" +
          (i.tamanho ? '<div class="meta">' + t("l.size") + ": " + esc(i.tamanho) + "</div>" : "") +
          '<div class="qty"><button aria-label="-" onclick="VARG.Carrinho.alterar(' + idx + ',-1)">−</button><span>' + i.quantidade + '</span><button aria-label="+" onclick="VARG.Carrinho.alterar(' + idx + ',1)">+</button></div></div>' +
          '<div class="right"><span class="price">' + brl(i.preco * i.quantidade) + '</span><button class="link-btn" onclick="VARG.Carrinho.remover(' + idx + ')">' + t("l.cart.remove") + "</button></div></div>";
      }).join("");
      var sub = Carrinho.subtotal();
      var frete = "";
      var cfg = window.VARG_CFG;
      if (cfg && cfg.frete_gratis_acima > 0 && cfg.frete_fixo > 0) {
        var falta = cfg.frete_gratis_acima - sub;
        var pct = Math.min(100, (sub / cfg.frete_gratis_acima) * 100);
        frete = '<div class="free-ship">' + (falta > 0 ? t("l.cart.freeleft", { v: brl(falta) }) : t("l.cart.freeok")) + '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
      }
      foot.innerHTML = frete +
        '<div class="sum-row total"><span>' + t("l.cart.subtotal") + "</span><span>" + brl(sub) + "</span></div>" +
        '<p class="dim" style="font-size:.82rem">' + t("l.cart.shipcalc") + "</p>" +
        '<a class="btn btn-primary btn-block" href="/checkout.html">' + t("l.cart.checkout") + "</a>";
      foot.classList.remove("hidden");
    },
  };

  function abrirCarrinho() { qs("#drawer").classList.add("open"); document.body.style.overflow = "hidden"; }
  function fecharCarrinho() { qs("#drawer").classList.remove("open"); document.body.style.overflow = ""; }
  function toggleMenu(abrir) { qs("#mobileNav").classList.toggle("open", abrir); }

  var toastTimer;
  function toast(msg) {
    var el = qs("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("hidden"); el.classList.remove("show"); }, 2600);
  }

  // Botão com estado de carregando
  function carregando(btn, on) {
    if (!btn) return;
    if (on) { btn.dataset.txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    else { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
  }

  // ---------- Header e footer ----------
  function renderHeader() {
    var u = Sessao.usuario();
    var conta = u
      ? '<a class="account-link" href="/conta.html">' + esc(u.nome.split(" ")[0]) + "</a>"
      : '<a class="account-link" href="/login.html" data-i18n="l.nav.login">' + t("l.nav.login") + "</a>";
    var html =
      '<div class="announce" data-i18n="l.announce">' + t("l.announce") + "</div>" +
      '<header class="site-header"><div class="container">' +
      '<button class="icon-btn menu-toggle" aria-label="Menu" onclick="VARG.toggleMenu(true)">' + ICON.menu + "</button>" +
      '<a class="brand" href="/"><img src="/img/lobovinho-removebg-preview.png" alt=""><span>VARG</span></a>' +
      '<nav class="main-nav">' +
      '<a href="/#loja" data-i18n="l.nav.shop">' + t("l.nav.shop") + "</a>" +
      '<a href="/?categoria=salt#loja" data-i18n="l.nav.salt">' + t("l.nav.salt") + "</a>" +
      '<a href="/?categoria=camiseta#loja" data-i18n="l.nav.apparel">' + t("l.nav.apparel") + "</a>" +
      '<a href="/quem-somos.html" data-i18n="l.nav.about">' + t("l.nav.about") + "</a>" +
      '<a href="/rastrear-pedido.html" data-i18n="l.nav.track">' + t("l.nav.track") + "</a>" +
      "</nav>" +
      '<div class="header-right">' + conta +
      '<a class="icon-btn user-btn" href="' + (u ? "/conta.html" : "/login.html") + '" aria-label="Conta">' + ICON.user + "</a>" +
      '<button class="icon-btn" aria-label="Carrinho" onclick="VARG.abrirCarrinho()">' + ICON.cart + '<span class="badge hidden" id="cartBadge">0</span></button>' +
      "</div></div></header>" +
      '<div class="mobile-nav" id="mobileNav"><div class="scrim" onclick="VARG.toggleMenu(false)"></div><div class="sheet">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><a class="brand" href="/"><img src="/img/lobovinho-removebg-preview.png" alt=""><span>VARG</span></a><button class="icon-btn" onclick="VARG.toggleMenu(false)">' + ICON.close + "</button></div>" +
      '<a href="/#loja" onclick="VARG.toggleMenu(false)" data-i18n="l.nav.shop">' + t("l.nav.shop") + "</a>" +
      '<a href="/?categoria=salt#loja" data-i18n="l.nav.salt">' + t("l.nav.salt") + "</a>" +
      '<a href="/?categoria=camiseta#loja" data-i18n="l.nav.apparel">' + t("l.nav.apparel") + "</a>" +
      '<a href="/quem-somos.html" data-i18n="l.nav.about">' + t("l.nav.about") + "</a>" +
      '<a href="/rastrear-pedido.html" data-i18n="l.nav.track">' + t("l.nav.track") + "</a>" +
      '<a href="' + (u ? "/conta.html" : "/login.html") + '">' + (u ? t("l.nav.account") : t("l.nav.login")) + "</a>" +
      "</div></div>" +
      '<div class="drawer" id="drawer"><div class="scrim" onclick="VARG.fecharCarrinho()"></div><aside class="panel" aria-label="Carrinho">' +
      '<div class="drawer-head"><h2 data-i18n="l.cart.title">' + t("l.cart.title") + '</h2><button class="icon-btn" aria-label="Fechar" onclick="VARG.fecharCarrinho()">' + ICON.close + "</button></div>" +
      '<div class="drawer-body" id="drawerBody"></div><div class="drawer-foot hidden" id="drawerFoot"></div></aside></div>' +
      '<div class="toast" id="toast" role="status"></div>';
    var slot = document.getElementById("topo");
    if (slot) slot.outerHTML = html;
    else document.body.insertAdjacentHTML("afterbegin", html);
  }

  function renderFooter() {
    var ano = new Date().getFullYear();
    var html =
      '<footer class="site-footer"><div class="container top" style="padding-left:20px;padding-right:20px">' +
      '<div><a class="brand" href="/"><img src="/img/lobovinho-removebg-preview.png" alt=""><span>VARG</span></a><p class="about-txt" data-i18n="l.footer.desc">' + t("l.footer.desc") + "</p></div>" +
      '<div class="col"><h4 data-i18n="l.footer.shop">' + t("l.footer.shop") + '</h4><a href="/?categoria=salt#loja">Smelling Salt</a><a href="/?categoria=camiseta#loja">' + t("l.nav.apparel") + '</a><a href="/conta.html">' + t("l.acc.orders") + "</a></div>" +
      '<div class="col"><h4 data-i18n="l.footer.help">' + t("l.footer.help") + '</h4><a href="/rastrear-pedido.html">' + t("l.nav.track") + '</a><a href="/duvidas-frequentes.html" data-i18n="footer.faq">Dúvidas frequentes</a><a href="/envio-e-prazos.html" data-i18n="footer.shipping">Envio e prazos</a><a href="/trocas-e-devolucoes.html" data-i18n="footer.returns">Trocas e devoluções</a></div>' +
      '<div class="col"><h4>VARG</h4><a href="/quem-somos.html" data-i18n="footer.about">Quem somos</a><a href="/termos-de-uso.html" data-i18n="footer.terms">Termos de uso</a><a href="/politica-privacidade.html" data-i18n="footer.privacy">Política de privacidade</a></div>' +
      "</div>" +
      '<div class="container bottom"><span>© ' + ano + ' VARG — A Matilha. <span data-i18n="l.footer.rights">' + t("l.footer.rights") + '</span></span><div style="display:flex;align-items:center;gap:14px"><div class="pay-badges"><span>PIX</span><span>USDT</span></div><a class="admin-link" href="/admin/" data-i18n="footer.admin">Área do Administrador</a></div></div></footer>';
    var slot = document.getElementById("rodape");
    if (slot) slot.outerHTML = html;
    else document.body.insertAdjacentHTML("beforeend", html);
  }

  // Configuração pública (frete grátis etc.)
  var cfgPromise = fetch("/api/config-publica").then(function (r) { return r.json(); }).then(function (c) { window.VARG_CFG = c; Carrinho.render(); return c; }).catch(function () { return {}; });

  renderHeader();
  renderFooter();
  Carrinho.render();
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { fecharCarrinho(); toggleMenu(false); } });
  document.addEventListener("vargLangChanged", function () { Carrinho.render(); });


  window.VARG = {
    api: api, esc: esc, brl: brl, t: t, qs: qs, param: param, ICON: ICON, toast: toast, carregando: carregando,
    Sessao: Sessao, Carrinho: Carrinho, abrirCarrinho: abrirCarrinho, fecharCarrinho: fecharCarrinho, toggleMenu: toggleMenu,
    config: function () { return cfgPromise; },
  };
})();
