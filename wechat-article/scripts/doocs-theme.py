#!/usr/bin/env python3
"""把 doocs/md（https://github.com/doocs/md，WTFPL）的公众号主题转成文颜可用的 #wenyan 主题。

用法：
  python3 doocs-theme.py grace --primary '#1f2024' [--extra 适配.css] > ../themes/grace.css

doocs 的主题是「default + 叠加层」：default 是完整样式，grace / simple 在它上面覆盖。
转换做的事：选择器加 #wenyan 前缀、doocs 专用类名换成文颜的元素、
CSS 变量和 calc() 算成具体值（公众号编辑器不认 var / calc / color-mix）、
去掉文颜用不到的规则（GitHub 提示块、公式、mermaid 等）。
--extra 的内容原样追加在最后，用来放项目适配（后写的规则覆盖前面的）。
"""
import argparse
import re
import sys
import urllib.request

REF = "a7c17fc"  # doocs/md 的提交，2026-09-29；升级时改这里再重新生成
URL = f"https://raw.githubusercontent.com/doocs/md/{REF}/packages/shared/src/configs/theme-css/{{}}.css"

FOREGROUND = "#0a0a0a"  # doocs 的 hsl(var(--foreground))，即 hsl(0 0% 3.9%)；要先换成 hex，color-mix 才能算
FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'

SKIP = re.compile(r"alert|katex|markup|mermaid|md-emoji|md-asset|figcaption|\.del\b|:root")
SELECTOR_MAP = [
    (r"\.hljs\.code__pre > code", "pre code"),
    (r"\.hljs\.code__pre", "pre"),
    (r"\.codespan", "p code, li code"),
    (r"p\.footnotes", "#footnotes p"),
]


# doocs 的渲染器会自己往 <li> 里插「• 」「1. 」，所以它的 CSS 关掉了列表符号；文颜不插，要恢复
WENYAN_COMPAT = """/* 文颜兼容：恢复列表符号（doocs 由渲染器插入，文颜靠浏览器默认） */
#wenyan ul {
  list-style: disc;
}

#wenyan ol {
  list-style: decimal;
}

#wenyan li {
  display: list-item;
}

/* 公众号兼容：每个文字块都写明行高，不靠外层 section 继承 */
#wenyan p,
#wenyan ul,
#wenyan ol,
#wenyan li,
#wenyan blockquote,
#wenyan pre,
#wenyan pre code,
#wenyan td,
#wenyan th {
  line-height: 1.75;
}

#wenyan h1,
#wenyan h2,
#wenyan h3,
#wenyan h4,
#wenyan h5,
#wenyan h6 {
  line-height: 2.1;
}"""


def fetch(name):
    with urllib.request.urlopen(URL.format(name), timeout=30) as resp:
        return resp.read().decode("utf-8")


def resolve_values(value, variables):
    value = value.replace("hsl(var(--foreground))", FOREGROUND)

    def var(m):
        name, fallback = m[1], (m[2] or "").strip()
        return variables.get(name, fallback)

    for _ in range(3):  # 回退值里可能嵌套 var()
        value = re.sub(r"var\((--[\w-]+)(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)", var, value)

    def calc(m):
        n1, u1 = re.match(r"([\d.]+)(\w*)", m[1]).groups()
        n2, u2 = re.match(r"([\d.]+)(\w*)", m[3]).groups()
        result = float(n1) * float(n2) if m[2] == "*" else float(n1) / float(n2)
        return f"{round(result, 3):g}{u1 or u2}"

    value = re.sub(r"calc\(\s*([\d.]+\w*)\s*([*/])\s*([\d.]+\w*)\s*\)", calc, value)

    def color_mix(m):  # color-mix(in srgb, #rrggbb N%, transparent) → rgba
        r, g, b = (int(m[1][i:i + 2], 16) for i in (0, 2, 4))
        return f"rgba({r}, {g}, {b}, {int(m[2]) / 100:g})"

    return re.sub(r"color-mix\(in srgb,\s*#([0-9a-fA-F]{6})\s+(\d+)%,\s*transparent\)", color_mix, value)


def convert(css, variables):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    rules = []
    for selector, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        selector = " ".join(selector.split())
        if SKIP.search(selector):
            continue
        for pattern, replacement in SELECTOR_MAP:
            selector = re.sub(pattern, replacement, selector)
        selectors = ",\n".join(f"#wenyan {s.strip()}" for s in selector.split(","))
        body = resolve_values(body, variables).rstrip()
        # font-size: inherit 本来就是默认行为，但公众号「内容结构检测」不认 inherit，
        # 会把含这种加粗的段落报成「行高小于字体大小」，去掉
        body = re.sub(r"\n\s*font-size:\s*inherit;", "", body)
        if re.search(r"var\(|calc\(|color-mix\(", body):
            sys.exit(f"有没算出来的 var / calc / color-mix：{selector} {{{body}}}")
        rules.append(f"{selectors} {{{body}\n}}")
    return "\n\n".join(rules)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("theme", choices=["default", "grace", "simple"])
    parser.add_argument("--primary", default="#0F4C81", help="主色（doocs 默认经典蓝 #0F4C81）")
    parser.add_argument("--font-size", default="16px")
    parser.add_argument("--extra", help="追加在最后的适配 CSS 文件")
    args = parser.parse_args()

    variables = {
        "--md-primary-color": args.primary,
        "--md-font-family": FONT,
        "--md-font-size": args.font_size,
        "--md-line-height": "1.75",
        "--md-block-spacing": "1",
        "--md-link-color": "#576b95",
        "--blockquote-background": "#f7f7f7",
    }
    layers = ["default"] if args.theme == "default" else ["default", args.theme]

    header = f"""/* 由 scripts/doocs-theme.py 生成，不要直接改；适配改 --extra 指定的文件后重新生成。
   来源：doocs/md 主题「{args.theme}」（{REF}，WTFPL），主色 {args.primary}。 */

#wenyan {{
  font-family: {FONT};
  font-size: {args.font_size};
  line-height: 1.75;
  text-align: left;
  color: {FOREGROUND};
}}

#wenyan blockquote {{
  margin-left: 0;
  margin-right: 0;
  margin-top: 0;
}}
"""
    parts = [header] + [convert(fetch(name), variables) for name in layers] + [WENYAN_COMPAT]
    if args.extra:
        with open(args.extra, encoding="utf-8") as f:
            parts.append(f.read())
    # 公众号「内容结构检测」只认 px 行高：无单位的 1.75 或 1.75em 都会被当成 1.75 跟字号比，
    # 报「行高小于字体大小」。按正文字号统一换算成 px（标题在兼容块里另给更大的值）
    base = float(args.font_size.rstrip("px"))

    def to_px(m):
        return f"line-height: {round(float(m[1]) * base)}px{' ' + m[2] if m[2] else ''};"

    print(re.sub(r"line-height:\s*([\d.]+)(?:em)?\s*(!important)?;", to_px, "\n\n".join(parts)))


if __name__ == "__main__":
    main()
