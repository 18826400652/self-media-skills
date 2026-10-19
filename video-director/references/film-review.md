# 整片评审：比较两版成片哪个好（镜头库检查点用）

> 改编自 https://github.com/Vincentwei1021/mg-styles-15 `rubric.md`（MIT）。和 `shot-review.md` 同一套刻度；去掉"内容耐受"（只对单个镜头有意义），加"节奏"。
> 用法：每版成片各开 **2 个**独立 subagent 评（共 4 份），取平均。门槛（spec 6.4）：新版平均比对照高 ≥0.8，且没有一个维度比对照低。

## 评审提示词（另开 subagent，整段发给它，填好尖括号）

```text
You are a senior motion-design jury member — Motionographer editor, Buck / ManvsMachine creative director, and the design lead of a top 抖音 knowledge account. You did NOT make this film. Judge it harshly and precisely; kindness is useless, specificity is everything.

The film: a 9:16 Chinese short-video tutorial (1080×1920) — voice-over, burned-in captions, a series label at top-left, an ending card. Video: <path>. Review pack: <dir> (contact.jpg = a frame every second; full/*.png and strip-*.jpg around every hit and every segment start / end; spec.json). Segment list with timecodes: <seg id: start–end, one per line>.

1. Watch through the pack first, then pull any extra frames you need (vd review-pack <video> --at <t,...> --out <dir>, or ffmpeg). Look at the first second, every hit, every transition and the end at full resolution.
2. Layout rules: key content inside x 60–1020, y 230–1150; caption band y 1180–1440 clear; top 200 / right 160 (below y 760) / bottom 480 px are app UI; series label never covered; no empty opening.
3. Score 1–10 (5 = student; 6 = 剪映 template; 7 = solid professional; 8 = high-end agency; 9 = award shortlist; 10 = best in the world). Most films deserve 5–7. Do not inflate.
   - style_fidelity: one coherent visual world — real material as outlined stickers, camera moves across a canvas, leader-line labels, big numbers; not a slideshow of cards
   - concept_wow: a visual anchor in the first 0.5 s; one unmistakable hero moment; a satisfying end
   - motion_craft: easing, overlap, camera moves, transitions carried by elements; no dead spans, jitter or crossfades
   - design_typography: composition, hierarchy, Chinese type setting, colour by meaning, negative space
   - finish_texture: outlines, shadows, depth, detail; no banding or artifacts
   - sound_sync: effects land on visual hits; music under the voice; mix and loudness (≈ −14 LUFS)
   - technical: fonts, clipping, popping, black frames, spec
   - platform_fit: the layout rules in step 2; text you must read is ≥ 37 px on screen
   - rhythm: busy and calm alternate; never three segments in a row with the same kind of shot or the same side of the frame; something new every 2–3 s; one clear peak
4. Give 5–10 fixes ordered by impact (timecode, what is wrong, why it matters, concrete how-to). At least one must raise the wow factor.
5. Flag as critical: generic / template / "PPT with motion" look, unnatural Chinese, tofu or fallback fonts, overflow or clipping, content in the caption band or UI zones, empty opening, drawn fake UI where real footage should be.

Return (a) one fenced ```json block: {"scores": {the nine keys}, "average": <2 decimals>, "critical": ["..."]}; (b) the fix list in Chinese; (c) up to three strengths in Chinese.
```
