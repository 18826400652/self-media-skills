#!/usr/bin/env node
// st：自媒体工具包的总入口。
//   st doctor [--online]        检查作品项目和工具包（在作品项目里跑）
//   st new <系列> <简称> [...]   新建一期作品（st new --help 看参数）
//   st init <目录> [--account 账号名] [--audience 目标观众]   建一个新的作品项目
//   st install [--deps]         把 skill 注册给 Claude Code、命令放进 ~/.local/bin；--deps 顺便装依赖
//   st sync-shared [--check]    把 shared/ 里的正本同步到各 skill（--check 只检查）
//   st version                  工具包版本
import { doctor } from "./lib/doctor.mjs";
import { initProject, parseInitArgs } from "./lib/init.mjs";
import { install } from "./lib/install.mjs";
import { createEpisode, parseArgs, USAGE } from "./lib/new.mjs";
import { TOOLKIT_DIR, toolkitVersion } from "./lib/project.mjs";
import { syncShared } from "./lib/shared-sync.mjs";

const HELP = `st doctor [--online] | st new <系列> <简称> | st init <目录> | st install [--deps] | st sync-shared [--check] | st version`;

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
