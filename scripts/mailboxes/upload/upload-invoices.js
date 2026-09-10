require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');

/**
 * This script uploads invoices to the recipient email.
 *
 * FIRST RUN:
 *   - Scan the entire current year's directory recursively
 *   - Do this for both FredFeuer and Betonwaschbecken
 *   - Collect all PDF files
 *   - Send all PDFs in one email
 *
 * SUBSEQUENT RUNS:
 *   - Scan only the current year's/current month's directory recursively
 *   - Do this for both FredFeuer and Betonwaschbecken
 *   - Collect all PDF files
 *   - Send them in one email
 *
 * A persistent JSON state file is used to determine whether
 * the initial full-year upload has already been completed.
 */

const BASE_DOWNLOAD_PATH = process.env.DOWNLOAD_PATH;

const FRED_FOLDER = path.join(
  BASE_DOWNLOAD_PATH,
  'FredFeuer'
);

const BETON_FOLDER = path.join(
  BASE_DOWNLOAD_PATH,
  'Betonwaschbecken'
);

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;

// Persistent state file
const STATE_FILE = path.join(
  BASE_DOWNLOAD_PATH,
  'invoice-upload-state.json'
);

async function loadState() {
  if (!await fs.pathExists(STATE_FILE)) {
    return {
      initialUploadCompleted: false
    };
  }

  try {
    return await fs.readJson(STATE_FILE);
  } catch (err) {
    console.error(
      `[!] Failed to read state file: ${STATE_FILE}`
    );

    throw err;
  }
}

async function saveState(state) {
  await fs.writeJson(STATE_FILE, state, {
    spaces: 2
  });
}

/**
 * Recursively scan a directory and return all PDF files.
 */
async function findPdfFiles(directory) {
  const pdfFiles = [];

  if (!await fs.pathExists(directory)) {
    return pdfFiles;
  }

  const entries = await fs.readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const nestedPdfFiles = await findPdfFiles(fullPath);
      pdfFiles.push(...nestedPdfFiles);
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.pdf')
    ) {
      pdfFiles.push(fullPath);
    }
  }

  return pdfFiles;
}

async function sendInvoices() {
  // Load persistent state
  const state = await loadState();

  const now = new Date();

  const currentYear = String(
    now.getFullYear()
  );

  const currentMonth = now.toLocaleString(
    'en-US',
    { month: 'long' }
  );

  console.log(
    `[+] Current period: ${currentYear}/${currentMonth}`
  );

  let fredScanFolder;
  let betonScanFolder;

  if (!state.initialUploadCompleted) {
    // ---------------------------------------------------------
    // FIRST RUN:
    // Scan the entire current year's directory
    // ---------------------------------------------------------

    fredScanFolder = path.join(
      FRED_FOLDER,
      currentYear
    );

    betonScanFolder = path.join(
      BETON_FOLDER,
      currentYear
    );

    console.log(
      '[+] Initial upload detected.'
    );

    console.log(
      `[+] Scanning entire year for FredFeuer: ${fredScanFolder}`
    );

    console.log(
      `[+] Scanning entire year for Betonwaschbecken: ${betonScanFolder}`
    );

  } else {
    // ---------------------------------------------------------
    // SUBSEQUENT RUN:
    // Scan only the current month's directory
    // ---------------------------------------------------------

    fredScanFolder = path.join(
      FRED_FOLDER,
      currentYear,
      currentMonth
    );

    betonScanFolder = path.join(
      BETON_FOLDER,
      currentYear,
      currentMonth
    );

    console.log(
      '[+] Initial upload already completed.'
    );

    console.log(
      `[+] Scanning current month for FredFeuer: ${fredScanFolder}`
    );

    console.log(
      `[+] Scanning current month for Betonwaschbecken: ${betonScanFolder}`
    );
  }

  // Verify base company directories
  if (!await fs.pathExists(FRED_FOLDER)) {
    console.error(
      `[!] FredFeuer folder not found: ${FRED_FOLDER}`
    );
    return;
  }

  if (!await fs.pathExists(BETON_FOLDER)) {
    console.error(
      `[!] Betonwaschbecken folder not found: ${BETON_FOLDER}`
    );
    return;
  }

  // ---------------------------------------------------------
  // Find PDFs recursively
  // ---------------------------------------------------------

  const fredPdfFiles = await findPdfFiles(
    fredScanFolder
  );

  const betonPdfFiles = await findPdfFiles(
    betonScanFolder
  );

  console.log(
    `[+] Found ${fredPdfFiles.length} PDF(s) for FredFeuer.`
  );

  console.log(
    `[+] Found ${betonPdfFiles.length} PDF(s) for Betonwaschbecken.`
  );

  const allPdfFiles = [
    ...fredPdfFiles,
    ...betonPdfFiles
  ];

  if (allPdfFiles.length === 0) {
    console.log(
      '[!] No PDF files found. Email will not be sent.'
    );
    return;
  }

  console.log(
    `[+] Total PDFs to send: ${allPdfFiles.length}`
  );

  // ---------------------------------------------------------
  // Prepare attachments
  // ---------------------------------------------------------

  const attachments = allPdfFiles.map(filePath => ({
    filename: path.basename(filePath),
    path: filePath
  }));

  // ---------------------------------------------------------
  // Configure SMTP Transporter
  // ---------------------------------------------------------

  const transporter = nodemailer.createTransport({
    host: 'smtps.udag.de',
    port: 465,
    secure: true,
    auth: {
      user: process.env.BETON_USER,
      pass: process.env.BETON_PASS
    }
  });

  // ---------------------------------------------------------
  // Construct Email Payload
  // ---------------------------------------------------------

  const mailOptions = {
    from: `"Betonwaschbecken Info" <${process.env.BETON_USER}>`,
    to: RECIPIENT_EMAIL,
    subject: `Invoices - ${allPdfFiles.length} Attachment(s)`,
    text:
      `Attached are the downloaded PDF invoices.\n\n` +
      `FredFeuer: ${fredPdfFiles.length}\n` +
      `Betonwaschbecken: ${betonPdfFiles.length}\n\n` +
      `Period: ${currentYear}/${currentMonth}`,
    attachments: attachments
  };

  // ---------------------------------------------------------
  // Send Email
  // ---------------------------------------------------------

  console.log(
    `[+] Sending email from ${process.env.BETON_USER} to ${RECIPIENT_EMAIL}...`
  );

  const info = await transporter.sendMail(
    mailOptions
  );

  console.log(
    `[✓] Email sent successfully! Message ID: ${info.messageId}`
  );

  // ---------------------------------------------------------
  // Mark initial upload as completed ONLY after
  // successful email delivery
  // ---------------------------------------------------------

  if (!state.initialUploadCompleted) {
    state.initialUploadCompleted = true;

    await saveState(state);

    console.log(
      `[✓] Initial upload state saved: ${STATE_FILE}`
    );
  }
}

sendInvoices().catch(err =>
  console.error(
    '[!] Error sending invoices:',
    err.message
  )
);
