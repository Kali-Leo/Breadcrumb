/**
 * Purpose: the demo seed's 4 hand-written conversations (spec 035 T7b) — two "today" threads
 * (astronomy, JS) whose messages ground a handful of today's node sightings in real user/
 * assistant text, one teach-back thread, and one vocabulary-recap filler thread.
 * Main exports: DemoConversationRef, buildDemoConversations.
 */
import type { ConversationRow, MessageRow } from "@breadcrumb/core-db";
import { type Domain, demoId, isoAt, minutesAgo } from "./shared";

export interface DemoConversationRef {
  conversations: ConversationRow[];
  messages: MessageRow[];
  /** conversation id to route a domain's non-today sightings into (message_id null). */
  conversationIdByDomain: Record<Domain, string>;
  /** node label -> the exact message a today sighting of it should attach to, for the small
   * set of nodes actually discussed in the written dialogue. */
  messageRefByLabel: Map<string, { conversationId: string; messageId: string; createdAt: string }>;
}

/** `count` instants ending `endMinutesAgo` minutes before `now`, `gapMinutes` apart, oldest
 * first — always in the past regardless of what time of day the script runs, unlike a
 * fixed clock hour ("09:00" could be in the future if run earlier that day). */
function todayTimestamps(
  now: Date,
  endMinutesAgo: number,
  gapMinutes: number,
  count: number,
): string[] {
  return Array.from({ length: count }, (_, index) =>
    minutesAgo(now, endMinutesAgo + (count - 1 - index) * gapMinutes),
  );
}

function buildMessages(
  conversationId: string,
  texts: readonly string[],
  timestamps: readonly string[],
): MessageRow[] {
  return texts.map((content, index) => ({
    id: demoId("msg", `${conversationId}-${index}`),
    conversation_id: conversationId,
    role: index % 2 === 0 ? "user" : "assistant",
    content,
    created_at: timestamps[index] ?? timestamps[timestamps.length - 1] ?? new Date().toISOString(),
    teaching_mode: null,
    parent_id: null,
  }));
}

function conversationRow(
  id: string,
  title: string,
  kind: ConversationRow["kind"],
  messages: readonly MessageRow[],
): ConversationRow {
  const first = messages[0];
  const last = messages[messages.length - 1];
  return {
    id,
    title,
    kind,
    created_at: first?.created_at ?? new Date().toISOString(),
    updated_at: last?.created_at ?? first?.created_at ?? new Date().toISOString(),
    companion_id: null,
    auto_title: null,
    study_mode: 0,
  };
}

export function buildDemoConversations(now: Date): DemoConversationRef {
  const astroId = demoId("conv", "astro-today");
  const astroMessages = buildMessages(
    astroId,
    [
      "早上看到一张星系团的照片,光好像被弯曲了,这是什么现象",
      "这是引力透镜:大质量天体的引力会弯曲背后光源发出的光线路径,让背景星系的像发生扭曲或多重成像。",
      "之前聊过的恒星光谱分类,能不能跟这个现象放一起理解",
      "可以:光谱分类看的是恒星本身发出光的成分和温度,引力透镜看的是光路径被路过质量弯曲,两者是独立的物理过程,但都要用光谱和成像数据分析。",
      "那开普勒定律和视差测距法呢,今天复习一下天文观测基础的框架",
      "开普勒定律描述行星轨道形状与周期的关系,视差测距法用地球公转基线测恒星距离,两者都是天文观测基础里的定位工具。",
    ],
    todayTimestamps(now, 40, 5, 6),
  );

  const jsId = demoId("conv", "js-today");
  const jsMessages = buildMessages(
    jsId,
    [
      "写代码时又碰到面试常问的事件循环,想巩固一下JavaScript核心机制这条线",
      "JavaScript核心机制这条线里,事件循环负责协调同步代码、微任务和宏任务的执行顺序,是理解异步行为的基础。",
      "闭包和这个有关系吗",
      "闭包本身和事件循环是两回事,但闭包常用来在异步回调里保存状态,所以两者经常一起出现在代码里。",
    ],
    todayTimestamps(now, 10, 3, 4),
  );

  const teachId = demoId("conv", "teach");
  const teachMessages = buildMessages(
    teachId,
    [
      "我来讲讲闭包:函数记住了它定义时所在的作用域,即使外层函数已经执行完,内部函数依然能访问那些变量,常用来做数据私有化,比如计数器场景。",
      "解释准确,抓住了定义时作用域被保留这个核心机制,私有化计数器的例子也用对了。",
    ],
    [isoAt(now, 10, 19, 0), isoAt(now, 10, 19, 1)],
  );

  const vocabId = demoId("conv", "vocab-recap");
  const vocabMessages = buildMessages(
    vocabId,
    [
      "这周单词量涨得挺快,有没有什么感觉",
      "从最近的猜词记录看,不少词的正确率提升了,继续保持每天接触的节奏就够。",
      "有些词还是会看到就愣一下",
      "愣一下说明还在巩固阶段,不是没学会,等间隔拉长后自然会更快反应过来。",
    ],
    [isoAt(now, 2, 20, 0), isoAt(now, 2, 20, 1), isoAt(now, 2, 20, 5), isoAt(now, 2, 20, 6)],
  );

  const conversations = [
    conversationRow(astroId, "【演示】天文漫游", "chat", astroMessages),
    conversationRow(jsId, "【演示】JS 温故知新", "chat", jsMessages),
    conversationRow(teachId, "回讲·闭包与作用域链", "teach", teachMessages),
    conversationRow(vocabId, "【演示】词汇复盘", "chat", vocabMessages),
  ];
  const messages = [...astroMessages, ...jsMessages, ...teachMessages, ...vocabMessages];

  const messageRefByLabel = new Map<
    string,
    { conversationId: string; messageId: string; createdAt: string }
  >();
  const ref = (label: string, msg: MessageRow | undefined): void => {
    if (msg === undefined) return;
    messageRefByLabel.set(label, {
      conversationId: msg.conversation_id,
      messageId: msg.id,
      createdAt: msg.created_at,
    });
  };
  ref("引力透镜", astroMessages[1]);
  ref("恒星光谱分类", astroMessages[2]);
  ref("天文观测基础", astroMessages[4]);
  ref("JavaScript核心机制", jsMessages[0]);

  return {
    conversations,
    messages,
    conversationIdByDomain: { astro: astroId, js: jsId },
    messageRefByLabel,
  };
}
