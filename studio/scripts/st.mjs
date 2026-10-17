#!/usr/bin/env node
// st：自媒体工具包的总入口。
//   st doctor [--online]        检查作品项目和工具包（在作品项目里跑）
//   st new <系列> <简称> [...]   新建一期作品（st new --help 看参数）
//   st init <目录> [--account 账号名] [--audience 目标观众]   建一个新的作品项目
//   st confirm account "原话" | st confirm series <系列> "原话"   用户明确通过账号方向 / 系列说明后记下
//   st series add <系列名> [--label 显示名] [--unit 期] [--type practical|concept]   登记新系列，建系列说明
//   st install [--deps]         把 skill 注册给 Claude Code、命令放进 ~/.local/bin；--deps 顺便装依赖
//   st sync-shared [--check]    把 shared/ 里的正本同步到各 skill（--check 只检查）
//   st review [--since 天数] [--out 文件]   汇总最近的工具问题和偏好候选（在作品项目里跑，默认 7 天）
//   st log-hook                 作品项目的 Claude Code 钩子调用（从 stdin 读），记工具包命令的结果
//   st version                  工具包版本
import { addSeries, confirmAccount, confirmSeries, parseSeriesArgs } from "./lib/direction.mjs";
import { doctor } from "./lib/doctor.mjs";
import { initProject, parseInitArgs } from "./lib/init.mjs";
import { install } from "./lib/install.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { logHook } from "./lib/monitor.mjs";
import { createEpisode, parseArgs, USAGE } from "./lib/new.mjs";
import { loadProject, TOOLKIT_DIR, toolkitVersion } from "./lib/project.mjs";
import { review } from "./lib/review.mjs";
import { syncShared } from "./lib/shared-sync.mjs";

const HELP = `st doctor [--online] | st new <系列> <简称> | st init <目录> [--update] | st confirm account|series … | st series add <系列名> | st install [--deps] | st sync-shared [--check] | st review [--since 天数] [--out 文件] | st version`;

function reviewCmd(args) {
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const since = Number(opt("--since") ?? 7);
  if (!(since > 0)) throw new Error(`--since 要写天数（如 7），现在是 ${opt("--since")}`);
  const text = review(loadProject().root, { sinceDays: since });
  const out = opt("--out");
  if (out) { writeFileSync(out, text); console.log(`✓ 写到 ${out}`); } else console.log(text);
  return 0;
}

function confirmCmd([what, ...rest]) {
  const project = loadProject();
  if (what === "account") console.log(confirmAccount(project, rest.join(" ")));
  else if (what === "series") console.log(confirmSeries(project, rest[0], rest.slice(1).join(" ")));
  else throw new Error('用法：st confirm account "用户原话" | st confirm series <系列> "用户原话"');
  return 0;
}

function main([cmd, ...args]) {
  switch (cmd) {
    case "doctor":
      return doctor({ online: args.includes("--online") });
    case "new": {
      if (args.includes("--help") || args.includes("-h")) return console.log(USAGE), 0;
      const { lines } = createEpisode(parseArgs(args));
      lines.forEach((l) => console.log(l));
      return 0;
    }
    case "init":
      initProject(parseInitArgs(args));
      return 0;
    case "install":
      return install({ deps: args.includes("--deps") });
    case "sync-shared": {
      const check = args.includes("--check");
      const { changed, problems } = syncShared({ toolkit: TOOLKIT_DIR, check, log: console.log });
      if (check) {
        problems.forEach((p) => console.log(`  ✗ ${p}`));
        console.log(problems.length ? "✗ 有拷贝和正本不一致：改 shared/ 里的正本，再跑 st sync-shared" : "✓ 各 skill 里的共用代码和 shared/ 正本一致");
        return problems.length ? 1 : 0;
      }
      console.log(changed.length ? `✓ 更新了 ${changed.length} 个拷贝` : "✓ 都是最新的，没有要更新的");
      return 0;
    }
    case "confirm":
      return confirmCmd(args);
    case "series":
      addSeries(loadProject(), parseSeriesArgs(args)).forEach((l) => console.log(l));
      return 0;
    case "review":
      return reviewCmd(args);
    case "log-hook":
      logHook(readFileSync(0, "utf8"));
      return 0;
    case "version":
      return console.log(toolkitVersion()), 0;
    default:
      console.log(HELP);
      return cmd && !["help", "-h", "--help"].includes(cmd) ? 1 : 0;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
}
