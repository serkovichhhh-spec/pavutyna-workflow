import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DB_NAME = 'tyama-core';
const CONFIG = new URL('../wrangler.jsonc', import.meta.url);
const cwd = new URL('..', import.meta.url).pathname;

function wrangler(args, options = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function databases() {
  const raw = wrangler(['d1', 'list', '--json'], { capture: true });
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.result)) return parsed.result;
  return [];
}

console.log('Checking Cloudflare authentication...');
wrangler(['auth', 'token', '--json'], { capture: true });

let db = databases().find(item => item?.name === DB_NAME);
if (!db) {
  console.log(`Creating D1 database: ${DB_NAME}`);
  wrangler(['d1', 'create', DB_NAME]);
  db = databases().find(item => item?.name === DB_NAME);
}

if (!db?.uuid) throw new Error(`Could not resolve D1 UUID for ${DB_NAME}`);

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
config.d1_databases = [{
  binding: 'DB',
  database_name: DB_NAME,
  database_id: db.uuid,
  migrations_dir: './migrations',
}];
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Bound D1 ${DB_NAME} (${db.uuid}) in wrangler.jsonc`);

console.log('Generating binding types...');
wrangler(['types']);
console.log('Applying remote migrations...');
wrangler(['d1', 'migrations', 'apply', DB_NAME, '--remote']);
console.log('Running deploy dry-run...');
wrangler(['deploy', '--dry-run']);
console.log('Deploying Worker...');
wrangler(['deploy']);
console.log('TYAMA Cloudflare foundation deployed.');
