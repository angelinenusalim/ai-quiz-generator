import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnvironment({ env = process.env, cwd = process.cwd(), serverDirectory = fileURLToPath(new URL('.', import.meta.url)) } = {}) {
  // Railway injects variables into process.env. Never overwrite those values.
  // Support server/.env and the cwd/.env location used by the original startup.
  return dotenv.config({
    path: [...new Set([path.join(serverDirectory, '.env'), path.join(cwd, '.env')])],
    processEnv: env,
    override: false,
    quiet: true,
  });
}
