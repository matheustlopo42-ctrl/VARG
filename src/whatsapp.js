// Aviso opcional no seu WhatsApp via CallMeBot (só funciona com CALLMEBOT_APIKEY + WHATSAPP_PHONE).
const config = require("./config");

async function avisarWhatsApp(texto) {
  if (!config.callmebotApiKey || !config.whatsappPhone) return;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${config.whatsappPhone}&text=${encodeURIComponent(texto)}&apikey=${config.callmebotApiKey}`;
  try {
    await fetch(url);
  } catch (e) {
    console.error("[whatsapp]", e.message);
  }
}

module.exports = { avisarWhatsApp };
