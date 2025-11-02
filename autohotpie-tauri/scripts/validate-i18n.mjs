#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const LOCALE_DIR = path.join(ROOT, 'src-tauri', 'resources', 'localization');
const FALLBACK_STORE_PATH = path.join(ROOT, 'src', 'state', 'localizationStore.ts');

function stripJsonComments(content) {
  return content.replace(/\/\*[^]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

async function loadLocalizationPack(filename) {
  const raw = await readFile(path.join(LOCALE_DIR, filename), 'utf-8');
  const parsed = JSON.parse(stripJsonComments(raw));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.strings !== 'object') {
    throw new Error(`Localization file ${filename} has invalid format.`);
  }
  return parsed.strings;
}

async function loadFallbackStrings() {
  const raw = await readFile(FALLBACK_STORE_PATH, 'utf-8');
  
  // Find the start of FALLBACK_STRINGS object
  const startPattern = /const FALLBACK_STRINGS:\s*Record<string,\s*string>\s*=\s*\{/;
  const startMatch = raw.match(startPattern);
  if (!startMatch) {
    throw new Error('Failed to find FALLBACK_STRINGS declaration');
  }
  
  // Extract object content by counting braces
  const startIndex = startMatch.index + startMatch[0].length - 1; // Position of opening {
  let braceCount = 0;
  let endIndex = startIndex;
  
  for (let i = startIndex; i < raw.length; i++) {
    if (raw[i] === '{') braceCount++;
    if (raw[i] === '}') braceCount--;
    if (braceCount === 0) {
      endIndex = i;
      break;
    }
  }
  
  const objectLiteral = raw.substring(startIndex, endIndex + 1);
  
  // eslint-disable-next-line no-new-func
  const fallback = Function(`'use strict'; return ${objectLiteral};`)();
  if (!fallback || typeof fallback !== 'object') {
    throw new Error('Parsed fallback strings are invalid.');
  }
  return fallback;
}

function computeDiff(reference, comparison) {
  const missing = Object.keys(reference).filter((key) => !(key in comparison));
  const extra = Object.keys(comparison).filter((key) => !(key in reference));
  return { missing, extra };
}

async function main() {
  const [fallback, enStrings, ruStrings] = await Promise.all([
    loadFallbackStrings(),
    loadLocalizationPack('en.json'),
    loadLocalizationPack('ru.json'),
  ]);

  const diffEn = computeDiff(fallback, enStrings);
  const diffRu = computeDiff(fallback, ruStrings);

  let hasErrors = false;

  if (diffEn.missing.length) {
    hasErrors = true;
    console.error('[i18n] Missing EN keys:', diffEn.missing.sort());
  }
  if (diffRu.missing.length) {
    hasErrors = true;
    console.error('[i18n] Missing RU keys:', diffRu.missing.sort());
  }

  if (diffEn.extra.length) {
    console.warn('[i18n] Extra EN keys not in fallback (ok if intentional):', diffEn.extra.sort());
  }
  if (diffRu.extra.length) {
    console.warn('[i18n] Extra RU keys not in fallback (ok if intentional):', diffRu.extra.sort());
  }

  const report = {
    timestamp: new Date().toISOString(),
    status: hasErrors ? 'fail' : 'pass',
    errors: {
      en: { missing: diffEn.missing.sort(), extra: diffEn.extra.sort() },
      ru: { missing: diffRu.missing.sort(), extra: diffRu.extra.sort() },
    },
    summary: {
      totalMissing: diffEn.missing.length + diffRu.missing.length,
      totalExtra: diffEn.extra.length + diffRu.extra.length,
    },
  };

  const reportPath = path.join(ROOT, 'i18n-lint.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[i18n] Report saved to ${reportPath}`);

  if (hasErrors) {
    process.exitCode = 1;
  } else {
    console.log('[i18n] Localization strings validated successfully.');
  }
}

main().catch((error) => {
  console.error('[i18n] Validation failed:', error);
  process.exitCode = 1;
});
