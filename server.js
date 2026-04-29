const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const N8N_SHEETS_URL = process.env.N8N_SHEETS_URL;
const SUCCESS_URL = process.env.SUCCESS_URL;
const ERROR_URL = '/erro';

// Monta a redirect URI dinamicamente garantindo https://
const getRedirectUri = () => {
  return process.env.DISCORD_REDIRECT_URI;
};

// Rota principal
app.get('/', (req, res) => {
  const redirectUri = getRedirectUri(req);
  console.log('Redirect URI:', redirectUri);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.join'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Callback do Discord OAuth2
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  const redirectUri = getRedirectUri(req);

  if (!code) return res.redirect(ERROR_URL);

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordUser = userResponse.data;
    const discordUserId = discordUser.id;
    const discordUsername = discordUser.username;

    await axios.put(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,
      { access_token },
      { headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' } }
    ).catch(() => {});

    const sheetsResponse = await axios.post(N8N_SHEETS_URL, {
      discord_user_id: discordUserId,
      discord_username: discordUsername,
      action: 'auto_assign'
    });

    if (sheetsResponse.status === 200) {
      return res.redirect(SUCCESS_URL);
    } else {
      return res.redirect(`/verificar?user_id=${discordUserId}&username=${encodeURIComponent(discordUsername)}`);
    }

  } catch (error) {
    console.error('Erro no OAuth2:', error.response?.data || error.message);
    return res.redirect(ERROR_URL);
  }
});

// Página de verificação manual
app.get('/verificar', (req, res) => {
  const { user_id, username } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verificar Acesso</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: #16213e; border-radius: 16px; padding: 40px; max-width: 440px; width: 90%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        h2 { color: #7289da; margin-bottom: 10px; font-size: 1.5rem; }
        p { color: #b9bbbe; margin-bottom: 24px; line-height: 1.6; }
        input { width: 100%; padding: 14px 16px; border-radius: 8px; border: 2px solid #2c2f33; background: #2c2f33; color: #fff; font-size: 1rem; margin-bottom: 16px; outline: none; transition: border 0.2s; }
        input:focus { border-color: #7289da; }
        button { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #7289da; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #5b6eae; }
        .aviso { margin-top: 16px; color: #faa61a; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚠️ Compra não encontrada</h2>
        <p>Não encontramos uma compra vinculada à sua conta Discord.<br>Digite o email utilizado na compra para verificar.</p>
        <form action="/verificar-email" method="POST">
          <input type="hidden" name="user_id" value="${user_id}" />
          <input type="hidden" name="username" value="${username}" />
          <input type="email" name="email" placeholder="seuemail@email.com" required />
          <button type="submit">Verificar acesso</button>
        </form>
        <p class="aviso">⏱ Processo leva menos de 10 segundos</p>
      </div>
    </body>
    </html>
  `);
});

app.post('/verificar-email', async (req, res) => {
  const { user_id, username, email } = req.body;
  try {
    const response = await axios.post(N8N_SHEETS_URL, {
      discord_user_id: user_id,
      discord_username: username,
      email: email.toLowerCase(),
      action: 'verify_email'
    });
    if (response.status === 200) {
      return res.redirect(SUCCESS_URL);
    } else {
      return res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro</title><style>body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#16213e;border-radius:16px;padding:40px;max-width:440px;width:90%;text-align:center}h2{color:#f04747;margin-bottom:16px}p{color:#b9bbbe;line-height:1.6}a{color:#7289da}</style></head><body><div class="card"><h2>❌ Email não encontrado</h2><p>Não encontramos uma compra com esse email.<br><br>Verifique se digitou corretamente ou entre em contato com o <a href="#">suporte</a>.</p></div></body></html>`);
    }
  } catch (error) {
    console.error('Erro na verificação:', error.message);
    return res.redirect(ERROR_URL);
  }
});

app.get('/erro', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro</title><style>body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#16213e;border-radius:16px;padding:40px;max-width:440px;width:90%;text-align:center}h2{color:#f04747;margin-bottom:16px}p{color:#b9bbbe}a{color:#7289da}</style></head><body><div class="card"><h2>❌ Algo deu errado</h2><p>Ocorreu um erro ao processar sua solicitação.<br><br>Tente novamente ou entre em contato com o <a href="#">suporte</a>.</p></div></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Redirect URI: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:' + PORT}/callback`);
});
