require('dotenv').config();
const axios = require('axios');

async function testLexofficeConnection() {
    try {
        console.log('[+] Pinging Lexoffice API...');
        const response = await axios.get('https://api.lexoffice.io/v1/profile', {
            headers: {
                'Authorization': `Bearer ${process.env.LEXOFFICE_API_KEY}`,
                'Accept': 'application/json'
            }
        });

        console.log('[✓] Connection Successful!');
        console.log(response.data);
        console.log('Company Name:', response.data.companyName);
        console.log('Company ID:', response.data.companyId);

    } catch (error) {
        console.error('[!] Lexoffice Connection Failed:', error.response ? error.response.data : error.message);
    }
}

testLexofficeConnection();