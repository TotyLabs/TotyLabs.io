const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const config = require('./config');

function getOAuthClient() {
    if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) {
        return null;
    }

    return new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        config.googleRedirectUri
    );
}

function buildAuthUrl(state = 'totylabs-auth') {
    const oauth2Client = getOAuthClient();
    if (!oauth2Client) {
        throw new Error('Google OAuth is not configured.');
    }

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.send'
        ],
        state
    });
}

async function exchangeCode(code) {
    const oauth2Client = getOAuthClient();
    if (!oauth2Client) {
        throw new Error('Google OAuth is not configured.');
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    return {
        email: data.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope
    };
}

function createTransportForUser(user) {
    const oauth2Client = getOAuthClient();
    if (!oauth2Client) {
        throw new Error('Google OAuth is not configured.');
    }

    oauth2Client.setCredentials({
        refresh_token: user.refreshToken,
        access_token: user.accessToken,
        expiry_date: user.expiryDate
    });

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            type: 'OAuth2',
            user: user.email,
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            refreshToken: user.refreshToken,
            accessToken: user.accessToken,
            expires: user.expiryDate ? Math.floor(user.expiryDate / 1000) : undefined
        }
    });
}

module.exports = {
    buildAuthUrl,
    exchangeCode,
    createTransportForUser
};
