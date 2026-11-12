# VARG — A Matilha

Loja da VARG (smelling salt e vestuário): Node.js + Express + PostgreSQL.

## Estrutura

```
server.js            entrada do servidor
src/config.js        variáveis de ambiente (nenhuma chave fica no código)
src/db.js            cria/atualiza as tabelas sozinho ao iniciar + produtos iniciais
src/pedidos.js       cálculo do carrinho no servidor, status do pedido, estoque
src/email.js         e-mails (Resend) de cada etapa do pedido
src/payments/        PIX: pixgo.js (ativo) e braspay.js (a preencher)
src/routes/loja.js   API da loja, conta do cliente, checkout, webhooks
src/routes/admin.js  API do painel
public/              site (só esta pasta é servida)
public/admin/        painel administrativo (/admin)
```

## Rodar localmente

1. Copie `.env.example` para `.env` e preencha (no mínimo `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; para testar fora de produção use `NODE_ENV=development`).
2. `npm install`
3. `npm run dev` e abra http://localhost:3000

As tabelas são criadas automaticamente na primeira execução.

## Deploy no Render

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check:** `/healthz`
- Cadastre todas as variáveis do `.env.example` em *Environment*.
- Webhook da PixGo: `https://SEU-DOMINIO/webhook/pixgo`

## Fluxo do pedido

`aguardando_pagamento → pago → em_separacao → enviado → entregue` (ou `cancelado`)

- O preço é sempre recalculado no servidor (o navegador só manda produto, tamanho e quantidade).
- O estoque só baixa quando o pagamento é confirmado e volta se o pedido for cancelado.
- PIX não pago em 48h é cancelado automaticamente.
- Cada mudança de status gera um e-mail ao cliente e uma linha no histórico do pedido.

## Trocar o PIX para a Braspay

Preencha `src/payments/braspay.js` (mesmo formato do `pixgo.js`), configure o webhook para
`https://SEU-DOMINIO/webhook/braspay` e defina `PIX_PROVIDER=braspay`.
