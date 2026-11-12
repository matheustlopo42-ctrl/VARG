// Textos da loja nova (somados ao dicionário de i18n.js). Ordem: pt, en, es, de, fr
(function () {
  var D = {
    "waitlist.title": ["Avise-me quando voltar", "Notify me when it's back", "Avísame cuando vuelva", "Benachrichtige mich", "Prévenez-moi du retour"],
    "waitlist.btn": ["Quero ser avisado", "Notify me", "Avísame", "Benachrichtigen", "Me prévenir"],
    "l.announce": ["Pagamento seguro via PIX · Envio com rastreio", "Secure PIX payment · Tracked shipping", "Pago seguro vía PIX · Envío con seguimiento", "Sichere PIX-Zahlung · Versand mit Tracking", "Paiement PIX sécurisé · Envoi suivi"],
    "l.nav.shop": ["Loja", "Shop", "Tienda", "Shop", "Boutique"],
    "l.nav.salt": ["Smelling Salt", "Smelling Salt", "Smelling Salt", "Riechsalz", "Sel odorant"],
    "l.nav.apparel": ["Vestuário", "Apparel", "Ropa", "Bekleidung", "Vêtements"],
    "l.nav.about": ["Sobre", "About", "Nosotros", "Über uns", "À propos"],
    "l.nav.track": ["Rastrear", "Track", "Rastrear", "Verfolgen", "Suivre"],
    "l.nav.account": ["Minha conta", "My account", "Mi cuenta", "Mein Konto", "Mon compte"],
    "l.nav.login": ["Entrar", "Log in", "Ingresar", "Anmelden", "Connexion"],
    "l.cart.title": ["Seu carrinho", "Your cart", "Tu carrito", "Dein Warenkorb", "Votre panier"],
    "l.cart.empty": ["Seu carrinho está vazio.", "Your cart is empty.", "Tu carrito está vacío.", "Dein Warenkorb ist leer.", "Votre panier est vide."],
    "l.cart.keep": ["Continuar comprando", "Keep shopping", "Seguir comprando", "Weiter einkaufen", "Continuer mes achats"],
    "l.cart.subtotal": ["Subtotal", "Subtotal", "Subtotal", "Zwischensumme", "Sous-total"],
    "l.cart.checkout": ["Finalizar compra", "Checkout", "Finalizar compra", "Zur Kasse", "Commander"],
    "l.cart.remove": ["Remover", "Remove", "Quitar", "Entfernen", "Retirer"],
    "l.cart.shipcalc": ["Frete e descontos calculados no checkout.", "Shipping and discounts calculated at checkout.", "Envío y descuentos calculados al pagar.", "Versand und Rabatte an der Kasse.", "Livraison et remises calculées au paiement."],
    "l.cart.freeleft": ["Faltam {v} para frete grátis", "{v} away from free shipping", "Faltan {v} para envío gratis", "Noch {v} bis zum Gratisversand", "Plus que {v} pour la livraison gratuite"],
    "l.cart.freeok": ["Você ganhou frete grátis", "You've unlocked free shipping", "Tienes envío gratis", "Gratisversand freigeschaltet", "Livraison gratuite débloquée"],
    "l.card.add": ["Adicionar", "Add to cart", "Añadir", "In den Warenkorb", "Ajouter"],
    "l.card.choose": ["Escolher tamanho", "Choose size", "Elegir talla", "Größe wählen", "Choisir la taille"],
    "l.card.soldout": ["Esgotado", "Sold out", "Agotado", "Ausverkauft", "Épuisé"],
    "l.card.notify": ["Avise-me", "Notify me", "Avísame", "Benachrichtigen", "Me prévenir"],
    "l.added": ["Adicionado ao carrinho", "Added to cart", "Añadido al carrito", "Zum Warenkorb hinzugefügt", "Ajouté au panier"],
    "l.size": ["Tamanho", "Size", "Talla", "Größe", "Taille"],
    "l.qty": ["Quantidade", "Quantity", "Cantidad", "Menge", "Quantité"],
    "l.pick.size": ["Escolha um tamanho", "Pick a size", "Elige una talla", "Wähle eine Größe", "Choisissez une taille"],
    "l.left": ["Últimas {n} unidades", "Only {n} left", "Últimas {n} unidades", "Nur noch {n} Stück", "Plus que {n} pièces"],
    "l.perk1.t": ["Pagamento seguro", "Secure payment", "Pago seguro", "Sichere Zahlung", "Paiement sécurisé"],
    "l.perk1.d": ["PIX com confirmação automática", "PIX with instant confirmation", "PIX con confirmación automática", "PIX mit sofortiger Bestätigung", "PIX avec confirmation instantanée"],
    "l.perk2.t": ["Envio com rastreio", "Tracked shipping", "Envío con seguimiento", "Versand mit Tracking", "Envoi suivi"],
    "l.perk2.d": ["Acompanhe pela sua conta", "Follow it in your account", "Síguelo en tu cuenta", "Verfolge es im Konto", "Suivez-le depuis votre compte"],
    "l.perk3.t": ["Qualidade VARG", "VARG quality", "Calidad VARG", "VARG-Qualität", "Qualité VARG"],
    "l.perk3.d": ["Produtos testados no treino", "Tested in real training", "Probados en el entrenamiento", "Im Training getestet", "Testés à l'entraînement"],
    "l.perk4.t": ["Atendimento direto", "Direct support", "Atención directa", "Direkter Support", "Support direct"],
    "l.perk4.d": ["Fale com a matilha", "Talk to the pack", "Habla con la manada", "Sprich mit dem Rudel", "Parlez à la meute"],
    "l.hero.eyebrow": ["Smelling salt & vestuário", "Smelling salt & apparel", "Smelling salt y ropa", "Riechsalz & Bekleidung", "Sel odorant & vêtements"],
    "l.hero.lead": ["Smelling salts e roupas para quem treina pesado. Feito para a matilha que não recua.", "Smelling salts and apparel for heavy lifters. Built for the pack that never backs down.", "Smelling salts y ropa para quien entrena duro. Hecho para la manada que no retrocede.", "Riechsalz und Bekleidung für schweres Training. Für das Rudel, das nie zurückweicht.", "Sels odorants et vêtements pour ceux qui soulèvent lourd. Pour la meute qui ne recule jamais."],
    "l.hero.cta1": ["Comprar agora", "Shop now", "Comprar ahora", "Jetzt kaufen", "Acheter"],
    "l.hero.cta2": ["Ver camisetas", "See t-shirts", "Ver camisetas", "T-Shirts ansehen", "Voir les t-shirts"],
    "l.shop.title": ["A loja", "The shop", "La tienda", "Der Shop", "La boutique"],
    "l.shop.all": ["Todos", "All", "Todos", "Alle", "Tous"],
    "l.about.title": ["Mais que uma marca", "More than a brand", "Más que una marca", "Mehr als eine Marke", "Plus qu'une marque"],
    "l.acc.orders": ["Meus pedidos", "My orders", "Mis pedidos", "Meine Bestellungen", "Mes commandes"],
    "l.acc.profile": ["Meus dados", "My details", "Mis datos", "Meine Daten", "Mes informations"],
    "l.acc.logout": ["Sair", "Log out", "Salir", "Abmelden", "Déconnexion"],
    "l.footer.shop": ["Loja", "Shop", "Tienda", "Shop", "Boutique"],
    "l.footer.help": ["Ajuda", "Help", "Ayuda", "Hilfe", "Aide"],
    "l.footer.company": ["VARG", "VARG", "VARG", "VARG", "VARG"],
    "l.footer.desc": ["Smelling salts e vestuário para quem vive a busca constante por evolução. Quem veste VARG não treina sozinho.", "Smelling salts and apparel for those who chase constant progress. Whoever wears VARG never trains alone.", "Smelling salts y ropa para quienes buscan evolucionar siempre. Quien viste VARG no entrena solo.", "Riechsalz und Bekleidung für ständigen Fortschritt. Wer VARG trägt, trainiert nie allein.", "Sels odorants et vêtements pour ceux qui cherchent à progresser. Qui porte VARG ne s'entraîne jamais seul."],
    "l.footer.rights": ["Todos os direitos reservados.", "All rights reserved.", "Todos los derechos reservados.", "Alle Rechte vorbehalten.", "Tous droits réservés."],
  };
  var langs = ["pt", "en", "es", "de", "fr"];
  window.PEPMASTERS_I18N = window.PEPMASTERS_I18N || {};
  Object.keys(D).forEach(function (k) {
    var o = {};
    langs.forEach(function (l, i) { o[l] = D[k][i]; });
    window.PEPMASTERS_I18N[k] = o;
  });
})();
