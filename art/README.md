# 贴图工作手册（写给 Leo）

> 这本手册的目标：你可以**不依赖任何人**，自己往游戏里加贴图；
> 也可以把这本手册直接丢给任何 AI，它照着做就不会出错。

## 一分钟世界观

知识地图是"你学过的知识"的聚类可视化。贴图分两条轴：

| 缩放等级（你在第几层） | 同层内的规模（知识簇多大） |
|----------------------|--------------------------|
| 地理层 | 大陆（大簇）/ 岛屿（小簇） |
| 国度层 | 大国家 / 小国家 |
| 村落层 | 都城 / 城镇 / 村落 / 孤屋，以及树木等景物 |

两大合同（所有贴图必须遵守）：
1. **白底合同**：贴图必须是纯白背景（程序会检查边框亮度 ≥ 0.97）
2. **纯线稿合同**：纯黑线条，明暗靠排线表达，禁止灰色晕染；**不上色**（涂色方案未来另议）

## 方式 A：手动加一张贴图（最常用）⭐

你从任何地方（Midjourney、网上素材、自己画）拿到一张**白底黑线**的图片后：

```bash
cd ~/桌面/breadcrumb
python3 scripts/art/intake.py 你的图.png --name 贴图名 --level 村落层 --scale 城镇 --mode solid
```

它会自动：查白底 → 抠图 → 弹出预览（左白底右灰底）→ 你按 y 确认 → 自动入库登记。

**`--mode` 怎么选（一句话判据）**：
- `solid`（实体）：建筑、人物、任何"应该挡住身后东西"的 → 内部白色保留
- `ink`（线条）：装饰花纹、地形记号、任何"线条之间应透出背景"的 → 白色变透明

## 方式 B：让流水线批量生成

1. 在 `art/batches/` 里仿照现有文件写一个 JSON（提示词末尾务必带
   "pure black ink line work, no gray shading, on plain white background"）
2. 运行 `python3 scripts/art/generate.py art/batches/你的批次.json`
   （自动执行白底质检、脏底清洗、灰晕染检测，问题会打印出来）
3. 产物在 `art/out/批次名/`，逐张看过后用方式 A 的 intake 入库

**风格 ID 速查**（写进批次 JSON 的 `style_id`）：
- 建筑/地形/一切地图元素：`63dd3260-2764-4d1f-b868-ef9770eb1c0e`（Hogsmeade 速写系）
- （猫村民风格待定，该业务暂时搁置）

## 方式 C：叫 AI 帮忙

把这份 README 给它看，告诉它你要什么，其余它都知道了。
**AI 只能把素材做到 candidate；标 approved 入库前必须你亲眼看过预览。**

## 事故图鉴（前人踩过的坑）

| 事故 | 症状 | 对策 |
|------|------|------|
| 灰晕染 | 铅笔灰色调而非纯线 | 提示词里写明 no gray shading；纯度门会拦 |
| 脏底 | 背景带灰/带景 | 流水线自动送 removeBackground 清洗 |
| 画满画布 | 主体出血到边缘无法抠 | 提示词写 "drawn SMALL in the exact center, complete outline visible, wide empty margins"；"大陆"这类词会诱发出血，改说 "one HUGE island" |
| 自作主张的元素 | 罗盘、文字、船 | 提示词末尾逐个 no：no compass, no text, no boats |
| 物种漂移 | 要猫画成人/猪 | 关键特征焊死：MUST be a cat with ears, whiskers, tail |

## registry.json 字段

`name` 名称 / `file` 素材路径 / `level` 缩放等级 / `scale` 规模 /
`keying` 抠图模式 / `status`（approved=Leo 已验收 · candidate=初筛待验 · shelved=搁置）
