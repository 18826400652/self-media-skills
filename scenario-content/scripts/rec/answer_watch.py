# sc rec 浏览器模式：判断 AI 回答结束（纯逻辑，没有浏览器依赖；rec.mjs 把它拼在 screencast.py 前面一起执行）。
# 做法：发送后页面文字第一次变化 = 提问气泡出现，再等 1 秒取「基线」；之后文字比基线多出 10 字（回答开始出现），
# 并且连续 2.5 秒不变（发送后至少 4 秒）= 回答结束。
# 不用「提问长度」当基线：长提问（如整段群聊）在对话里会被折叠，回答又比提问短时，按提问长度永远等不到。


class AnswerWatch:
    SETTLE = 1.0  # 提问气泡出现后多久取基线
    GROW = 10  # 比基线多出这么多字才算回答开始
    STABLE = 2.5  # 文字多久不变算答完
    MIN_AFTER_SEND = 4

    def __init__(self, before, t_send):
        self.before, self.t_send = before, t_send
        self.first = self.base = self.last = None
        self.stable_since = t_send
        self.done_at = None

    def feed(self, t, n):
        """喂一次采样（秒, 页面文字长度）；回答结束时返回 True，结束时刻在 done_at"""
        if n is None:
            return False
        if n != self.last:
            self.last, self.stable_since = n, t
        if self.base is None:
            if self.first is None and n != self.before:
                self.first = t
            if self.first is not None and t - self.first >= self.SETTLE:
                self.base = n
            return False
        if n > self.base + self.GROW and t - self.stable_since >= self.STABLE and t - self.t_send >= self.MIN_AFTER_SEND:
            self.done_at = self.stable_since
            return True
        return False
