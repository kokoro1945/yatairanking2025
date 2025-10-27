#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const archiver = require('archiver');

const INPUT_CSV = path.join(__dirname, '..', 'booths.csv');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist');
const ZIP_FILE = 'booth-qr-codes.zip';
const BASE_URL = 'https://ikomasai.com/';

function sanitizeBooth(value) {
  const raw = (value ?? '').toString().trim().toUpperCase();
  if (!raw) return '';

  const cleaned = raw.replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';

  if (/^[A-Z]/.test(cleaned[0])) {
    const letter = cleaned[0];
    const digits = cleaned.slice(1).replace(/\D/g, '');
    if (!digits) return '';
    const normalized = digits.padStart(2, '0').slice(-2);
    const numeric = Number.parseInt(normalized, 10);
    if (Number.isNaN(numeric) || numeric <= 0) return '';
    return `${letter}${normalized}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  const numeric = Number.parseInt(digits, 10);
  if (Number.isNaN(numeric) || numeric <= 0) return '';
  return digits.padStart(3, '0').slice(-3);
}

function safeFileName(base, extension = '') {
  const normalized = base
    .normalize('NFKC')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-ぁ-んァ-ヶｦ-ﾟ一-龠]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${normalized || 'booth'}${extension}`;
}

function parseCsv(input) {
  const lines = input.trim().split(/\r?\n/);
  const [, ...rows] = lines;
  return rows
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(',');
      if (parts.length < 2) {
        throw new Error(`CSV parsing failed at line ${index + 2}: "${line}"`);
      }
      const [menuNumber, boothRaw, ...nameParts] = parts;
      const boothName = nameParts.join(',').trim();
      return {
        menuNumber: menuNumber.trim(),
        boothRaw: boothRaw.trim(),
        boothName,
      };
    });
}

async function generate() {
  if (!fs.existsSync(INPUT_CSV)) {
    throw new Error(`Input CSV not found at ${INPUT_CSV}`);
  }

  const csv = fs.readFileSync(INPUT_CSV, 'utf8');
  const entries = parseCsv(csv);

  if (!entries.length) {
    throw new Error('No booth rows found in CSV.');
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const zipPath = path.join(OUTPUT_DIR, ZIP_FILE);
  const outputStream = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(outputStream);

  const manifestRows = ['menu_number,booth_id,booth_name,qr_url'];

  for (const entry of entries) {
    const boothId = sanitizeBooth(entry.boothRaw);
    if (!boothId) {
      console.warn(`[skip] booth id invalid: "${entry.boothRaw}" (${entry.menuNumber})`);
      continue;
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('booth', boothId);
    const qrBuffer = await QRCode.toBuffer(url.toString(), {
      type: 'png',
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    const fileStem = `${boothId}_${safeFileName(entry.boothName || entry.menuNumber)}`;
    archive.append(qrBuffer, { name: `${fileStem}.png` });
    manifestRows.push(
      [
        entry.menuNumber,
        boothId,
        `"${(entry.boothName || '').replace(/"/g, '""')}"`,
        url.toString(),
      ].join(','),
    );
  }

  archive.append(
    manifestRows.join('\n'),
    { name: 'manifest.csv' },
  );

  await archive.finalize();

  await new Promise((resolve, reject) => {
    outputStream.on('close', resolve);
    outputStream.on('error', reject);
  });

  console.log(`Generated ${zipPath}`);
}

generate().catch((error) => {
  console.error('[qr] generation failed:', error);
  process.exitCode = 1;
});
