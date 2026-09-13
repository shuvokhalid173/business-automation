require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs-extra');
const path = require('path');
const db = require('../../infrastructure/database');

// Dynamically extract last 2 digits of current year (e.g., 2026 -> "26")
const yearYY = String(new Date().getFullYear()).slice(-2);
const BASE_DOWNLOAD_PATH = process.env.DOWNLOAD_PATH || './downloads';

const accounts = [
    {
        name: 'Betonwaschbecken',
        host: 'imap.udag.de',
        port: 993,
        user: process.env.BETON_USER,
        pass: process.env.BETON_PASS,
        folderPattern: new RegExp(`Rechnung\\s*${yearYY}\\s*\\(BETON\\)`, 'i')
    },
    {
        name: 'FredFeuer',
        host: 'imaps.udag.de',
        port: 993,
        user: process.env.FRED_USER,
        pass: process.env.FRED_PASS,
        folderPattern: new RegExp(`Rechnung\\s*${yearYY}\\s*\\(FRED\\)`, 'i')
    }
];

async function processAccount(acc) {
    const client = new ImapFlow({
        host: acc.host,
        port: acc.port,
        secure: true,
        auth: { user: acc.user, pass: acc.pass },
        logger: false
    });

    console.log(`[+] Connecting to ${acc.user}...`);
    await client.connect();

    const folders = await client.list();
    const targetFolder = folders.find(
        f =>
            acc.folderPattern.test(f.name) ||
            acc.folderPattern.test(f.path)
    );

    if (!targetFolder) {
        console.warn(
            `[-] Folder matching pattern 'Rechnung ${yearYY}' for ${acc.name} not found.`
        );
        await client.logout();
        return;
    }

    console.log(`[+] Found target folder: "${targetFolder.path}"`);
    const lock = await client.getMailboxLock(targetFolder.path);

    try {
        for await (let message of client.fetch('1:*', { source: true })) {
            const parsed = await simpleParser(message.source);

            // Use the email's date to determine Year / Month / Day
            const emailDate = parsed.date;

            if (!emailDate || isNaN(emailDate.getTime())) {
                console.warn(
                    `[-] Could not determine email date for a message in ${acc.name}. Skipping attachments.`
                );
                continue;
            }

            const year = String(emailDate.getFullYear());
            // month name instead of 2 digits format
            const month = emailDate.toLocaleString('en-US', { month: 'long' });
            const day = String(emailDate.getDate()).padStart(2, '0');

            for (let att of parsed.attachments) {
                if (
                    att.filename &&
                    att.filename.toLowerCase().endsWith('.pdf')
                ) {
                    const saveDir = path.join(
                        BASE_DOWNLOAD_PATH,
                        acc.name,
                        year,
                        month,
                        day
                    );

                    await fs.ensureDir(saveDir);

                    const filePath = path.join(saveDir, att.filename);

                    await fs.writeFile(filePath, att.content);

                    console.log(`[✓] Saved: ${filePath}`);
                }
            }
        }
    } finally {
        lock.release();
    }

    await client.logout();
}

async function run() {
    for (const acc of accounts) {
        try {
            await processAccount(acc);
        } catch (err) {
            console.error(
                `[!] Error processing ${acc.name}:`,
                err.message
            );
        }
    }

    console.log('[+] All accounts processed successfully.');
}

run();
