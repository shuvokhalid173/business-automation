require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const PDFDocument = require('pdfkit');

const CLIENT_ID = process.env.ETSY_KEYSTRING;
const SHARED_SECRET = process.env.ETSY_SHARED_SECRET;
const REFRESH_TOKEN = process.env.ETSY_REFRESH_TOKEN;
const DOWNLOAD_DIR = process.env.DOWNLOAD_PATH || './downloads';
const ETSY_FOLDER = path.join(DOWNLOAD_DIR, 'Etsy');

async function getEtsyAccessToken() {
    console.log('[+] Requesting fresh access token from Etsy...');
    try {
        const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
            grant_type: 'refresh_token',
            client_id: CLIENT_ID,
            refresh_token: REFRESH_TOKEN
        });
        return response.data.access_token;
    } catch (error) {
        console.error('[!] Failed to get Etsy access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

function generatePDF(ledgerData, outputPath) {
    return new Promise((resolve, reject) => {
        console.log('[+] Generating PDF report...');
        const doc = new PDFDocument({ margin: 50 });
        const writeStream = fs.createWriteStream(outputPath);

        doc.pipe(writeStream);

        // Header
        doc.fontSize(20).text('Etsy Monthly Financial Ledger', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(2);

        // Transactions
        doc.fontSize(12);
        if (ledgerData.results && ledgerData.results.length > 0) {
            ledgerData.results.forEach((entry, index) => {
                const title = entry.title || entry.description || `Entry ID: ${entry.ledger_entry_id}`;
                const rawAmount = typeof entry.amount === 'number' ? entry.amount : 0;
                const divisor = entry.divisor || 100;
                const amount = (rawAmount / divisor).toFixed(2);
                const currency = entry.currency;
                const date = new Date(entry.create_date * 1000).toLocaleDateString();

                doc.font('Helvetica-Bold').text(`${index + 1}. ${title}`);
                doc.font('Helvetica').text(`    Date: ${date}`);
                doc.text(`    Amount: ${amount} ${currency}`);
                doc.moveDown(0.5);
            });
        } else {
            doc.text('No transactions found for this period.');
        }

        doc.end();

        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}

async function runEtsyAutomation() {
    try {
        await fs.ensureDir(ETSY_FOLDER);
        const accessToken = await getEtsyAccessToken();

        const headers = {
            'x-api-key': `${CLIENT_ID}:${SHARED_SECRET}`,
            'Authorization': `Bearer ${accessToken}`,
        };

        console.log('[+] Fetching User & Shop ID...');
        const userRes = await axios.get('https://api.etsy.com/v3/application/users/me', { headers });
        const userId = userRes.data.user_id;

        const shopRes = await axios.get(`https://api.etsy.com/v3/application/users/${userId}/shops`, { headers });
        const shopId = shopRes.data.shop_id;

        console.log(`[+] Fetching Ledger Entries for Shop ID: ${shopId}...`);

        // Calculate Unix timestamps in seconds (Etsy requires epoch seconds, not milliseconds)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const minCreated = Math.floor(startOfMonth.getTime() / 1000); // Start of current month
        const maxCreated = Math.floor(now.getTime() / 1000);          // Current time

        const ledgerRes = await axios.get(
            `https://api.etsy.com/v3/application/shops/${shopId}/payment-account/ledger-entries`,
            {
                headers,
                params: {
                    min_created: minCreated,
                    max_created: maxCreated,
                    limit: 100 // Fetch up to 100 entries per request
                }
            }
        );

        const currentMonth = new Date().toISOString().slice(0, 7);
        const pdfFileName = `Etsy_Report_${currentMonth}.pdf`;
        const pdfFilePath = path.join(ETSY_FOLDER, pdfFileName);

        // Generate the PDF from the fetched JSON
        await generatePDF(ledgerRes.data, pdfFilePath);
        console.log(`[✓] Successfully saved Etsy PDF to: ${pdfFilePath}`);

    } catch (error) {
        console.error('[!] Error in Etsy automation:', error.response ? error.response.data : error.message);
    }
}

runEtsyAutomation();