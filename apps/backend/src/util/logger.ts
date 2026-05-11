import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal dual-target logger.
 *
 * Writes every log line to both:
 *   1. stdout (so you see it live in the terminal / tsx watch output)
 *   2. <repo-root>/logs/backend.log (so you have a persistent record to grep)
 *
 * File writes are best-effort and non-blocking — if the disk is full or
 * the path is unwritable, we silently drop the file write rather than
 * crash the process. The console output still happens.
 *
 * Production note: this is a deliberately tiny logger. If we ever need
 * structured logging, log levels controlled by env, or rotation,
 * swap for `pino` — drop-in for `logger.info/.warn/.error`.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// From apps/backend/src/util/logger.ts → repo root is 4 levels up
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const LOG_DIR = join(REPO_ROOT, "logs");
const LOG_FILE = join(LOG_DIR, "backend.log");

let logDirReady: Promise<void> | null = null;

/**
 * On first call, ensures the logs dir exists AND truncates the log file
 * so each backend run starts with a clean log. This is preferred for dev
 * (less noise from old runs); for production replace with rotation.
 */
function ensureLogDir(): Promise<void> {
  if (!logDirReady) {
    logDirReady = (async () => {
      await mkdir(LOG_DIR, { recursive: true });
      await writeFile(LOG_FILE, ""); // truncate
    })();
  }
  return logDirReady;
}

type Level = "INFO" | "WARN" | "ERROR";

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level: Level, args: unknown[]): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${args.map(formatArg).join(" ")}`;

  // Always console — keeps the existing dev experience identical
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);

  // Append to file, fire-and-forget. Errors here must not kill the app.
  ensureLogDir()
    .then(() => appendFile(LOG_FILE, line + "\n"))
    .catch(() => {
      /* swallow */
    });
}

export const logger = {
  info: (...args: unknown[]): void => write("INFO", args),
  warn: (...args: unknown[]): void => write("WARN", args),
  error: (...args: unknown[]): void => write("ERROR", args),
  /** Returns the absolute path of the log file (handy for debugging). */
  filePath: (): string => LOG_FILE,
};
