// st test：一次跑完工具包里所有测试套件，逐个给出通过数、失败数，跳过的说清原因和怎么装。
//   Node：tests/ 里有 *.test.mjs 的目录（不要求 package.json；有 dependencies 时才查 node_modules）
//   Python：tests/ 里有 test_*.py 的目录，用自己的 .venv，没有就借 phone-draft 的（browser-draft 就是这样）
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasShared, syncShared } from "./shared-sync.mjs";

const PY_FALLBACK = "phone-draft/.venv/bin/python";
const SKIP_DIRS = new Set(["node_modules", "docs"]);
const NAME_WIDTH = 18;

const files = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : []);
const readPkg = (dir) => {
  const p = join(dir, "package.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

/** 工具包里的测试套件：{ name, kind, dir, files, skip? } */
export function findSuites(toolkit) {
  const dirs = readdirSync(toolkit, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)).map((e) => e.name).sort();
  return dirs.flatMap((name) => {
    const dir = join(toolkit, name);
    const tests = join(dir, "tests");
    const pkg = readPkg(dir);
    const nodeFiles = files(tests, /\.test\.mjs$/);
    if (nodeFiles.length) {
      const needsDeps = Object.keys(pkg?.dependencies ?? {}).length && !existsSync(join(dir, "node_modules"));
      return [{ name, kind: "node", dir, files: nodeFiles.map((f) => join("tests", f)), ...(needsDeps ? { skip: `缺依赖，先 cd ${name} && npm ci` } : {}) }];
    }
    if (files(tests, /^test_.*\.py$/).length) {
      const python = [join(dir, ".venv/bin/python"), join(toolkit, PY_FALLBACK)].find(existsSync);
      return [{ name, kind: "python", dir, python, ...(python ? {} : { skip: `没有 Python 环境（${name}/.venv 和 ${PY_FALLBACK} 都没有，见各 skill 的 SKILL.md）` }) }];
    }
    return [];
  });
}

const count = (text, re) => Number(text.match(re)?.[1] ?? 0);
// 在 node --test 里再跑 node --test 时，子进程会继承 NODE_TEST_CONTEXT，改用给父进程看的格式；去掉它才是正常输出
const { NODE_TEST_CONTEXT, ...cleanEnv } = process.env;

/** node --test 的参数：强制 TAP，Node 24 默认的 spec reporter 里没有 # pass，数不出来 */
export const nodeTestArgs = (files) => ["--test", "--test-reporter=tap", ...files];

/** 跑一个套件：{ pass, fail, failed（失败的用例名）, error（跑不起来时的输出） } */
function runSuite(s) {
  const r = s.kind === "node"
    ? spawnSync(process.execPath, nodeTestArgs(s.files), { cwd: s.dir, env: cleanEnv, encoding: "utf8" })
    : spawnSync(s.python, ["-m", "pytest", "-q"], { cwd: s.dir, env: cleanEnv, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (s.kind === "node") {
    const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
    return { pass: count(out, /^# pass (\d+)/m), fail: count(out, /^# fail (\d+)/m), failed, ok: r.status === 0 };
  }
  const failed = [...out.matchAll(/^FAILED (\S+)/gm)].map((m) => m[1]);
  return { pass: count(out, /(\d+) passed/), fail: count(out, /(\d+) failed/) + count(out, /(\d+) errors?/), failed, ok: r.status === 0, tail: out.trim().split("\n").slice(-5).join("\n") };
}

const pad = (s) => s.padEnd(NAME_WIDTH);

/** 跑全部（或 only 点名的）套件，打印汇总；有失败返回 1，strict 时跳过也算失败 */
export function testAll({ toolkit, only = [], strict = false, log = console.log }) {
  const all = findSuites(toolkit);
  const unknown = only.filter((n) => !all.some((s) => s.name === n));
  if (unknown.length) throw new Error(`没有这个套件：${unknown.join("、")}（有：${all.map((s) => s.name).join("、")}）`);
  const suites = only.length ? all.filter((s) => only.includes(s.name)) : all;
  let failures = 0, skips = 0, total = 0;
  for (const s of suites) {
    if (s.skip) { skips++; log(`⚠ ${pad(s.name)}跳过：${s.skip}`); continue; }
    const r = runSuite(s);
    total += r.pass;
    if (r.ok && !r.fail) { log(`✓ ${pad(s.name)}${r.pass} 通过`); continue; }
    failures++;
    log(`✗ ${pad(s.name)}${r.pass} 通过 ${r.fail} 失败`);
    for (const name of r.failed) log(`    · ${name}`);
    if (!r.failed.length && r.tail) log(r.tail.replace(/^/gm, "    "));
  }
  if (!only.length && hasShared(toolkit)) {
    const { problems } = syncShared({ toolkit, check: true });
    if (problems.length) { failures++; log(`✗ ${pad("sync-shared")}和 shared/ 正本不一致：${problems.join("；")}（改正本再 st sync-shared）`); }
    else log(`✓ ${pad("sync-shared")}和 shared/ 正本一致`);
  }
  const summary = `共 ${total} 个用例通过${failures ? `，${failures} 个套件失败` : ""}${skips ? `，${skips} 个套件跳过` : ""}`;
  log(failures ? `✗ ${summary}` : skips ? `⚠ ${summary}${strict ? "（--strict：跳过也算失败）" : ""}` : `✓ ${summary}`);
  return failures || (strict && skips) ? 1 : 0;
}
