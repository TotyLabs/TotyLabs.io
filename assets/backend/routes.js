const express = require('express');
const router = express.Router();
const { contactController } = require('./contactController');
const { buildAuthUrl, exchangeCode } = require('./oauth');

let authorizedUser = null;

router.get('/auth/google', (req, res) => {
    try {
        const url = buildAuthUrl();
        res.redirect(url);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('Missing Google authorization code.');
        }

        const user = await exchangeCode(code);
        authorizedUser = user;

        res.send(`
            <html>
              <body style="font-family:Arial,sans-serif;padding:40px;">
                <h2>Autorización completada</h2>
                <p>Tu cuenta de Google quedó conectada para enviar mensajes.</p>
                <p>Puedes volver a la página y enviar correos desde tu cuenta.</p>
                <script>
                  localStorage.setItem('google-oauth-authenticated', 'true');
                  setTimeout(() => { window.close(); }, 1200);
                </script>
              </body>
            </html>
        `);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/auth/status', (req, res) => {
    res.json({ success: true, authenticated: Boolean(authorizedUser), email: authorizedUser?.email || null });
});

router.post('/contact', contactController(authorizedUser));

module.exports = {
    router,
    getAuthorizedUser: () => authorizedUser
};
