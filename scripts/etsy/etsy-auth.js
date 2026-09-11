require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.ETSY_PORT || 1357;
const CLIENT_ID = process.env.ETSY_KEYSTRING;
const REDIRECT_URI = `http://localhost:${PORT}/etsy/callback`;

// PKCE Helper Functions
function base64URLEncode(str) {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateCodeVerifier() {
    return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
    return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}

// Store the verifier temporarily in memory so the callback route can use it
let codeVerifier = generateCodeVerifier();

app.get('/login', (req, res) => {
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Scopes needed for downloading financial/transaction data
    const scopes = 'shops_r transactions_r billing_r';
    const state = crypto.randomBytes(16).toString('hex'); // CSRF protection

    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${REDIRECT_URI}&scope=${scopes}&client_id=${CLIENT_ID}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.redirect(authUrl);
});

app.get('/etsy/callback', async (req, res) => {
    const authCode = req.query.code;

    if (!authCode) {
        return res.send('No code received from Etsy.');
    }

    try {
        const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code: authCode,
            code_verifier: codeVerifier // PKCE requires we send the verifier back here
        });

        console.log('\n[SUCCESS] Here is your permanent Etsy Refresh Token:');
        console.log(response.data.refresh_token);
        console.log('\nSave this in your .env file as ETSY_REFRESH_TOKEN!');

        res.send('Success! Check your terminal for the Refresh Token. You can close this window.');
    } catch (error) {
        console.error('[!] Error fetching token:', error.response ? error.response.data : error.message);
        res.send('Failed to get token.');
    }
});

app.listen(PORT, () => {
    console.log(`[+] Etsy OAuth Server running!`);
    console.log(`[+  go to: http://localhost:${PORT}/login`);
});