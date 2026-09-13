require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

const BASE_DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || './downloads';

// Email Targets
const SENDER_EMAIL = 'info@betonwaschbecken.de';
// const LEXWARE_DESTINATION = 'f9qrq+eingangsrechnungen@portal-bereich.de';
// const REPORTS_DESTINATION = 'f9qrq+buchhaltung@portal-bereich.de';
const LEXWARE_DESTINATION = 'shuvokhalid173@gmail.com';
const REPORTS_DESTINATION = 'shuvokhalid173@gmail.com';

// Folder Groupings
const LEXWARE_FOLDERS = [
    {
        'folder_name': 'Lexoffice/Outgoing',
        'subject': 'Lexware Invoices (outgoing)'
    }, {
        'folder_name': 'Lexoffice/Incoming',
        'subject': 'Lexware Invoices (incoming)'
    }
];

const REPORT_FOLDERS = [
    {
        'folder_name': 'eBay',
        'subject': 'eBay Monthly Report'
    }, {
        'folder_name': 'PayPal/Betonwaschbecken',
        'subject': 'PayPal Monthly Report (Betonwaschbecken)'
    }, {
        'folder_name': 'PayPal/Fredfeuer',
        'subject': 'PayPal Monthly Report (Fredfeuer)'
    }, {
        'folder_name': 'Etsy',
        'subject': 'Etsy Monthly Report'
    }
];

// 1. Setup SMTP Transport
const transporter = nodemailer.createTransport({
    host: 'smtps.udag.de', // Using René's provider
    port: 465,
    secure: true,
    auth: {
        user: process.env.BETON_USER,
        pass: process.env.BETON_PASS
    }
});

// 2. Core function to gather files and send an email
async function processAndSend(folder, targetEmail, subjectName) {
    let allAttachments = [];
    let filesToMove = [];

    const folderPath = path.join(BASE_DOWNLOAD_PATH, folder);
    const sentPath = path.join(folderPath, 'Sent');

    await fs.ensureDir(folderPath);
    await fs.ensureDir(sentPath);

    const files = await fs.readdir(folderPath);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    for (const file of pdfFiles) {
        allAttachments.push({
            filename: file,
            path: path.join(folderPath, file)
        });
        filesToMove.push({
            oldPath: path.join(folderPath, file),
            newPath: path.join(sentPath, file)
        });
    }

    // If no files found for this group, skip sending
    if (allAttachments.length === 0) {
        console.log(`[i] No new PDFs found for ${subjectName}. Skipping email.`);
        return;
    }

    console.log(`[+] Found ${allAttachments.length} PDFs for ${subjectName}. Sending to ${targetEmail}...`);

    const currentMonth = moment().format('MMMM YYYY');
    const mailOptions = {
        from: `"Betonwaschbecken" <${SENDER_EMAIL}>`,
        to: targetEmail,
        subject: `${subjectName} - ${currentMonth}`,
        text: `Attached are the automated ${subjectName} for ${currentMonth}.`,
        attachments: allAttachments
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[✓] ${subjectName} email sent successfully! Message ID: ${info.messageId}`);

        // Move files to 'Sent' folder to prevent duplicate sending next month
        for (const move of filesToMove) {
            await fs.move(move.oldPath, move.newPath, { overwrite: true });
        }
        console.log(`    -> Moved ${filesToMove.length} files to Sent folders.`);

    } catch (error) {
        console.error(`[!] Error sending ${subjectName} email:`, error.message);
    }
}

// 3. Execution
async function runMasterDelivery() {
    console.log('--- Starting Monthly Accounting Delivery ---');

    // Group 1: Lexware Invoices (Outgoing/Incoming)
    LEXWARE_FOLDERS.forEach(folder => {
        processAndSend(folder.folder_name, LEXWARE_DESTINATION, folder.subject);
    });

    // Group 2: Platform Monthly Reports
    REPORT_FOLDERS.forEach(folder => {
        processAndSend(folder.folder_name, REPORTS_DESTINATION, folder.subject);
    });

    console.log('--- Delivery Process Complete ---');
}

runMasterDelivery();