try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env');
} catch {
  // Production/local environments may provide variables directly.
}

await import('./chat-postgres-bridge.js');
await import('./pg-auth-bootstrap.js');
