// sc rec / sc rec-flow 共用：连接浏览器、把录到的帧编码成 MP4。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromRoot } from "./rec-config.mjs";

/**
 * 浏览器连接地址，按顺序：环境变量 BU_CDP_WS → 配置 rec.cdpPort（浏览器用 --remote-debugging-port 启动，
 * 不弹「允许」，推荐配一个自动化专用的浏览器用户）→ 配置 rec.devtoolsActivePort（DevToolsActivePort 文件，
 * 第 1 行端口、第 2 行路径；在 edge://inspect 勾选远程调试时用，每次新连接都要在浏览器里点允许）
 */
export function cdpEndpoint(config) {
  if (process.env.BU_CDP_WS) return process.env.BU_CDP_WS;
  const port = config.rec?.cdpPort;
  if (port) {
    try {
      const info = JSON.parse(execFileSync("curl", ["-s", "--max-time", "3", `http://127.0.0.1:${port}/json/version`], { encoding: "utf8" }));
      return info.webSocketDebuggerUrl;
    } catch {
      throw new Error(`连不上 127.0.0.1:${port}：先打开用 --remote-debugging-port=${port} 启动的浏览器（如桌面上的自动化专用快捷方式）`);
    }
  }
  const file = fromRoot(config, config.rec?.devtoolsActivePort);
  if (!file || !existsSync(file)) throw new Error("连不上浏览器：设置环境变量 BU_CDP_WS，或在项目配置写 rec.cdpPort / rec.devtoolsActivePort（浏览器需开启远程调试）");
  const [p, path] = readFileSync(file, "utf8").split(/\r?\n/);
  return `ws://127.0.0.1:${p.trim()}${path.trim()}`;
}

/** 帧（带时间戳，文件名 f00000.jpg…）→ 恒定帧率 MP4 */
export function encode(dir, frames, out, fps = 30) {
  if (!frames.length) throw new Error("没有录到画面（页面没有变化，或浏览器没响应）");
  const list = frames.map((t, i) => `file 'f${String(i).padStart(5, "0")}.jpg'\nduration ${Math.max((frames[i + 1] ?? t + 1) - t, 0.001).toFixed(4)}`);
  list.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(join(dir, "list.txt"), `${list.join("\n")}\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `fps=${fps},format=yuv420p`, "-c:v", "libx264", "-crf", "18", out]);
}
