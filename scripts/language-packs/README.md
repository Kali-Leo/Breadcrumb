# 语言包构建脚本(spec 033)

三个入口:

```bash
node scripts/language-packs/interlingua.mjs es        # 一种语言的中间产物
node scripts/language-packs/build-cross-pack.mjs --all  # 全部语言对(N×N)
node scripts/language-packs/build-zh-en.mjs            # 中英专用,产物随安装包发布
```

## 为什么要中间产物(interlingua)

kaikki.org 的抽取全都是「某语言的词 + 英文释义」,所以直接建只能建「X↔英语」。
要让**任意两种界面语言互学**,得拿英文释义当中介:西班牙语的 `perro` 和土耳其语的
`köpek` 都被释义成 `dog`,于是它们能对上。

`interlingua.mjs` 把一份抽取(几百 MB 到 1 GB)压成一份几 MB 的中间产物
(`.cache/interlingua/<code>.json`:词 → 词性/英文释义键/IPA/词形/词频排名),压完就把原始
抽取删掉。**磁盘上任何时刻只有一份抽取**——这是 17 份抽取(约 8 GB)能在 50 GB 空余空间
上跑完的原因。英语没有抽取:英语就是中介本身,它那一份由词频表 + CMUdict 合成。

## 对不上就不收

匹配分两层,两层都是「拒绝」而不是「够到」。

**意思层**(`interlinguaGloss.mjs` + `crossPack.mjs`):

- **释义键**:小写、去括号补充、去冠词与不定式 `to`、按分号和逗号切成多个义项;
  `variant of` / `surname` 这类交叉引用整条丢掉。
- **多义泛滥**:一个键在源语言或目标语言任一边被超过 4 个词认领,就不再是意思的证据,丢掉。
  剩下的几个同义词里取**词频最高**的那个——不是「先取词典形」:法语 `porte`(门)同时是
  `porter` 的命令式,先取词典形会跳过它去选 `guichet`(售票窗口,词频 15305),把
  `puerta → guichet` 织进去。按词频选中 `porte`,再由下面的变位形规则把这条整个拒掉——
  不织 `puerta` 是对的,织 `guichet` 从来都不对。
- **英文虚词键不做桥**:`the` / `not` / `him` 匹配的是语法不是意思。
- **只有主义项能织**:桥必须是该源词的第一条释义,且该词释义不超过 8 条。

**语法层**(`wordShape.mjs` + `inflections.mjs`,2026-09-04 Leo 抽查后加):

第一版中低频词配得很好,最高频的那批却错得厉害——因为词频表最前面几乎全是虚词和动词变位。
以下任一条命中就只查不换:

- **是别人的变位形**(两边都查):西语 `son`(他们是)有个名词义项「音」,法语 `est`(是)
  有个名词义项「东」,`été`(过去分词)有个名词义项「夏天」——全都被当名词织了进去。判据是
  Kaikki 的 `form_of` + `tags`,而且**只认屈折 tag**(人称/时态/语气/分词/格/数),不认性别:
  `aspiradora` 只是 `aspirador` 的阴性形,是个正经名词,而 `casa` 是 `casar` 的第三人称
  单数。性别 tag 只在词频最前 1000 名内拒绝(那里形容词阴性形的读法压倒名词读法,
  `buena → héritage` 就是这么来的),而且只认义项级的声明——词形表太松,`padre`/`dios`/
  `señor` 都会被误标,代价是 `padre → père` 这种好条目。
- **虚词词类**(两边都查):代词、限定词、介词、连词、助动词、感叹词等。
- **单字符、含数字、含句点、全大写缩写**:`A`(西语句首的 `a`,词频第 4 位)、`Sr.`、`ETS`。
- **句首大写变体**:德语给名词大写,于是词频表里全是句首的 `Als`、`Hast`、`Denke`、`Alt`,
  而 Wiktionary 又能把它们读成生僻名词(`Als → 小川` 一条小溪)。判据是小写拼写也在词表里,
  或者小写拼写是某个词元的变位形。真正的德语名词 `Kind`、`Woche` 没有小写孪生,不受影响。
- **词频最前 1000 名更严**:源词与目标词必须词类一致且都是实词。1000 是词频表从语法变成词汇
  的大致分界,也是错条目会被反复看到而不是偶尔碰到的范围。

代价是可织条目整体少了 30%,23 个语言对因此掉到 1500 以下被拒绝。这是有意的:
**宁可少收,不许错配**。

## 语言与拒绝条件

语言写在 `languages.json`。**列在那里只是候选,不是承诺**:

- 没有可用词频表(≥2 万词)的语言**只能被学,不能被读**——没有排名就答不上「先学哪个词」。
  hi 只有 2016 版 2 968 词、sw 一份都没有,所以两者只做目标语言。
- 可织词条不足 1500 的语言对会被拒绝构建。
- `zh:en` 不走这条管线:CC-CEDICT 那份质量更好,而且随安装包发布。

`apps/desktop/src/assets/language-packs/catalog.json`(产物,入库)只列真正建成的。包体写到
`dist/language-packs/`(不入库),发布时上传到 GitHub Release 的 `language-packs-<版本>`
这个 tag,应用按需下载。

`build-pack.mjs` + `pairs.json` 是原来的直连管线,只能建 X↔英语,保留作对照。

**如果你的网络走代理**:Node 默认不读 `HTTP_PROXY`,加 `NODE_USE_ENV_PROXY=1` 再跑,否则
下载会一直挂着不报错。

## 上游完整性

每一份下载都必须先在 `upstream.lock.json` 里登记 sha256(GitHub 源还要登记 commit),否则
构建直接拒绝。这些数据最后会当字典发到学习者机器上,上游悄悄变了必须让构建停下来,而不是
一路流过去。换上游是手工改这个文件:下载、`sha256sum`、把两个数字贴进去。

以下是中英专用管线的说明。

从公开数据构建 `zh:en` 语言包,产物是单个 JSON 文件,供 `feature-diglot-weave` 在运行时
按 `packages/feature-diglot-weave/src/packSchema.ts` 的 Zod 契约加载。零 npm 依赖,纯
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
