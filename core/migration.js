'use strict';

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const YAML = require('yaml');
const { sanitizeStoredServiceConfig } = require('./security');

const FORMAT_VERSION = 1;
const BUNDLE_FORMAT = 'dsh-manager-launcher-bundle';
const BUNDLE_MARKER = 'dsh-portable-environment.json';
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILE_COUNT = 100000;
const MAX_SINGLE_FILE_BYTES = 512 * 1024 * 1024;
const SENSITIVE_KEY = /(?:api.?key|secret|password|authorization|access.?token|refresh.?token|credential)/i;
const TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_-]{12,}|glpat-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9_-]{12,})\b/;
const EXCLUDED_NAMES = new Set([
  '.git', 'node_modules', '.pnpm-store', '.cache', 'cache', 'caches', 'logs', 'log',
  'sessions', 'tmp', 'temp', '.credentials.yaml', '.credentials.yml', '.npmrc'
]);
const LAUNCHER_FILES = [
  'DSH Manager.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
  'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat',
  'libEGL.dll', 'libGLESv2.dll', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
  'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version',
  'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll', 'locales', 'resources'
];

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout || '';
        error.stderr = stderr || '';
        reject(error);
      } else resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function sevenZipPath() {
  let executable = require('7zip-bin').path7za;
  if (executable.includes('app.asar')) executable = executable.replace('app.asar', 'app.asar.unpacked');
  return executable;
}

function safeRelative(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) return false;
  return !normalized.split('/').some(part => part === '..' || part === '');
}

function shouldExclude(relativePath) {
  const parts = String(relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.some(part => {
    const lower = part.toLowerCase();
    return EXCLUDED_NAMES.has(lower) || lower === '.env' || lower.startsWith('.env.');
  });
}

function stripSensitiveDeep(value) {
  if (Array.isArray(value)) return value.map(stripSensitiveDeep);
  if (!value || typeof value !== 'object') return value;
  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (!SENSITIVE_KEY.test(key)) safe[key] = stripSensitiveDeep(child);
  }
  return safe;
}

function collectKnownSecrets(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach(item => collectKnownSecrets(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) && typeof child === 'string' && child.length >= 6) out.add(child);
      collectKnownSecrets(child, out);
    }
  }
  return out;
}

function readYamlObject(filePath) {
  try { return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}; }
  catch { return {}; }
}

function discoverSecrets(dshHome) {
  const secrets = new Set();
  for (const name of ['settings.yaml', 'settings.yml', '.credentials.yaml', '.credentials.yml']) {
    collectKnownSecrets(readYamlObject(path.join(dshHome, name)), secrets);
  }
  return secrets;
}

function looksText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (const byte of sample) if (byte === 0) return false;
  return true;
}

function containsSensitiveText(buffer, knownSecrets) {
  if (!looksText(buffer)) return false;
  const text = buffer.toString('utf8');
  if (TOKEN_PATTERN.test(text)) return true;
  for (const secret of knownSecrets) if (secret.length >= 6 && text.includes(secret)) return true;
  return false;
}

function copySafeTree(sourceRoot, targetRoot, { knownSecrets = new Set(), sanitizeSettings = false, excludeSettings = false } = {}) {
  const result = { copied: 0, excluded: 0 };
  if (!fs.existsSync(sourceRoot)) return result;
  const sourceReal = fs.realpathSync(sourceRoot);

  function visit(source, relative) {
    if (relative && (!safeRelative(relative) || shouldExclude(relative))) { result.excluded++; return; }
    const normalized = String(relative || '').replace(/\\/g, '/').toLowerCase();
    if (excludeSettings && (normalized === 'settings.yaml' || normalized === 'settings.yml')) { result.excluded++; return; }
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) { result.excluded++; return; }
    if (stat.isDirectory()) {
      const destination = relative ? path.join(targetRoot, relative) : targetRoot;
      fs.mkdirSync(destination, { recursive: true });
      for (const entry of fs.readdirSync(source)) visit(path.join(source, entry), relative ? path.join(relative, entry) : entry);
      return;
    }
    if (stat.size > MAX_SINGLE_FILE_BYTES) { result.excluded++; return; }
    const destination = path.join(targetRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const lower = normalized;
    if (sanitizeSettings && (lower === 'settings.yaml' || lower === 'settings.yml')) {
      const document = new YAML.Document(stripSensitiveDeep(readYamlObject(source)));
      fs.writeFileSync(destination, document.toString(), { mode: 0o600 });
      result.copied++;
      return;
    }
    const buffer = fs.readFileSync(source);
    if (containsSensitiveText(buffer, knownSecrets)) { result.excluded++; return; }
    fs.writeFileSync(destination, buffer, { mode: stat.mode & 0o777 });
    result.copied++;
  }

  visit(sourceReal, '');
  return result;
}

function fileDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function inventory(root) {
  const files = [];
  function visit(dir, relative = '') {
    for (const entry of fs.readdirSync(dir)) {
      const rel = relative ? path.join(relative, entry) : entry;
      if (!safeRelative(rel)) throw new Error('unsafe-staged-path');
      const full = path.join(dir, entry);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error('symlink-not-allowed');
      if (stat.isDirectory()) visit(full, rel);
      else if (stat.isFile()) {
        if (files.length >= MAX_FILE_COUNT) throw new Error('too-many-files');
        files.push({ path: rel.replace(/\\/g, '/'), size: stat.size, sha256: fileDigest(full) });
      }
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function ensureEmptyDestination(target) {
  if (!fs.existsSync(target)) return;
  if (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length) throw new Error('destination-not-empty');
}

function verifyExtracted(root, manifest) {
  if (!manifest || manifest.formatVersion !== FORMAT_VERSION || manifest.containsCredentials !== false || !Array.isArray(manifest.files)) {
    throw new Error('invalid-migration-manifest');
  }
  if (manifest.files.length > MAX_FILE_COUNT) throw new Error('too-many-files');
  const expected = new Map();
  for (const file of manifest.files) {
    if (!safeRelative(file.path) || !/^[a-f0-9]{64}$/.test(String(file.sha256 || '')) || !Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error('invalid-migration-manifest');
    }
    if (expected.has(file.path)) throw new Error('duplicate-migration-entry');
    expected.set(file.path, file);
  }
  const actual = inventory(root).filter(file => file.path !== 'dsh-manager-migration.json');
  if (actual.length !== expected.size) throw new Error('migration-file-set-mismatch');
  for (const file of actual) {
    const declared = expected.get(file.path);
    if (!declared || declared.size !== file.size || declared.sha256 !== file.sha256) throw new Error('migration-integrity-failed');
  }
}

async function validateArchiveListing(archivePath) {
  const listing = await run(sevenZipPath(), ['l', '-slt', archivePath]);
  const separator = listing.stdout.indexOf('----------');
  if (separator < 0) throw new Error('invalid-archive-listing');
  const entries = [];
  const pattern = /^Path = (.+)$/gm;
  let match;
  const body = listing.stdout.slice(separator);
  while ((match = pattern.exec(body))) {
    const entry = match[1].trim();
    if (!safeRelative(entry)) throw new Error('unsafe-archive-path');
    entries.push(entry);
    if (entries.length > MAX_FILE_COUNT * 2) throw new Error('too-many-archive-entries');
  }
  if (!entries.includes('dsh-manager-migration.json')) throw new Error('migration-manifest-missing');
}

async function createMigrationPackage({ checkout, dshHome, managerConfig, outputPath, appVersion = '0.0.0' }) {
  if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== '.zip') throw new Error('invalid-output-path');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-manager-export-'));
  try {
    const secrets = discoverSecrets(dshHome);
    const payloadRoot = path.join(staging, 'payload');
    fs.mkdirSync(payloadRoot, { recursive: true });
    const checkoutResult = copySafeTree(checkout, path.join(payloadRoot, 'checkout'), { knownSecrets: secrets });
    const homeResult = copySafeTree(dshHome, path.join(payloadRoot, 'dsh-home'), { knownSecrets: secrets, sanitizeSettings: true });
    const portableConfig = sanitizeStoredServiceConfig(managerConfig || {});
    delete portableConfig.checkout;
    delete portableConfig.dshHome;
    fs.writeFileSync(path.join(payloadRoot, 'manager-config.json'), JSON.stringify(portableConfig, null, 2));
    const files = inventory(staging);
    const manifest = {
      format: 'dsh-manager-migration',
      formatVersion: FORMAT_VERSION,
      appVersion: String(appVersion),
      createdAt: new Date().toISOString(),
      sourcePlatform: process.platform,
      containsCredentials: false,
      excludes: ['API credentials', 'sessions', 'logs', '.env files', '.npmrc', '.git', 'node_modules', 'pnpm cache'],
      copiedFiles: checkoutResult.copied + homeResult.copied,
      excludedEntries: checkoutResult.excluded + homeResult.excluded,
      files
    };
    fs.writeFileSync(path.join(staging, 'dsh-manager-migration.json'), JSON.stringify(manifest, null, 2));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    await run(sevenZipPath(), ['a', '-tzip', outputPath, '*', '-mx=5', '-y'], { cwd: staging });
    const stat = fs.statSync(outputPath);
    return { ok: true, path: outputPath, size: stat.size, copiedFiles: manifest.copiedFiles, excludedEntries: manifest.excludedEntries };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function validateLauncherDirectory(launcherDirectory) {
  const root = fs.realpathSync(path.resolve(launcherDirectory));
  const executable = path.join(root, 'DSH Manager.exe');
  const appArchive = path.join(root, 'resources', 'app.asar');
  if (!fs.statSync(root).isDirectory() || !fs.existsSync(executable) || !fs.existsSync(appArchive)) {
    throw new Error('launcher-build-invalid');
  }
  return root;
}

async function createLauncherBundle({ launcherDirectory, checkout, dshHome, managerConfig, outputPath, appVersion = '0.0.0' }) {
  if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== '.zip') throw new Error('invalid-output-path');
  const launcherRoot = validateLauncherDirectory(launcherDirectory);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(outputPath), '.dsh-manager-launcher-'));
  try {
    const secrets = discoverSecrets(dshHome);
    const environmentRoot = path.join(staging, 'environment');
    const checkoutResult = copySafeTree(checkout, path.join(environmentRoot, 'deepseek-harness'), { knownSecrets: secrets });
    const homeResult = copySafeTree(dshHome, path.join(environmentRoot, '.dsh'), { knownSecrets: secrets, excludeSettings: true });
    const portableConfig = sanitizeStoredServiceConfig(managerConfig || {});
    delete portableConfig.checkout;
    delete portableConfig.dshHome;
    fs.writeFileSync(path.join(environmentRoot, 'manager-config.json'), JSON.stringify(portableConfig, null, 2));
    const files = inventory(environmentRoot);
    const marker = {
      format: BUNDLE_FORMAT,
      formatVersion: FORMAT_VERSION,
      appVersion: String(appVersion),
      createdAt: new Date().toISOString(),
      containsCredentials: false,
      environmentDirectory: 'environment',
      checkoutDirectory: 'deepseek-harness',
      dshHomeDirectory: '.dsh',
      installDependenciesOnFirstStart: true,
      excludes: ['API settings and credentials', 'sessions', 'logs', '.env files', '.npmrc', '.git', 'node_modules', 'pnpm cache'],
      files
    };
    fs.writeFileSync(path.join(staging, BUNDLE_MARKER), JSON.stringify(marker, null, 2));
    fs.writeFileSync(path.join(staging, 'README-FIRST.txt'),
      'DSH Manager portable environment / DSH Manager 便携环境\r\n\r\n' +
      'Run "DSH Manager.exe". The bundled Harness environment is bound automatically.\r\n' +
      'First start may install dependencies and requires Node.js, pnpm, and network access. Enter the API key again.\r\n\r\n' +
      '运行“DSH Manager.exe”，启动器会自动绑定随包环境。\r\n' +
      '首次启动可能安装依赖，需要 Node.js、pnpm 和网络连接；API Key 需要重新填写。\r\n');
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
    const launcherItems = LAUNCHER_FILES.filter(item => fs.existsSync(path.join(launcherRoot, item)));
    await run(sevenZipPath(), ['a', '-tzip', outputPath, ...launcherItems, '-mx=5', '-y'], { cwd: launcherRoot });
    await run(sevenZipPath(), ['a', '-tzip', outputPath, '*', '-mx=5', '-y'], { cwd: staging });
    const stat = fs.statSync(outputPath);
    return {
      ok: true,
      path: outputPath,
      size: stat.size,
      copiedFiles: checkoutResult.copied + homeResult.copied,
      excludedEntries: checkoutResult.excluded + homeResult.excluded
    };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function importMigrationPackage({ archivePath, targetRoot }) {
  if (!path.isAbsolute(archivePath) || path.extname(archivePath).toLowerCase() !== '.zip') throw new Error('invalid-archive-path');
  const archiveStat = fs.statSync(archivePath);
  if (!archiveStat.isFile() || archiveStat.size <= 0 || archiveStat.size > MAX_ARCHIVE_BYTES) throw new Error('invalid-archive-size');
  const root = path.resolve(targetRoot);
  if (!path.isAbsolute(root)) throw new Error('invalid-target-path');
  fs.mkdirSync(root, { recursive: true });
  const checkoutTarget = path.join(root, 'deepseek-harness');
  const dshHomeTarget = path.join(root, '.dsh');
  ensureEmptyDestination(checkoutTarget);
  ensureEmptyDestination(dshHomeTarget);

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-manager-import-'));
  const created = [];
  try {
    await validateArchiveListing(archivePath);
    await run(sevenZipPath(), ['t', archivePath, '-y']);
    await run(sevenZipPath(), ['x', archivePath, `-o${staging}`, '-y']);
    const manifestPath = path.join(staging, 'dsh-manager-migration.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    verifyExtracted(staging, manifest);
    const payloadRoot = path.join(staging, 'payload');
    const sourceCheckout = path.join(payloadRoot, 'checkout');
    const sourceHome = path.join(payloadRoot, 'dsh-home');
    if (!fs.existsSync(sourceCheckout) || !fs.statSync(sourceCheckout).isDirectory()) throw new Error('checkout-missing');
    for (const target of [checkoutTarget, dshHomeTarget]) {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    }
    fs.cpSync(sourceCheckout, checkoutTarget, { recursive: true, errorOnExist: true, force: false });
    created.push(checkoutTarget);
    if (fs.existsSync(sourceHome)) {
      fs.cpSync(sourceHome, dshHomeTarget, { recursive: true, errorOnExist: true, force: false });
      created.push(dshHomeTarget);
    } else fs.mkdirSync(dshHomeTarget, { recursive: true });
    const importedConfigPath = path.join(payloadRoot, 'manager-config.json');
    let managerConfig = {};
    try { managerConfig = sanitizeStoredServiceConfig(JSON.parse(fs.readFileSync(importedConfigPath, 'utf8'))); } catch { /* optional */ }
    return { ok: true, checkout: checkoutTarget, dshHome: dshHomeTarget, managerConfig, manifest: { appVersion: manifest.appVersion, createdAt: manifest.createdAt } };
  } catch (error) {
    for (const target of created.reverse()) fs.rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = {
  BUNDLE_FORMAT,
  BUNDLE_MARKER,
  FORMAT_VERSION,
  createLauncherBundle,
  createMigrationPackage,
  importMigrationPackage,
  safeRelative,
  stripSensitiveDeep
};
