# 第三方开源声明 / Third-Party Notices

本项目（Breadcrumb，AGPL-3.0）采用或移植了以下开源项目的代码、算法与美术资产。
This project (Breadcrumb, AGPL-3.0) incorporates code, algorithms and art assets
from the following open-source projects.

| 项目 / Project | 许可证 / License | 采用方式 / Usage |
|---|---|---|
| [jeheydorn/nortantis](https://github.com/jeheydorn/nortantis) | AGPL-3.0 | 手绘地图图标资产（`apps/desktop/src/assets/map-art/`）；海岸晕影、海浪、纸张纹理、做旧边框算法移植；构造板块模拟移植 |
| [mewo2/terrain](https://github.com/mewo2/terrain) | MIT | 水力侵蚀/河流管线算法移植（`packages/plugin-map/src/erosion.ts` 等） |
| [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) | MIT | 高度图斑块算子算法移植（`packages/plugin-map/src/heightmap.ts`） |
| [lxgw/LxgwWenKai 霞鹜文楷](https://github.com/lxgw/LxgwWenKai) | SIL OFL 1.1 | 地图手写风格字体（许可证全文见 `apps/desktop/src/assets/fonts/OFL.txt`） |
| [David Revoy《Pepper&Carrot》](https://peppercarrot.com) | CC BY 4.0 | AI 学习伙伴的角色设定为衍生创作，有改动（`packages/plugin-companion/src/cards/`）；不含原作美术资产，且不代表原作者对本产品的背书 |
| [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) | MIT | Generative Agents 记忆流检索评分移植（`packages/plugin-companion/src/memoryStream.ts`） |
| [thunlp/ProactiveAgent](https://github.com/thunlp/ProactiveAgent) | Apache-2.0 | 主动提议门控算法移植（ICLR 2025） |
| [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | 间隔复习调度（npm 依赖） |
| [open-spaced-repetition/fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) | BSD-3-Clause | 按用户拟合 FSRS 参数（Rust 依赖） |

依赖库（npm，见各 package.json）：pixi.js、d3-delaunay、d3-hierarchy、simplex-noise、
poisson-disk-sampling、graphology 系列、mermaid、katex、react 等，均为 MIT/ISC/Apache-2.0 许可证。

**双许可证的选择声明**（依赖以「A 或 B」发布时，本项目选择哪一支）：

- `dompurify`（经由 mermaid 随包分发）：`MPL-2.0 OR Apache-2.0` —— **选择 Apache-2.0**。
- `priority-queue`（Rust）：`LGPL-3.0-or-later OR MPL-2.0` —— **选择 MPL-2.0**。
- `r-efi`（Rust）：`MIT OR Apache-2.0 OR LGPL-2.1-or-later` —— **选择 MIT**。

注：watabou 的 CompassOS 与 RuneGeneratorOS 仓库无许可证文件，未采用其任何内容。

## 对比树正典层数据来源（spec 025，开发期内化、运行时零网络）

- **Wikidata**（www.wikidata.org）：正典概念的 QID 与中英标签/别名，
  数据以 **CC0 1.0 公有领域贡献** 发布，允许任何目的的复制与再分发。
- **MDN Curriculum**（developer.mozilla.org，Mozilla）：前端画像的细粒概念名与
  用于逐字校验的单句引文，文档内容为 **CC BY-SA** 许可；每条内化条目的
  source_ref 均附原页 URL 作为署名与出处。
- **《普通高中数学课程标准（2017年版2020年修订）》**（中华人民共和国教育部制定）：
  数学画像的知识点条目名与单句原文引用，逐条注明出处（单元/页码）；
  属规范性官方文件的署名引用。
- **O*NET 30.2 Database**（U.S. Department of Labor / O*NET Resource Center）：
  职业画像的职业名录、任务句、Technology Skills 与 Knowledge/Skills 描述符，
  **CC BY 4.0** 许可，开发期内化子集随包分发；每条 item 的 source_ref 注明
  SOC 码与数据表。时效补丁层的招聘帖聚合仅在开发期实验采集（限速），
  产物只保留"技能名+频次+单句引文"，不含任何完整帖文或个人信息。
- **ESCO v1.2.1**（European Union / European Commission，esco.ec.europa.eu）：
  职业画像「知识与技能」分支的概念名、别名与层级关系，以及 ESCO↔O*NET 官方
  职业对照表（ESCO Secretariat 与 U.S. Department of Labor 联合发布），
  **CC BY 4.0** 许可，开发期内化子集随包分发；每条 item 的 source_ref 注明
  ESCO 版本、经由的对照匹配类型与 ESCO 职业名。

## 语言织入数据来源(spec 033,开发期构建语言包、运行时零网络)

- **Wiktionary**(经 kaikki.org 的机器可读抽取,wiktionary.org / kaikki.org):
  下载型语言包(`pairs.json` 所列 27 对)的词条、词性与释义来源,
  **CC BY-SA 4.0** 许可(部分内容同时受 GFDL 覆盖);由
  `scripts/language-packs/build-pack.mjs` 在开发期构建,每个包的 `attribution`
  字段内嵌署名并在设置页展示。
- **CC-CEDICT**(MDBG,cc-cedict.org):zh→en 语言包的词条、繁简形与释义来源,
  **CC BY-SA 4.0** 许可;由 `scripts/language-packs/build-zh-en.mjs` 在开发期
  构建为 `apps/desktop/src/assets/language-packs/zh-en.json` 随包分发。
- **FrequencyWords**(Hermit Dave,基于 OpenSubtitles 2018 语料):中英词频表,
  驱动新词引入顺序与常用词过滤,**CC BY-SA 4.0** 许可。
- **CMUdict**(Carnegie Mellon University):英语发音词典(ARPABET→IPA 转换后
  作为释义卡读音),**BSD-2-Clause** 许可。
