// 越框检查（scripts/bounds.py）：用合成的「干净画面」（黑底，只有内容）测
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SKILL = fileURLToPath(new URL("../", import.meta.url));
const PYTHON = join(SKILL, ".venv", "bin", "python");
const opt = { skip: existsSync(PYTHON) ? false : "没有 .venv" };

/** 黑底 1080×1920，画几个矩形：[x0, y0, x1, y1, 灰度] */
function image(dir, name, rects) {
  const file = join(dir, name);
  const code = `from PIL import Image, ImageDraw
im = Image.new("RGB", (1080, 1920), (0, 0, 0))
d = ImageDraw.Draw(im)
for x0, y0, x1, y1, v in ${JSON.stringify(rects)}:
    d.rectangle([x0, y0, x1, y1], fill=(v, v, v))
im.save(${JSON.stringify(file)})`;
  execFileSync(PYTHON, ["-c", code]);
  return file;
}

const run = (frames) => JSON.parse(execFileSync(PYTHON, [join(SKILL, "scripts", "bounds.py")], { input: JSON.stringify(frames), encoding: "utf8" }));

test("bounds.py：内容在框里不报；面板伸出框底、占了角标行、伸出右侧都报，并给出越界的范围", opt, () => {
  const dir = mkdtempSync(join(tmpdir(), "nv-bounds-"));
  const ok = image(dir, "ok.png", [[60, 330, 1020, 1150, 30]]);
  const low = image(dir, "low.png", [[60, 340, 1020, 1230, 30]]); // 玻璃面板很暗（灰度 30）也要算
  const top = image(dir, "top.png", [[60, 280, 1020, 900, 30]]);
  const side = image(dir, "side.png", [[60, 400, 1070, 900, 200]]);
  const r = run([
    { file: ok, frame: 1, kicker: true },
    { file: low, frame: 2, kicker: true },
    { file: top, frame: 3, kicker: true },
    { file: top, frame: 4, kicker: false }, // 不显示角标的帧：角标行可以用
    { file: side, frame: 5, kicker: true },
  ]);
  assert.deepEqual(r.map((x) => [x.frame, x.zones.map((z) => z.zone)]), [[2, ["bottom"]], [3, ["kicker"]], [5, ["side"]]]);
  assert.deepEqual(r[0].zones[0].box, [60, 1166, 1020, 1230]);
});
