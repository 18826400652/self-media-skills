# 发布文案（Markdown）解析：browser-draft 和 phone-draft 共用。
# 按「## 」分段，段名以「标题」「正文」「话题」开头的分别是标题、正文（按行，连续空行合并为一个空串）、话题（#xx，不带 #）。
import re


class CopyFormatError(ValueError):
    pass


def parse_copy(path):
    sections, current = {}, None
    for line in open(path, encoding="utf-8").read().split("\n"):
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current:
            sections[current].append(line.strip())

    def section(prefix, required=True):
        key = next((k for k in sections if k.startswith(prefix)), None)
        if key is None and required:
            raise CopyFormatError(f"文案里缺少「## {prefix}…」段落：{path}")
        return sections.get(key, [])

    title = next((l for l in section("标题") if l), "")
    if not title:
        raise CopyFormatError(f"文案的「标题」段落是空的：{path}")
    paragraphs = []
    for line in section("正文"):
        if line or (paragraphs and paragraphs[-1] != ""):
            paragraphs.append(line)
    while paragraphs and paragraphs[-1] == "":
        paragraphs.pop()
    topics = re.findall(r"#([^\s#]+)", " ".join(section("话题", required=False)))
    return {"title": title, "paragraphs": paragraphs, "topics": topics}
