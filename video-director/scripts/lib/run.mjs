import { spawnSync } from "node:child_process";

/** 跑子进程；自动带 NODE_USE_ENV_PROXY=1（本机走代理，Node 的 fetch 默认不读代理变量） */
export function run(cmd, args, { cwd } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error?.message || "") };
}
