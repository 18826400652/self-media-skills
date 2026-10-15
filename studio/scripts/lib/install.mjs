// st install：把工具包里的每个 skill 注册给 Claude Code（~/.claude/skills/<名字>），命令放进 ~/.local/bin。
// 已有的软链接直接改指向；同名的真实目录或文件不动，报出来让人处理。加 --deps 顺便装依赖。
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TOOLKIT_DIR } from "./project.mjs";
import { toolkitSkills } from "./doctor.mjs";

/** narrated-video 的 Python 依赖（见它的 references/setup.md） */
const NV_PY = ["dashscope", "edge-tts", "kokoro-onnx", "soundfile", "fonttools", "brotli", "pillow"];

function link(target, at, log) {
  let st = null;
  try { st = lstatSync(at); } catch { /* 不存在 */ }
  if (st && !st.isSymbolicLink()) return log(`  ✗ ${at} 是真实文件或目录，没动它（确认不要了再删掉重跑）`), false;
  if (st && readlinkSync(at) === target) return true;
  if (st) unlinkSync(at);
  symlinkSync(target, at);
  log(`  ✓ ${at} → ${target}`);
  return true;
}

function sh(cmd, args, cwd, log) {
  log(`  $ (${cwd}) ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) log(`  ✗ 失败（退出码 ${r.status}）`);
  return r.status === 0;
}

function installDeps(skill, dir, log) {
  let ok = true;
  if (existsSync(join(dir, "package-lock.json"))) ok = sh("npm", ["ci"], dir, log) && ok;
  if (existsSync(join(dir, "requirements.txt"))) {
    ok = sh("uv", ["venv", "--allow-existing", ".venv"], dir, log) && sh("uv", ["pip", "install", "--python", ".venv/bin/python", "-r", "requirements.txt"], dir, log) && ok;
  }
  if (skill === "narrated-video") {
    ok = sh("uv", ["venv", "--allow-existing", ".venv"], dir, log) && sh("uv", ["pip", "install", "--python", ".venv/bin/python", ...NV_PY], dir, log) && ok;
  }
  return ok;
}

export function install({ deps = false, home = homedir(), toolkit = TOOLKIT_DIR, log = console.log } = {}) {
  const skillsDir = join(home, ".claude/skills");
  const binDir = join(home, ".local/bin");
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  let ok = true;
  for (const s of toolkitSkills(toolkit)) {
    const dir = join(toolkit, s);
    ok = link(dir, join(skillsDir, s), log) && ok;
    const bin = join(dir, "bin");
    if (existsSync(bin)) for (const f of readdirSync(bin)) ok = link(join(bin, f), join(binDir, f), log) && ok;
    if (deps) ok = installDeps(s, dir, log) && ok;
  }
  log(ok ? `✓ 已指向 ${toolkit}${deps ? "" : "（依赖没装：要装加 --deps）"}；下一步在作品项目里跑 st doctor` : "✗ 有几项没装好，看上面");
  if (!process.env.PATH.split(":").includes(binDir)) log(`⚠ ${binDir} 不在 PATH 上，要加进 shell 配置`);
  return ok ? 0 : 1;
}
