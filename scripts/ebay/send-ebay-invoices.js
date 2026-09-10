require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');

const BASE_DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || 'C:/Users/Rene/Desktop/Neuer Ordner/n8n-workflow-main/n8n-workflow-main/downloads';
const EBAY_FOLDER = path.join(BASE_DOWNLOAD_PATH, 'eBay');
const SENT_FOLDER = path.join(EBAY_FOLDER, 'Sent');
const RECIPIENT_EMAIL = 'shuvokhalid173@gmail.com';

async function processEbayInvoices() {
    // 1. Ensure primary and archive directories exist
    await fs.ensureDir(EBAY_FOLDER);
    await fs.ensureDir(SENT_FOLDER);

    // 2. Read the eBay folder and find PDFs
    const files = await fs.readdir(EBAY_FOLDER);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
        console.log('[i] No new eBay PDFs found to send.');
        return;
    }

    console.log(`[+] Found ${pdfFiles.length} new eBay PDF(s). Preparing to send...`);

    // 3. Prepare attachments
    const attachments = pdfFiles.map(file => ({
        filename: file,
        path: path.join(EBAY_FOLDER, file)
    }));

    // 4. Configure SMTP Transporter (Using existing Betonwaschbecken credentials)
    const transporter = nodemailer.createTransport({
        host: 'smtps.udag.de',
        port: 465,
        secure: true,
        auth: {
            user: process.env.BETON_USER,
            pass: process.env.BETON_PASS
        }
    });

    const mailOptions = {
        from: `"Betonwaschbecken Info" <${process.env.BETON_USER}>`,
        to: RECIPIENT_EMAIL,
        subject: `New eBay Invoices - ${pdfFiles.length} Attachment(s)`,
        text: `Attached are the latest manually downloaded eBay invoices.`,
        attachments: attachments
    };

    try {
        // 5. Send the Email
        console.log(`[+] Sending email to ${RECIPIENT_EMAIL}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[✓] Email sent successfully! Message ID: ${info.messageId}`);

        // 6. Move files to the 'Sent' folder to prevent duplicate sending
        for (const file of pdfFiles) {
            const oldPath = path.join(EBAY_FOLDER, file);
            const newPath = path.join(SENT_FOLDER, file);
            await fs.move(oldPath, newPath, { overwrite: true });
            console.log(`[+] Moved ${file} to Sent folder.`);
        }

        console.log('[✓] eBay invoice processing complete.');
    } catch (error) {
        console.error('[!] Error during email delivery or file moving:', error.message);
    }
}

processEbayInvoices();