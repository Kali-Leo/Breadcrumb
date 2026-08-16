#!/usr/bin/env node
/**
 * Purpose: dev-only CLI that signs a research-task payload (spec 036) with
 * RESEARCH_SIGNING_PRIVATE_KEY and prints the hex Ed25519 signature to stdout. Reads the
 * payload as JSON on stdin, or falls back to the built-in demo payload (same one shipped
 * in apps/desktop/src/lib/researchSampleTask.ts) when stdin is empty/a TTY.
 * Usage: node --env-file=.env packages/plugin-research/scripts/signResearchTask.mjs [< payload.json]
 */
import { ed25519 } from "@noble/curves/ed25519.js";

// Mirrors src/canonicalJson.ts's serialize() exactly. Kept in sync by hand — this script
// is plain Node ESM and cannot import the TypeScript source directly.
function canonicalJsonStringify(value) {
  return serialize(value);
}
function serialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`);
  return `{${body.join(",")}}`;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// The bundled demo task (spec 036 #6) — identical to the payload literal in
// apps/desktop/src/lib/researchSampleTask.ts. Every optional field is spelled out
// explicitly so the signed bytes never depend on Zod default-filling.
const DEMO_PAYLOAD = {
  id: "breadcrumb-demo-task",
  institution: "Breadcrumb 项目组",
  title: "示例研究:概念接触与学习活跃度的关联",
  purpose:
    "这是内置的示例研究任务,用于演示研究课题平台的完整链路:项目方签名的任务在本地计算三项聚合统计,结果只增加,你可以随时删除。它不对应任何真实机构的数据需求。",
  ethicsNote: "示例任务,无需伦理审查;真实任务的伦理审查备注会显示在这个位置。",
  calls: [
    { fn: "count", metric: "concepts_known" },
    { fn: "histogram", metric: "encounters_per_node", bucketCount: 6 },
    {
      fn: "correlation",
      xMetric: "daily_encounters",
      yMetric: "daily_word_events",
      windowDays: 60,
    },
  ],
  display: [
    { kind: "text", text: "以下三项统计全部为本地聚合计算,只输出聚合结果,不包含任何单条记录。" },
    { kind: "stat", label: "认识的概念数", callIndex: 0 },
    { kind: "bars", label: "各概念的接触次数分布", callIndex: 1 },
    {
      kind: "stat",
      label: "「每天接触概念的次数」和「每天遇到外语词的次数」是否一起变化",
      callIndex: 2,
    },
  ],
  expiresAt: "2030-01-01",
};

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

const privateKeyHex = process.env.RESEARCH_SIGNING_PRIVATE_KEY;
if (!privateKeyHex) {
  console.error("RESEARCH_SIGNING_PRIVATE_KEY is not set");
  process.exit(1);
}

const stdinText = await readStdin();
const payload = stdinText.length > 0 ? JSON.parse(stdinText) : DEMO_PAYLOAD;

const messageBytes = new TextEncoder().encode(canonicalJsonStringify(payload));
const signature = bytesToHex(ed25519.sign(messageBytes, hexToBytes(privateKeyHex)));
console.log(signature);
