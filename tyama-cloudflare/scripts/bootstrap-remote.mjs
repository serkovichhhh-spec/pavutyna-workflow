import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.env.TYAMA_REMOTE_ENV || 'acceptance';
if (!['acceptance', 'production'].includes(target)) {
  throw new Error(`Unsupported TYAMA_REMOTE_ENV: ${target}`);
}
if (target === 'production' && process.env.TYAMA_ALLOW_PRODUCTION_BOOTSTRAP !== 'YES') {
  throw new Error('Production bootstrap is locked. Set TYAMA_ALLOW_PRODUCTION_BOOTSTRAP=YES only after explicit production promotion.');
}

const isAcceptance = target === 'acceptance';
const DB_NAME = isAcceptance ? 'tyama-core-acceptance' : 'tyama-core';
const WRANGLER_ENV = isAcceptance ? 'acceptance' : null;
const CONFIG = new URL('../wrangler.jsonc', import.meta.url);
const cwd = new URL('..', import.meta.url).pathname;

function withEnv(args) {
  return WRANGLER_ENV ? [...args, '--env', WRANGLER_ENV] : args;
}

function wrangler(args, options = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: process.env,
  });
}

function databases() {
  const raw = wrangler(['d1', 'list', '--json'], { capture: true });
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.result) ? parsed.result : [];
  return rows.map((item) => ({ ...item, uuid: item?.uuid || item?.id || item?.database_id }));
}

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for remote bootstrap');
}

console.log(`Checking Cloudflare authentication for ${target}...`);
wrangler(['whoami']);

let db = databases().find((item) => item?.name === DB_NAME);
if (!db) {
  console.log(`Creating D1 database: ${DB_NAME}`);
  wrangler(['d1', 'create', DB_NAME]);
  db = databases().find((item) => item?.name === DB_NAME);
}
if (!db?.uuid) throw new Error(`Could not resolve D1 UUID for ${DB_NAME}`);

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const binding = {
  binding: 'DB',
  database_name: DB_NAME,
  database_id: db.uuid,
  migrations_dir: './migrations',
};
if (isAcceptance) {
  config.env ||= {};
  config.env.acceptance ||= { name: 'tyama-core-acceptance' };
  config.env.acceptance.d1_databases = [binding];
} else {
  config.d1_databases = [binding];
}
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Bound D1 ${DB_NAME} (${db.uuid}) for ${target}`);

console.log('Generating binding types...');
wrangler(withEnv(['types']));
console.log('Applying remote migrations...');
wrangler(withEnv(['d1', 'migrations', 'apply', DB_NAME, '--remote']));
console.log('Running deploy dry-run...');
wrangler(withEnv(['deploy', '--dry-run']));
console.log(`Deploying Worker to ${target}...`);
wrangler(withEnv(['deploy']));
console.log(`TYAMA Cloudflare ${target} foundation deployed.`);
