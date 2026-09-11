require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const PDFDocument = require('pdfkit');
const moment = require('moment');

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID_FRED;
const SECRET = process.env.PAYPAL_SECRET_FRED;
const DOWNLOAD_DIR = process.env.DOWNLOAD_PATH || './downloads';
const PAYPAL_FOLDER = path.join(DOWNLOAD_DIR, 'PayPal/FredFeuer');

// 1. Get the Bearer Token using Client Credentials
async function getPayPalAccessToken() {
    console.log('[+] Requesting access token from PayPal...');
    const auth = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');

    try {
        const response = await axios.post('https://api-m.paypal.com/v1/oauth2/token', 'grant_type=client_credentials', {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('[!] Failed to get PayPal token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// 2. Generate the PDF
function generatePayPalPDF(transactions, outputPath) {
    return new Promise((resolve, reject) => {
        console.log('[+] Generating PayPal PDF report...');
        const doc = new PDFDocument({ margin: 50 });
        const writeStream = fs.createWriteStream(outputPath);

        doc.pipe(writeStream);

        // Header
        doc.fontSize(20).text('PayPal Monthly Transaction Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(2);

        // Transactions
        doc.fontSize(11);
        if (transactions && transactions.length > 0) {
            transactions.forEach((tx, index) => {
                const info = tx.transaction_info;
                const date = moment(info.transaction_updated_date).format('YYYY-MM-DD HH:mm');
                const amount = info.transaction_amount ? info.transaction_amount.value : '0.00';
                const currency = info.transaction_amount ? info.transaction_amount.currency_code : '';
                const name = info.transaction_event_code || 'Transaction';

                // Format each entry
                doc.font('Helvetica-Bold').text(`${index + 1}. Date: ${date} | Status: ${info.transaction_status}`);
                doc.font('Helvetica').text(`    Amount: ${amount} ${currency}`);
                doc.text(`    Transaction ID: ${info.transaction_id}`);
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

// 3. Fetch Data and Execute
async function runPayPalAutomation() {
    try {
        await fs.ensureDir(PAYPAL_FOLDER);
        const accessToken = await getPayPalAccessToken();

        // PayPal requires a date range. Let's pull the last 30 days.
        const endDate = moment().toISOString();
        const startDate = moment().subtract(30, 'days').toISOString();

        console.log(`[+] Fetching transactions from ${startDate} to ${endDate}...`);

        const response = await axios.get(`https://api-m.paypal.com/v1/reporting/transactions?start_date=${startDate}&end_date=${endDate}&fields=all`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const transactions = response.data.transaction_details;
        const currentMonth = moment().format('YYYY-MM');

        const pdfFileName = `PayPal_Report_${currentMonth}.pdf`;
        const pdfFilePath = path.join(PAYPAL_FOLDER, pdfFileName);

        await generatePayPalPDF(transactions, pdfFilePath);
        console.log(`[✓] Successfully saved PayPal PDF to: ${pdfFilePath}`);

    } catch (error) {
        console.error('[!] Error in PayPal automation:', error.response ? error.response.data : error.message);
    }
}

runPayPalAutomation();