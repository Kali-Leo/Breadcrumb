# 语言包构建脚本(spec 033)

两个入口:`build-pack.mjs`(通用,任意语言对,数据来自 Wiktionary/Kaikki + 词频表)与
`build-zh-en.mjs`(中英专用,CC-CEDICT 管线,产物随安装包一起发布)。

```bash
node scripts/language-packs/build-pack.mjs en:sw     # 单个语言对
node scripts/language-packs/build-pack.mjs --all     # pairs.json 里的全部
```

候选语言对写在 `pairs.json`;**列在那里只是候选,不是承诺**——缺词频表、或可替换词条数不
够的语言对会被拒绝构建,`apps/desktop/src/assets/language-packs/catalog.json`(产物,入库)
只列真正建成的。包体本身写到 `dist/language-packs/`(不入库),发布时上传到 GitHub Release
的 `language-packs-<版本>` 这个 tag,应用按需下载。

**如果你的网络走代理**:Node 默认不读 `HTTP_PROXY`,加 `NODE_USE_ENV_PROXY=1` 再跑,否则
下载会一直挂着不报错。

以下是中英专用管线的说明。

从公开数据构建 `zh:en` 语言包,产物是单个 JSON 文件,供 `plugin-diglot-weave` 在运行时
按 `packages/plugin-diglot-weave/src/packSchema.ts` 的 Zod 契约加载。零 npm 依赖,纯
Node ≥20 内置 API(`fetch`/`zlib`/`fs`)。

## 怎么跑

```bash
node scripts/language-packs/build-zh-en.mjs
```

首次运行会把四份上游数据下载到 `scripts/language-packs/.cache/`(已加入
`.gitignore`,不入库);之后重跑会直接读缓存,不再联网。删除 `.cache/` 目录即可强制
重新下载。产物写到 `apps/desktop/src/assets/language-packs/zh-en.json`,输出为紧凑
JSON(键按字母序排序),保证可重复构建、字节级确定。

## 文件

- `parsers.mjs` — 带缓存的下载函数 + 四种上游文件格式的解析器(CC-CEDICT / zh 与
  en 频表 / CMUdict)。
- `entry-builder.mjs` — ARPABET→IPA 转换表、CEDICT 释义归一化、以及把同一简体词头
  下多条 CEDICT 行合并为单条词条的 T1 白名单判定逻辑。
- `build-zh-en.mjs` — 编排入口:下载→解析→构建→写盘→打印统计。

## 数据处理逻辑摘要

1. 只保留出现在中文频表前 5 万词内的简体词头(生僻词无意义)。
2. `target` 取该词头第一条 CEDICT 释义,去括号注释、去动词前缀 "to "(记 `pos: "v"`)、
   去冠词,转小写;必须匹配 `^[a-z][a-z'-]*$` 才是"安全"目标,否则该词条整体标记
   `t1Safe: false`(仍保留供查词用,不参与自动替换)。
3. `altTargets` 取其余释义,同样归一化,去重,最多 6 个。
4. 一个简体词头对应多条 CEDICT 行(多音字/多义项)时,逐行归一化各自的首条释义并比较:
   若不一致判定为"冲突", `t1Safe: false`。
5. 不安全判定(`t1Safe: false`,但保留词条)命中任一:拼音含大写(专名)、任一行释义
   数 > 2、释义含黑名单词(`variant of` / `classifier for` / `surname` / `abbr.` /
   `(archaic)` / `used in` / `see also` / `old variant`)、单字词头、目标词正则不合法或
   不在英文常用词表前 2 万(如安全条数不足 2000 会放宽到前 3 万,脚本会在终端提示)、
   多行释义冲突。
6. 完全无法归一化出任何可用词(首条释义和全部备选释义都不合法)的词条直接丢弃。
7. `reading` 用目标英文单词查 CMUdict 取音标,经内置 ARPABET→IPA 表转换,重音 1 前置
   `ˈ`,包在 `/.../` 里;查不到则为空字符串。
8. `forms`:每个保留词条的繁体写法(与简体不同时)→ 简体词头。

## 上游数据与许可

- **CC-CEDICT**(词典/拼音/释义)—— © MDBG,CC BY-SA 4.0。
  <https://www.mdbg.net/chinese/dictionary?page=cc-cedict>
- **FrequencyWords**(中/英频表,OpenSubtitles 2018)—— © Hermit Dave,CC BY-SA 4.0。
  <https://github.com/hermitdave/FrequencyWords>
- **CMUdict**(英文发音,ARPABET)—— © Carnegie Mellon University,BSD-2-Clause。
  <https://github.com/cmusphinx/cmudict>

三条署名已写入产物 JSON 的 `attribution` 字段,运行时可直接展示。
