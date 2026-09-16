// Disposable localhost MySQL only. Never uses an existing DATABASE_URL or loads .env.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import mysql from "mysql2/promise";
const root = path.resolve(import.meta.dirname, ".."),
  work = path.join(root, ".local-test");
await mkdir(work, { recursive: true });
const directory = await mkdtemp(path.join(work, "mysql-")),
  data = path.join(directory, "data");
const binary =
  process.env.ARENA_TEST_MYSQLD ||
  (process.platform === "win32"
    ? "C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe"
    : "mysqld");
function mysqlProcess(args) {
  const child = spawn(binary, args, {
    cwd: directory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stderr.on("data", (b) => {
    output += b;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  return { child, done, output: () => output };
}
const init = mysqlProcess([
  "--no-defaults",
  "--initialize-insecure",
  `--datadir=${data}`,
]);
if ((await init.done) !== 0) throw new Error(init.output());
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = mysqlProcess([
  "--no-defaults",
  `--datadir=${data}`,
  "--bind-address=127.0.0.1",
  `--port=${port}`,
  "--mysqlx=0",
  "--skip-log-bin",
  "--default-time-zone=+00:00",
  "--innodb-buffer-pool-size=64M",
]);
server.done.catch(() => {});
let connection;
try {
  for (let i = 0; i < 100; i++) {
    if (server.child.exitCode !== null) throw new Error(server.output());
    try {
      connection = await mysql.createConnection({
        host: "127.0.0.1",
        port,
        user: "root",
        connectTimeout: 500,
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!connection) throw new Error("Disposable MySQL unavailable");
  const [[actual]] = await connection.query(
    "SELECT @@datadir AS directory, @@port AS port",
  );
  if (
    path.resolve(actual.directory).toLowerCase() !==
      path.resolve(data).toLowerCase() ||
    actual.port !== port
  )
    throw new Error("Disposable MySQL identity mismatch");
  const password = randomBytes(24).toString("hex");
  await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [
    password,
  ]);
  await connection.query("CREATE DATABASE arena_test");
  await connection.query(
    "CREATE USER 'arena_test'@'127.0.0.1' IDENTIFIED BY ?",
    [password],
  );
  await connection.query(
    "GRANT ALL ON arena_test.* TO 'arena_test'@'127.0.0.1'",
  );
  const env = {
    ...process.env,
    DATABASE_URL: `mysql://arena_test:${password}@127.0.0.1:${port}/arena_test`,
    ARENA_MODE: "legacy",
    ARENA_DEMO: "false",
    ARENA_WORKER: "false",
    ARENA_GAME_ID: "",
    ARENA_PRIVATE_KEY: "",
    ARENA_INTERNAL_KEY: "",
    ELEVENLABS_API_KEY: "",
    ARENA_ENV_FILE: path.join(directory, "unused.env"),
  };
  for (const args of [
    ["--import", "tsx", "src/server/migrate.ts"],
    ["--import", "tsx", "--test", "integration/*.test.ts"],
  ]) {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: "inherit",
    });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (code !== 0) {
      process.exitCode = code ?? 1;
      break;
    }
  }
} finally {
  if (connection) {
    try {
      await connection.query("SHUTDOWN");
    } catch {}
    await connection.end();
  }
  const stopped = await Promise.race([
    server.done.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped) {
    server.child.kill();
    await server.done;
  }
  await writeFile(path.join(directory, "server-output.txt"), server.output());
  console.log(
    `Disposable MySQL stopped; diagnostics: ${path.relative(root, directory)}`,
  );
}
