"""阿里云百炼 CosyVoice 语音合成：一句文本 → 24kHz 单声道 WAV（可选输出逐字时间戳）。由 tts/cosyvoice.mjs 调用。

用法：python cosyvoice_synth.py <模型> <音色> <语速> <输出.wav> [语气指令] [逐字时间戳.json]   （文本从标准输入读取）
语气指令只有部分音色支持，如 longanyang、longanhuan：「你正在进行闲聊互动，你说话的情感是neutral。」
逐字时间戳：[{ "text": "八", "start": 0.69, "end": 0.945 }, ...]，单位秒，相对这段音频开头。
密钥：环境变量 DASHSCOPE_API_KEY（百炼控制台创建）。
"""

import json
import os
import sys
import threading

import dashscope
from dashscope.audio.tts_v2 import AudioFormat, ResultCallback, SpeechSynthesizer

TIMEOUT_SECONDS = 120


class Collector(ResultCallback):
    """收集音频数据和逐字时间戳（同一句的时间戳会多次推送，保留最后一次的完整列表）。"""

    def __init__(self) -> None:
        self.audio = bytearray()
        self.words: list = []
        self.error: str | None = None
        self.done = threading.Event()

    def on_data(self, data: bytes) -> None:
        self.audio += data

    def on_event(self, message: str) -> None:
        sentence = json.loads(message).get("payload", {}).get("output", {}).get("sentence") or {}
        if sentence.get("words"):
            self.words = sentence["words"]

    def on_complete(self) -> None:
        self.done.set()

    def on_error(self, message) -> None:
        self.error = str(message)
        self.done.set()


def main() -> int:
    if len(sys.argv) not in (5, 6, 7):
        print(__doc__, file=sys.stderr)
        return 2
    model, voice, speed, out_file = sys.argv[1:5]
    instruction = sys.argv[5] if len(sys.argv) >= 6 and sys.argv[5] else None
    words_file = sys.argv[6] if len(sys.argv) == 7 and sys.argv[6] else None
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        print("缺少环境变量 DASHSCOPE_API_KEY（写进项目根目录的 .env）", file=sys.stderr)
        return 2

    text = sys.stdin.read().strip()
    if not text:
        print("文本为空", file=sys.stderr)
        return 2

    dashscope.api_key = api_key
    collector = Collector()
    synthesizer = SpeechSynthesizer(
        model=model,
        voice=voice,
        format=AudioFormat.WAV_24000HZ_MONO_16BIT,
        speech_rate=float(speed),
        instruction=instruction,
        callback=collector,
        additional_params={"word_timestamp_enabled": True},
    )
    synthesizer.call(text)
    if not collector.done.wait(TIMEOUT_SECONDS):
        print(f"合成超时（{TIMEOUT_SECONDS} 秒）", file=sys.stderr)
        return 1
    if collector.error or not collector.audio:
        reason = collector.error or "没有返回音频"
        print(f"合成失败：{reason}（request_id={synthesizer.get_last_request_id()}）", file=sys.stderr)
        return 1

    with open(out_file, "wb") as f:
        f.write(collector.audio)
    if words_file:
        words = [
            {"text": w["text"].strip(), "start": w["begin_time"] / 1000, "end": w["end_time"] / 1000}
            for w in collector.words
            if w["text"].strip()
        ]
        with open(words_file, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
