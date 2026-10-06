const API = 'https://api.telegram.org/bot';

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function getMe(token) {
  const res = await fetch(`${API}${token}/getMe`, { method: 'GET' });
  const data = await res.json().catch(() => ({ ok: false, description: 'respuesta invalida' }));
  if (!data.ok) throw new Error(data.description || 'Token de Telegram invalido');
  return data.result;
}

export async function sendMessage(token, chatId, text) {
  const res = await fetch(`${API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) throw new Error(data.description || `Telegram HTTP ${res.status}`);
  return data.result;
}

export async function sendQueue(token, chatId, messages, gapMs = 350) {
  let sent = 0;
  const errors = [];
  for (const text of messages) {
    try {
      await sendMessage(token, chatId, text);
      sent++;
    } catch (err) {
      errors.push(err.message);
      break;
    }
    if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  return { sent, errors };
}

export { escapeHtml };
