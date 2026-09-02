# Breadcrumb — 浏览器版 / Browser edition

打开一个网址就能用，什么都不用装。数据存在浏览器自己的存储里，一样不离开你的设备。

Open a URL and use it — nothing to install. Data lives in the browser's own storage and, as
on the desktop, never leaves your device.

**这不是桌面版的替代品**，是同一个应用的第二种运行方式。桌面版能做的更多（见下面「少了什么」）。

---

## 它是怎么做到的

`apps/web` **没有自己的功能代码**。它构建的是 `apps/desktop/src` ——
同一个 React 应用、同一批组件、同一套 store、同一份文案。

两个版本之间只有**四个模块**不同，由 Vite 别名替换：

| 桌面版 | 浏览器版 |
|---|---|
| `@tauri-apps/plugin-sql`（原生 SQLite 文件） | SQLite 编译成 WebAssembly，存在浏览器的 OPFS 里 |
| `@tauri-apps/api/core`（Rust 命令） | 浏览器实现，做不到的诚实报错 |
| `@tauri-apps/plugin-http`（Rust 发请求） | 浏览器自己的 `fetch` |
| `@tauri-apps/plugin-opener` | `window.open`，同样限制协议白名单 |

**所以桌面版加一个功能，这一版当天就有。** 没有第二份实现会漂移。

> 代价是有的：Tailwind 从构建根目录找类名，而这一版的构建根是 `apps/web`，组件却在
> `apps/desktop/src`——首发那版因此只带了基础层、一条工具类都没有，页面整个是裸的
> （2026-08-31 上线，2026-09-01 发现并修：`App.css` 里显式写 `@source "./**/*.{ts,tsx}"`）。
> 这类"跨目录构建"的坑不会有编译错误，只会安静地少东西，改构建配置后请截图看一眼。

数据库用的是 `opfs-sahpool` 这个 VFS，它**不需要跨源隔离（COOP/COEP）** ——
也就是说这个版本可以放在任何静态托管上，不用配特殊响应头。这正是"打开就能用"的前提。

47 个迁移在 SQLite-wasm 上逐条跑通并有测试盯着
（`src/shims/sqlite.migrations.test.ts`）—— 不同的 SQLite 构建、不同的驱动、
不同的绑定层，底下压着几千行手写 SQL，这是这一版最大的风险点，所以它是被测的。

---

## ⚠️ 一件必须先知道的事：CORS

桌面版的网络请求是 Rust 发的，在浏览器的安全模型之外，所以**任何 AI 服务都能用**。
浏览器版的请求是网页发的，所以**你的 AI 服务必须允许跨域请求**。

各家不一样：有的直接就能用，有的会被浏览器挡下来，报一个 CORS 错误 ——
那不是这个应用能修的。

如果你填好了密钥却一直失败，先在浏览器控制台看看是不是 CORS。
**遇到这种情况有两个办法**：换一个支持浏览器直连的服务商，或者用桌面版。

> On desktop these requests are made by Rust, outside the browser's security model, so any
> endpoint works. Here they are made by a web page, so your AI service must send CORS headers.
> Some providers do and work immediately; some do not and will fail with a CORS error no
> client-side code can fix. Switch provider, or use the desktop build.

---

## 少了什么

诚实列出来。这些都是浏览器给不了的能力，不是没写完：

| 少了什么 | 影响 | 为什么 |
|---|---|---|
| **本地嵌入模型** | 地图分区退回按知识树结构划分；知识点去重只剩机械规则那一层；关系候选退回同级与时间排序；猜词判定只判对错，不给"接近" | 模型有几十兆，第一次打开应该是个能用的应用，不是一次下载。加回来是很小的改动，见 `src/shims/embeddings.ts` |
| **FSRS 参数按人拟合** | 用库的默认参数 | 需要 Rust 那个 crate。它本来也只在 400 次复习之后才触发 |
| **本地发音（Piper）** | 退回浏览器自己的语音合成 | Piper 是本机程序，网页起不了进程 |
| **发现页** | 没有数据 | 它要连本机 21456 端口上的另一个程序。网页连本地端口正是浏览器该拦的事 |

**其余全部照常**：对话与学习模式、知识地图（含地形生成）、专注模式、生词标注与猜词、
学习目标、对比树（1,016 个职业的数据是随包的）、事实核查、语言学习、每日来请教你的同学、
研究课题平台、以及计价与全部开关。

---

## 存储

数据在浏览器的 **OPFS**（源私有文件系统）里。

**隔离的单位是「源」，不是网址路径。** 这一版部署在 `kali-leo.github.io` 上，与该账号下
其它所有 GitHub Pages 项目**同源** —— 那些页面上的脚本能打开这里的 `breadcrumb.db`，
读出包括 API 密钥在内的全部数据。别的网站读不到，同源的兄弟项目读得到。
介意的话请用桌面版。

> OPFS is isolated per **origin**, not per path. This build is served from
> `kali-leo.github.io`, the same origin as every other GitHub Pages project under that
> account, so script on any of those pages can open this app's `breadcrumb.db` and read
> everything in it, API key included. Other websites cannot; sibling projects on the same
> origin can. Use the desktop build if that matters to you.

- **无痕模式 / 禁用存储时**：应用照常工作，但**关掉标签页就没了**。
  这种情况启动时会有一条横幅明说，不会让你白写一天。
- **清除浏览器数据会连它一起清掉**。这是浏览器的规矩，不是这个应用的选择。
  在意的话用桌面版。

---

## 本地跑起来

```bash
pnpm install
pnpm --filter @breadcrumb/web dev
```

构建：

```bash
pnpm --filter @breadcrumb/web build          # 部署到 /Breadcrumb/（GitHub Pages）
BASE_PATH=/ pnpm --filter @breadcrumb/web build   # 部署到域名根目录
```

测试（跑真实迁移）：

```bash
pnpm --filter @breadcrumb/web test
```
