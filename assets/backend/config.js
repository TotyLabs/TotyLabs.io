require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    emailUser: process.env.EMAIL_USER || 'contact.totylabs@gmail.com',
    emailPass: process.env.EMAIL_PASS || 'njdo parx zgmb pjhk',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
};
