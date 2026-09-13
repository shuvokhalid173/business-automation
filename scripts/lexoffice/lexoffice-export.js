require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

// Helper to prevent hitting Lexoffice API rate limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const API_KEY = process.env.LEXOFFICE_API_KEY;
const DOWNLOAD_DIR = process.env.DOWNLOAD_PATH || './downloads';
const OUTGOING_DIR = path.join(DOWNLOAD_DIR, 'Lexoffice', 'Outgoing');
const INCOMING_DIR = path.join(DOWNLOAD_DIR, 'Lexoffice', 'Incoming');

async function downloadLexofficeDocuments() {
    try {
        await fs.ensureDir(OUTGOING_DIR);
        await fs.ensureDir(INCOMING_DIR);

        const startDate = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
        const endDate = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

        console.log(`[+] Fetching Lexoffice documents from ${startDate} to ${endDate}...`);

        // Use Lexoffice's exact internal enum terminology
        const types = 'salesinvoice,salescreditnote,purchaseinvoice,purchasecreditnote,invoice';
        const statuses = 'any';

        const listUrl = `https://api.lexoffice.io/v1/voucherlist?voucherType=${types}&voucherStatus=${statuses}&voucherDateFrom=${startDate}&voucherDateTo=${endDate}&size=100`;

        const listRes = await axios.get(listUrl, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });

        const documents = listRes.data.content || [];

        if (documents.length === 0) {
            console.log('[i] No documents found for this period.');
            return;
        }

        console.log(`[+] Found ${documents.length} document(s). Starting PDF downloads...`);

        for (const doc of documents) {
            // Sleep for 1 second to respect Lexoffice rate limits and prevent 429 errors
            await delay(1000);

            let fileId = doc.documentFileId;

            // If the summary list didn't provide the file ID, we fetch it dynamically
            if (!fileId) {
                try {
                    const isSales = ['invoice', 'salesinvoice', 'salescreditnote'].includes(doc.voucherType.toLowerCase());

                    if (isSales) {
                        // Fetch ID for Outgoing Invoices
                        const detailRes = await axios.get(`https://api.lexoffice.io/v1/invoices/${doc.id}/document`, {
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        fileId = detailRes.data.documentFileId;
                    } else {
                        // Fetch ID for Incoming Vouchers/Receipts
                        const detailRes = await axios.get(`https://api.lexoffice.io/v1/vouchers/${doc.id}`, {
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        // Incoming vouchers usually store files in an array
                        if (detailRes.data.files && detailRes.data.files.length > 0) {
                            fileId = detailRes.data.files[0].documentFileId;
                        } else {
                            fileId = detailRes.data.documentFileId;
                        }
                    }
                } catch (e) {
                    console.log(`  [!] Could not fetch file ID for ${doc.voucherNumber || doc.id}: ${e.response ? e.response.statusText : e.message}`);
                    continue;
                }
            }

            if (!fileId) {
                console.log(`  [!] Skipping ${doc.voucherNumber || doc.id} (Still no PDF file attached in Lexoffice)`);
                continue;
            }

            const isOutgoing = ['invoice', 'salesinvoice', 'salescreditnote'].includes(doc.voucherType.toLowerCase());
            const targetFolder = isOutgoing ? OUTGOING_DIR : INCOMING_DIR;
            const prefix = isOutgoing ? 'Outgoing' : 'Incoming';

            // Fallback to doc.id if the receipt doesn't have a voucherNumber yet
            const safeVoucherNumber = (doc.voucherNumber || doc.id).replace(/[\/\\]/g, '-');
            const fileName = `${prefix}_${safeVoucherNumber}_${doc.voucherDate.split('T')[0]}.pdf`;
            const filePath = path.join(targetFolder, fileName);

            console.log(`  -> Downloading: ${fileName}`);

            const fileRes = await axios.get(`https://api.lexoffice.io/v1/files/${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Accept': 'application/pdf'
                },
                responseType: 'arraybuffer'
            });

            await fs.writeFile(filePath, fileRes.data);
        }

        console.log('[✓] Lexoffice export complete! All PDFs saved.');

    } catch (error) {
        let errorMsg = error.message;
        if (error.response && error.response.data) {
            // Convert Buffer to string if the PDF request fails
            if (Buffer.isBuffer(error.response.data)) {
                errorMsg = error.response.data.toString('utf8');
            } else {
                errorMsg = JSON.stringify(error.response.data);
            }
        }
        console.error('[!] Error in Lexoffice automation:', errorMsg);
    }
}

downloadLexofficeDocuments();