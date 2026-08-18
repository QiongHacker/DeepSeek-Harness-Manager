'use strict';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SENSITIVE_CONFIG_KEY = /(?:api.?key|secret|password|authorization|access.?token|refresh.?token)/i;
const LEGACY_UNTRUSTED_DEFAULT_MIRRORS = new Set([
  'https://ghfast.top/https://github.com/deepseek-ai/deepseek-harness.git'
]);

function parseSafeUrl(value, { httpsOnly = false, allowLoopbackHttp = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048 || /[\0\r\n]/.test(raw)) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol === 'https:') return parsed.href;
  if (!httpsOnly && allowLoopbackHttp && parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) return parsed.href;
  return null;
}

function sanitizeExternalUrl(value) {
  return parseSafeUrl(value, { httpsOnly: true });
}

function sanitizeRendererConfigPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'invalid-config' };
  const keys = Object.keys(patch);
  if (keys.length !== 1) return { ok: false, reason: 'invalid-config' };
  const key = keys[0];
  if (key === 'language' && ['zh-CN', 'en-US'].includes(patch[key])) return { ok: true, patch: { language: patch[key] } };
  if (key === 'openAfterStart' && typeof patch[key] === 'boolean') return { ok: true, patch: { openAfterStart: patch[key] } };
  if (key === 'deployMirrorUrl') {
    const value = String(patch[key] || '').trim();
    if (!value) return { ok: true, patch: { deployMirrorUrl: '' } };
    const safe = parseSafeUrl(value, { httpsOnly: true });
    if (safe) return { ok: true, patch: { deployMirrorUrl: safe } };
  }
  return { ok: false, reason: 'invalid-config' };
}

function sanitizeApiBindingInput(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return { ok: false, reason: 'invalid-api-config' };
  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey || apiKey.length > 4096 || /[\0\r\n]/.test(apiKey)) return { ok: false, reason: 'invalid-api-key' };
  const baseURL = parseSafeUrl(options.baseURL, { allowLoopbackHttp: true });
  if (!baseURL) return { ok: false, reason: 'invalid-base-url' };
  let platformUrl = '';
  if (String(options.platformUrl || '').trim()) {
    platformUrl = sanitizeExternalUrl(options.platformUrl);
    if (!platformUrl) return { ok: false, reason: 'invalid-platform-url' };
  }
  return { ok: true, value: { baseURL, apiKey, platformUrl } };
}

function isSafePluginSpec(value) {
  const spec = String(value || '').trim();
  if (!spec || spec.length > 512 || /[\s\0\r\n&|<>^%!`"'();]/.test(spec)) return false;
  return /^(?:@?[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~-]+)?(?:@[A-Za-z0-9*+._~:/#=-]+)?|(?:git\+https|https):\/\/[^\s]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9_./~-]+)$/.test(spec);
}

function isSafePackageName(value) {
  const name = String(value || '').trim();
  return name.length <= 214 && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name);
}

function redactSensitiveText(value, knownSecrets = []) {
  let text = String(value == null ? '' : value);
  for (const secret of knownSecrets) {
    const raw = String(secret || '');
    if (raw.length >= 6) text = text.split(raw).join('[REDACTED]');
  }
  text = text
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, 'sk-[REDACTED]')
    .replace(/\b(?:github_pat_|ghp_|glpat-|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED-TOKEN]')
    .replace(/((?:api[_-]?key|authorization|bearer|DEEPSEEK_API_KEY|token|secret)\s*[:=]\s*["']?)[^\s"',;]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+(@)/gi, '$1[REDACTED]$2');
  return text;
}

function stripSensitiveConfig(config) {
  const safe = {};
  for (const [key, value] of Object.entries(config && typeof config === 'object' ? config : {})) {
    if (!SENSITIVE_CONFIG_KEY.test(key)) safe[key] = value;
  }
  return safe;
}

function sanitizeStoredServiceConfig(config) {
  const input = stripSensitiveConfig(config);
  const safe = {};
  if (typeof input.checkout === 'string' && input.checkout.length <= 32767) safe.checkout = input.checkout;
  if (Number.isInteger(input.port) && input.port >= 1 && input.port <= 65535) safe.port = input.port;
  if (typeof input.openAfterStart === 'boolean') safe.openAfterStart = input.openAfterStart;
  if (typeof input.dshHome === 'string' && input.dshHome.length <= 32767) safe.dshHome = input.dshHome;
  if (['zh-CN', 'en-US'].includes(input.language)) safe.language = input.language;
  if (typeof input.profile === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.profile)) safe.profile = input.profile;
  if (typeof input.deployMirrorUrl === 'string') {
    const mirror = input.deployMirrorUrl.trim();
    if (!mirror) safe.deployMirrorUrl = '';
    else {
      const parsed = parseSafeUrl(mirror, { httpsOnly: true });
      if (parsed && !LEGACY_UNTRUSTED_DEFAULT_MIRRORS.has(parsed)) safe.deployMirrorUrl = parsed;
      else safe.deployMirrorUrl = '';
    }
  }
  return safe;
}

module.exports = {
  isSafePackageName,
  isSafePluginSpec,
  parseSafeUrl,
  redactSensitiveText,
  sanitizeApiBindingInput,
  sanitizeExternalUrl,
  sanitizeRendererConfigPatch,
  sanitizeStoredServiceConfig,
  stripSensitiveConfig
};
