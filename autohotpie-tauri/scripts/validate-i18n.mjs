#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
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
  const match = raw.match(/const FALLBACK_STRINGS: Record<string, string> = {(.*)\n};/s);
  if (!match) {
    throw new Error('Failed to parse FALLBACK_STRINGS from localizationStore.ts');
  }
  // eslint-disable-next-line no-new-func
  const fallback = Function(`return ({${match[1]}});`)();
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
