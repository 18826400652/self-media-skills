// sc rec / sc rec-flow 的配置：从给定目录往上找 scenario-content.config.json，取其中的 rec 字段。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_NAME = "scenario-content.config.json";

function findUp(startDir) {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_NAME))) return join(dir, CONFIG_NAME);
    if (dirname(dir) === dir) return null;
  }
}

/** @returns {{ root: string, configPath: string | null, rec: object }} */
export function loadRecConfig(startDir = process.cwd()) {
  const configPath = findUp(startDir);
  if (!configPath) return { root: resolve(startDir), configPath: null, rec: {} };
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`${configPath} 不是合法的 JSON：${err.message}`);
  }
  return { root: dirname(configPath), configPath, rec: cfg.rec ?? {} };
}

/** 项目内相对路径 → 绝对路径 */
export const fromRoot = (config, p) => (p ? resolve(config.root, p) : null);
