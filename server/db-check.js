import { checkPostgres, closePostgres } from './postgres.js';

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');
} catch {}

const status = await checkPostgres();
console.log(JSON.stringify(status, null, 2));

if (!status.ok) {
  await closePostgres();
  process.exitCode = 1;
} else {
  await closePostgres();
}
