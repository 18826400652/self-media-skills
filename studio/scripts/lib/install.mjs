// st install：把工具包里的每个 skill 注册给 Claude Code（~/.claude/skills/<名字>），命令放进 ~/.local/bin。
// 已有的软链接直接改指向；同名的真实目录或文件不动，报出来让人处理。加 --deps 顺便装依赖。
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TOOLKIT_DIR, VO_PY } from "./project.mjs";
import { toolkitSkills } from "./doctor.mjs";


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

/** 真的跑命令（输出直接给终端，下载进度看得到） */
function spawnRun(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: "inherit" }).status === 0;
}

function installDeps(skill, dir, log, run) {
  const sh = (cmd, args) => {
    log(`  $ (${dir}) ${cmd} ${args.join(" ")}`);
    const ok = run(cmd, args, dir);
    if (!ok) log(`  ✗ ${skill}：${cmd} ${args[0]} 失败`);
    return ok;
  };
  const steps = [];
  if (existsSync(join(dir, "package-lock.json"))) steps.push(() => sh("npm", ["ci"]));
  const pip = (pkgs) => () => sh("uv", ["venv", "--allow-existing", ".venv"]) && sh("uv", ["pip", "install", "--python", ".venv/bin/python", ...pkgs]);
  if (existsSync(join(dir, "requirements.txt"))) steps.push(pip(["-r", "requirements.txt"]));
  if (skill === "voiceover") steps.push(pip(VO_PY));
  if (!steps.length) return true;
  log(`▸ 装 ${skill} 的依赖（npm / uv 要联网下载，网络慢时可能要几分钟；卡住可以 Ctrl+C，之后跑 st doctor 看缺什么）`);
  return steps.reduce((ok, step) => step() && ok, true);
}

/** 指向本工具包、但目标已经不存在的软链接（比如已删掉的旧 skill 及其命令）删掉；指向别处的不动 */
function pruneStale(dir, toolkit, log) {
  for (const name of readdirSync(dir)) {
    const at = join(dir, name);
    let target;
    try {
      if (!lstatSync(at).isSymbolicLink()) continue;
      target = readlinkSync(at);
    } catch { continue; }
    if (!target.startsWith(`${toolkit}/`) || existsSync(at)) continue;
    unlinkSync(at);
    log(`  − ${at}（指向已删除的 ${target}）`);
  }
}

export function install({ deps = false, home = homedir(), toolkit = TOOLKIT_DIR, log = console.log, run = spawnRun } = {}) {
  const skillsDir = join(home, ".claude/skills");
  const binDir = join(home, ".local/bin");
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  let ok = true;
  const depsFailed = [];
  for (const s of toolkitSkills(toolkit)) {
    const dir = join(toolkit, s);
    ok = link(dir, join(skillsDir, s), log) && ok;
    const bin = join(dir, "bin");
    if (existsSync(bin)) for (const f of readdirSync(bin)) ok = link(join(bin, f), join(binDir, f), log) && ok;
    if (deps && !installDeps(s, dir, log, run)) depsFailed.push(s);
  }
  pruneStale(skillsDir, toolkit, log);
  pruneStale(binDir, toolkit, log);
  if (depsFailed.length) {
    ok = false;
    log(`✗ 这些 skill 的依赖没装好：${depsFailed.join("、")}。网络好了重跑 st install --deps，或在作品项目里跑 st doctor 逐个看缺哪个包`);
  }
  log(ok ? `✓ 已指向 ${toolkit}${deps ? "，依赖已装" : "（没检查依赖：缺什么在作品项目里跑 st doctor 看，要装加 --deps）"}；下一步在作品项目里跑 st doctor` : "✗ 有几项没装好，看上面");
  if (!process.env.PATH.split(":").includes(binDir)) log(`⚠ ${binDir} 不在 PATH 上，要加进 shell 配置`);
  return ok ? 0 : 1;
}
