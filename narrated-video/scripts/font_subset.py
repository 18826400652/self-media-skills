"""把分片的网页字体（按 unicode-range 拆成很多 woff2，如 Google Fonts 的中文字体）合并成「只含用到的字」的小字体。

用法：python font_subset.py <分片目录> <字重> <文本文件> <输出.woff2>
  分片目录里的文件名形如 <字重>-normal-<hash>.woff2（HyperFrames 的字体缓存 ~/.cache/hyperframes/fonts/<字体>/ 就是这样）。
  文本文件：需要的全部文字（UTF-8），重复字符无所谓。
输出 woff2 只包含这些字，通常几十 KB。缺字会列出来并以退出码 3 结束。
"""

import sys
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ALWAYS = "".join(chr(c) for c in range(0x20, 0x7F))  # 基本 ASCII 总是带上


def pick_files(files: list[Path], chars: set[str]) -> dict[Path, set[str]]:
    """为每个字找到包含它的分片文件，按文件分组。"""
    remaining = set(chars)
    picked: dict[Path, set[str]] = {}
    for f in files:
        if not remaining:
            break
        cmap = TTFont(f, lazy=True).getBestCmap()
        hit = {c for c in remaining if ord(c) in cmap}
        if hit:
            picked[f] = hit
            remaining -= hit
    return picked, remaining


def subset_to_ttf(src: Path, chars: set[str], weight: int, out: Path) -> None:
    options = subset.Options()
    options.flavor = None
    # 合并只需要字形本身：去掉排版特性和可变字体的元数据（不同分片之间无法合并，中文也用不到）
    options.layout_features = []
    options.drop_tables += ["GSUB", "GPOS", "GDEF", "HVAR", "VVAR", "MVAR", "STAT", "BASE", "JSTF"]
    options.notdef_outline = True
    font = subset.load_font(str(src), options)
    if "fvar" in font:
        # 分片往往是可变字体（默认实例是最细的 Thin），先固定到需要的字重
        font = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=False)
        font["OS/2"].usWeightClass = weight
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)
    font.save(str(out))


def main() -> int:
    if len(sys.argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    src_dir, weight, text_file, out_file = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4])
    files = sorted(src_dir.glob(f"{weight}-normal-*.woff2"))
    if not files:
        print(f"{src_dir} 里没有字重 {weight} 的分片", file=sys.stderr)
        return 2
    chars = {c for c in text_file.read_text(encoding="utf-8") + ALWAYS if c.isprintable() and not c.isspace()}
    picked, missing = pick_files(files, chars)

    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, (f, hit) in enumerate(picked.items()):
            part = Path(tmp) / f"part{i}.ttf"
            subset_to_ttf(f, hit, int(weight), part)
            parts.append(str(part))
        merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
        merged.flavor = "woff2"
        merged.save(str(out_file))

    real_missing = sorted(c for c in missing if c not in ALWAYS)
    if real_missing:
        print(f"缺字（字体里没有）：{''.join(real_missing)}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
