const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

function requireDatabaseTls() {
  if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL) return;

  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('Production DATABASE_URL must use PostgreSQL.');
  }

  const sslMode = databaseUrl.searchParams.get('sslmode');
  if (sslMode && !['require', 'verify-ca', 'verify-full'].includes(sslMode.toLowerCase())) {
    throw new Error('Production DATABASE_URL must require TLS.');
  }
  if (!sslMode) databaseUrl.searchParams.set('sslmode', 'require');
  process.env.DATABASE_URL = databaseUrl.toString();
}

function main() {
  try {
    requireDatabaseTls();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid production database configuration.'}\n`);
    process.exit(1);
  }

  const prismaCli = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
  const migration = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  if (migration.error) {
    process.stderr.write(`Unable to start Prisma migrations: ${migration.error.message}\n`);
    process.exit(1);
  }
  if (migration.status !== 0) process.exit(migration.status ?? 1);

  const server = spawn(process.execPath, [path.resolve(__dirname, '../dist/server.js')], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.kill(signal));
  }
  let spawnFailed = false;
  server.on('error', (error) => {
    spawnFailed = true;
    process.stderr.write(`Unable to start API server: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.on('exit', (code) => {
    if (!spawnFailed) process.exitCode = code ?? 1;
  });
}

main();
