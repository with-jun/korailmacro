const fetch = require('node-fetch');

async function sendTelegram(config, message) {
  if (!config || !config.botToken || !config.chatId) return;
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message }),
    });
  } catch (err) {
    console.error('[telegram] 전송 실패:', err.message);
  }
}

module.exports = { sendTelegram };
