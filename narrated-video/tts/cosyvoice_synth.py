"""阿里云百炼 CosyVoice 语音合成：一句文本 → 24kHz 单声道 WAV。由 tts/cosyvoice.mjs 调用。

用法：python cosyvoice_synth.py <模型> <音色> <语速> <输出.wav> [语气指令]   （文本从标准输入读取）
语气指令只有部分音色支持，如 longanyang、longanhuan：「你正在进行闲聊互动，你说话的情感是neutral。」
密钥：环境变量 DASHSCOPE_API_KEY（百炼控制台创建）。
"""

import os
import sys

import dashscope
from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer


def main() -> int:
    if len(sys.argv) not in (5, 6):
        print(__doc__, file=sys.stderr)
        return 2
    model, voice, speed, out_file = sys.argv[1:5]
    instruction = sys.argv[5] if len(sys.argv) == 6 and sys.argv[5] else None
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        print("缺少环境变量 DASHSCOPE_API_KEY（写进项目根目录的 .env）", file=sys.stderr)
        return 2

    text = sys.stdin.read().strip()
    if not text:
        print("文本为空", file=sys.stderr)
        return 2

    dashscope.api_key = api_key
    synthesizer = SpeechSynthesizer(
        model=model,
        voice=voice,
        format=AudioFormat.WAV_24000HZ_MONO_16BIT,
        speech_rate=float(speed),
        instruction=instruction,
    )
    audio = synthesizer.call(text)
    if not audio:
        print(f"合成失败：没有返回音频（request_id={synthesizer.get_last_request_id()}）", file=sys.stderr)
        return 1
    with open(out_file, "wb") as f:
        f.write(audio)
    return 0


if __name__ == "__main__":
    sys.exit(main())
