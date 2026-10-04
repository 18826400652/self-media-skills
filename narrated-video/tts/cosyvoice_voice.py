"""阿里云百炼 CosyVoice 自定义音色管理：声音设计（文字描述生成音色）、列出、删除。

用法：
  python cosyvoice_voice.py design --model cosyvoice-v3.5-flash --prefix chatm \\
      --prompt "二十多岁的男生，声音清爽，像跟同事聊天" --preview "预览用的一句话" [--out 预览.wav]
  python cosyvoice_voice.py list [--prefix chatm]
  python cosyvoice_voice.py delete <voice_id>

生成的 voice_id 填进项目配置 tts.voice，tts.model 必须与 --model 一致。
v3.5 系列只能用自定义音色（声音设计或复刻），且支持任意文字的语气指令。
密钥：环境变量 DASHSCOPE_API_KEY。接口文档：https://help.aliyun.com/zh/model-studio/voice-design-api-references
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

ENDPOINT = os.environ.get(
    "DASHSCOPE_CUSTOMIZATION_URL",
    "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization",
)


def call(payload: dict) -> dict:
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        sys.exit("缺少环境变量 DASHSCOPE_API_KEY")
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        sys.exit(f"请求失败 {err.code}：{err.read().decode('utf-8', 'replace')[:500]}")


def design(args: argparse.Namespace) -> None:
    result = call(
        {
            "model": "voice-enrollment",
            "input": {
                "action": "create_voice",
                "target_model": args.model,
                "voice_prompt": args.prompt,
                "preview_text": args.preview,
                "prefix": args.prefix,
                "language_hints": ["zh"],
            },
            "parameters": {"sample_rate": 24000, "response_format": "wav"},
        }
    )
    output = result.get("output", {})
    if args.out and output.get("preview_audio", {}).get("data"):
        with open(args.out, "wb") as f:
            f.write(base64.b64decode(output["preview_audio"]["data"]))
    print(output.get("voice_id") or json.dumps(result, ensure_ascii=False))


def list_voices(args: argparse.Namespace) -> None:
    payload = {"model": "voice-enrollment", "input": {"action": "list_voice", "page_size": 100}}
    if args.prefix:
        payload["input"]["prefix"] = args.prefix
    print(json.dumps(call(payload).get("output", {}), ensure_ascii=False, indent=2))


def delete(args: argparse.Namespace) -> None:
    call({"model": "voice-enrollment", "input": {"action": "delete_voice", "voice_id": args.voice_id}})
    print(f"已删除 {args.voice_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("design", help="用文字描述生成音色")
    p.add_argument("--model", required=True, help="目标模型，如 cosyvoice-v3.5-flash")
    p.add_argument("--prefix", required=True, help="音色名前缀，字母数字，最多 10 个字符")
    p.add_argument("--prompt", required=True, help="声音描述，最多 500 字")
    p.add_argument("--preview", required=True, help="预览文本，15-200 字")
    p.add_argument("--out", help="保存预览音频的路径（.wav）")
    p.set_defaults(func=design)

    p = sub.add_parser("list", help="列出自定义音色")
    p.add_argument("--prefix")
    p.set_defaults(func=list_voices)

    p = sub.add_parser("delete", help="删除自定义音色")
    p.add_argument("voice_id")
    p.set_defaults(func=delete)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
