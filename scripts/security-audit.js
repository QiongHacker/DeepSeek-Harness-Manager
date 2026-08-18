'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ONLY = process.argv.includes('--source-only');
const artifactDirArg = process.argv.find(argument => argument.startsWith('--artifact-dir='));
const ARTIFACT_ROOT = artifactDirArg
  ? path.resolve(ROOT, artifactDirArg.slice('--artifact-dir='.length))
  : path.join(ROOT, 'dist');
const MAX_HISTORY_BLOB = 2 * 1024 * 1024;
const MAX_ARTIFACT_FILE = 256 * 1024 * 1024;
const findings = [];
const checked = { sourceFiles: 0, historyBlobs: 0, artifacts: 0, extractedFiles: 0 };

const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['api-key', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['github-token', /\b(?:github_pat_|ghp_)[A-Za-z0-9_-]{16,}\b/gi],
  ['cloud-token', /\b(?:glpat-|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/gi],
  ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/g],
  ['npm-auth-token', /\/\/[\w.-]+\/?[^\s:]*:_authToken\s*=\s*(?!\$\{)[^\s]+/gi]
];

function isClearlySynthetic(value) {
  return /(?:test|example|sample|dummy|fake|not-real|redacted)/i.test(value);
}

function scanText(scope, name, text) {
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (!isClearlySynthetic(match[0])) findings.push({ scope, name, kind });
    }
  }
}

function readPrivateSecrets() {
  const homes = new Set([path.join(os.homedir(), '.dsh')]);
  const managerConfig = process.env.APPDATA && path.join(process.env.APPDATA, 'DSH Manager', 'config.json');
  if (managerConfig) {
    try {
      const config = JSON.parse(fs.readFileSync(managerConfig, 'utf8'));
      if (config.dshHome) homes.add(path.resolve(String(config.dshHome)));
    } catch { /* manager config is optional */ }
  }
  const secrets = new Set();
  for (const home of homes) {
    for (const file of ['settings.yaml', '.credentials.yaml']) {
      try {
        const parsed = YAML.parse(fs.readFileSync(path.join(home, file), 'utf8')) || {};
        const candidates = [parsed.DEEPSEEK_API_KEY, parsed['llm-deepseek'] && parsed['llm-deepseek'].apiKey];
        for (const candidate of candidates) {
          const secret = String(candidate || '');
          if (secret.length >= 8) secrets.add(secret);
        }
      } catch { /* file may not exist */ }
    }
  }
  return [...secrets];
}

const privateSecrets = readPrivateSecrets();

function scanPrivateSecrets(scope, name, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  for (const secret of privateSecrets) {
    if (buffer.indexOf(Buffer.from(secret)) !== -1) {
      findings.push({ scope, name, kind: 'exact-local-private-key' });
      break;
    }
  }
}

function findSevenZip() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'electron-winstaller', 'vendor', '7z.exe'),
    path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  ];
  try {
    for (const entry of fs.readdirSync(path.join(ROOT, 'node_modules', '.pnpm'))) {
      if (entry.startsWith('electron-winstaller@')) {
        candidates.push(path.join(ROOT, 'node_modules', '.pnpm', entry, 'node_modules', 'electron-winstaller', 'vendor', '7z.exe'));
      }
      if (entry.startsWith('7zip-bin@')) {
        candidates.push(path.join(ROOT, 'node_modules', '.pnpm', entry, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'));
      }
    }
  } catch { /* pnpm virtual store is optional */ }
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function walkFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function scanExtractedArtifact(archivePath, sevenZip) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-release-audit-'));
  const queues = [{ archive: archivePath, output: path.join(tempRoot, 'root'), depth: 0 }];
  try {
    while (queues.length) {
      const item = queues.shift();
      fs.mkdirSync(item.output, { recursive: true });
      const extracted = spawnSync(sevenZip, ['x', '-y', `-o${item.output}`, item.archive], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 120000
      });
      if (extracted.status !== 0) {
        if (item.depth === 0) findings.push({ scope: 'artifact', name: path.relative(ROOT, archivePath), kind: 'archive-scan-failed' });
        continue;
      }
      for (const filePath of walkFiles(item.output)) {
        const relative = path.relative(item.output, filePath).replace(/\\/g, '/');
        if (/(?:^|\/)(?:\.credentials\.yaml|settings\.yaml|\.env)$/i.test(relative)) {
          findings.push({ scope: 'artifact-entry', name: `${path.basename(archivePath)}:${relative}`, kind: 'private-config-file' });
        }
        let stat;
        try { stat = fs.statSync(filePath); } catch { continue; }
        if (stat.size > MAX_ARTIFACT_FILE) continue;
        let data;
        try { data = fs.readFileSync(filePath); } catch { continue; }
        checked.extractedFiles++;
        scanPrivateSecrets('artifact-entry', `${path.basename(archivePath)}:${relative}`, data);
        if (!data.includes(0) || /\.asar$/i.test(filePath)) {
          scanText('artifact-entry', `${path.basename(archivePath)}:${relative}`, data.toString('utf8'));
        }
        if (item.depth < 2 && /\.(?:7z|zip)$/i.test(filePath)) {
          queues.push({ archive: filePath, output: `${filePath}.expanded`, depth: item.depth + 1 });
        }
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT })
    .toString().split('\0').filter(Boolean);
}

for (const relative of trackedFiles()) {
  const filePath = path.join(ROOT, relative);
  let data;
  try { data = fs.readFileSync(filePath); } catch { continue; }
  checked.sourceFiles++;
  scanPrivateSecrets('source', relative, data);
  if (!data.includes(0)) scanText('source', relative, data.toString('utf8'));
}

try {
  const objectLines = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split(/\r?\n/).filter(Boolean);
  const objectNames = new Map();
  for (const line of objectLines) {
    const [oid, ...name] = line.split(' ');
    if (!objectNames.has(oid)) objectNames.set(oid, name.join(' ') || '(unnamed)');
  }
  const ids = [...objectNames.keys()];
  const metadata = spawnSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    cwd: ROOT, input: ids.join('\n') + '\n', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  if (metadata.status !== 0) throw new Error('git cat-file metadata failed');
  for (const line of metadata.stdout.trim().split(/\r?\n/)) {
    const [oid, type, sizeText] = line.split(' ');
    if (type !== 'blob' || Number(sizeText) > MAX_HISTORY_BLOB) continue;
    const data = execFileSync('git', ['cat-file', 'blob', oid], { cwd: ROOT, maxBuffer: MAX_HISTORY_BLOB + 1024 });
    checked.historyBlobs++;
    const name = objectNames.get(oid) || '(unnamed)';
    scanPrivateSecrets('history', name, data);
    if (!data.includes(0)) scanText('history', name, data.toString('utf8'));
  }
} catch (error) {
  findings.push({ scope: 'history', name: '(git)', kind: 'scan-failed' });
}

if (!SOURCE_ONLY) {
  const sevenZip = findSevenZip();
  const artifactPaths = [
    path.join(ARTIFACT_ROOT, 'win-unpacked', 'resources', 'app.asar'),
    ...(() => {
      try {
        return fs.readdirSync(ARTIFACT_ROOT)
          .filter(name => /\.(?:exe|zip)$/i.test(name))
          .map(name => path.join(ARTIFACT_ROOT, name));
      } catch { return []; }
    })()
  ];
  for (const filePath of artifactPaths) {
    if (!fs.existsSync(filePath)) continue;
    const data = fs.readFileSync(filePath);
    const name = path.relative(ROOT, filePath);
    checked.artifacts++;
    scanPrivateSecrets('artifact', name, data);
    if (filePath.endsWith('.asar')) scanText('artifact', name, data.toString('utf8'));
    if (/\.(?:exe|zip)$/i.test(filePath)) {
      if (sevenZip) scanExtractedArtifact(filePath, sevenZip);
      else findings.push({ scope: 'artifact', name, kind: 'archive-scanner-missing' });
    }
  }
}

const uniqueFindings = [...new Map(findings.map(finding => [`${finding.scope}:${finding.name}:${finding.kind}`, finding])).values()];
console.log(JSON.stringify({
  ok: uniqueFindings.length === 0,
  checked,
  privateSecretsLoaded: privateSecrets.length,
  findings: uniqueFindings
}));
process.exit(uniqueFindings.length ? 1 : 0);
