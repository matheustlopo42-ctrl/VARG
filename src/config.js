// Todas as configurações vêm de variáveis de ambiente (Render → Environment).
// Localmente, crie um arquivo .env (veja .env.example). Nunca coloque chaves no código.
const fs = require("fs");
const path = require("path");

// Carrega .env simples (sem dependência extra)
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k, def = "") => (process.env[k] ?? def).toString().trim();
const isProd = env("NODE_ENV") === "production";

const config = {
  isProd,
  port: parseInt(env("PORT", "3000"), 10),
  baseUrl: env("BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
  databaseUrl: env("DATABASE_URL"),
  databaseSsl: env("DATABASE_SSL", isProd ? "true" : "false") === "true",

  jwtSecret: env("JWT_SECRET"),
  adminEmail: env("ADMIN_EMAIL").toLowerCase(),
  adminPassword: env("ADMIN_PASSWORD"),

  resendApiKey: env("RESEND_API_KEY"),
  emailFrom: env("EMAIL_FROM", "VARG <onboarding@resend.dev>"),
  emailAdmin: env("EMAIL_ADMIN"),

  pixProvider: env("PIX_PROVIDER", "pixgo"), // pixgo | braspay
  pixgoApiKey: env("PIXGO_API_KEY"),
  pixgoWebhookSecret: env("PIXGO_WEBHOOK_SECRET"),

  cryptoWallet: env("CRYPTO_WALLET"),
  cryptoNetwork: env("CRYPTO_NETWORK", "Polygon"),
  whatsappPhone: env("WHATSAPP_PHONE"),
  callmebotApiKey: env("CALLMEBOT_APIKEY"),

  // Frete fixo (R$). 0 = grátis. FRETE_GRATIS_ACIMA = valor a partir do qual o frete é grátis (0 = nunca).
  freteFixo: parseFloat(env("FRETE_FIXO", "0")) || 0,
  freteGratisAcima: parseFloat(env("FRETE_GRATIS_ACIMA", "0")) || 0,
};

const faltando = [];
if (!config.jwtSecret || config.jwtSecret.length < 24) faltando.push("JWT_SECRET (mín. 24 caracteres)");
if (!config.adminEmail) faltando.push("ADMIN_EMAIL");
if (!config.adminPassword || config.adminPassword.length < 10) faltando.push("ADMIN_PASSWORD (mín. 10 caracteres)");
if (isProd && !config.databaseUrl) faltando.push("DATABASE_URL");
if (faltando.length) {
  console.error("\n[VARG] Variáveis de ambiente obrigatórias faltando:\n  - " + faltando.join("\n  - ") + "\n");
  process.exit(1);
}

module.exports = config;
