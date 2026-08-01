/**
 * Purpose: dev-only demo dataset — a three-island learning history (deep, medium and
 * shallow trees) plus a synthetic retention map so fog can be previewed offline.
 * Main exports: demoKnowledgeNodes, demoRetentionByNode.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";

function row(
  id: string,
  parentId: string | null,
  label: string,
  createdAt: string,
): KnowledgeNodeRow {
  return { id, parent_id: parentId, label, summary: "", kind: "concept", created_at: createdAt };
}

export const demoKnowledgeNodes: KnowledgeNodeRow[] = [
  // Island 1 — linear algebra: two kingdoms, deep villages.
  row("linalg", null, "线性代数", "2026-06-01T09:00:00Z"),
  row("vector-spaces", "linalg", "向量空间", "2026-06-01T09:10:00Z"),
  row("basis", "vector-spaces", "基与维数", "2026-06-01T09:20:00Z"),
  row("linear-independence", "basis", "线性无关", "2026-06-01T09:30:00Z"),
  row("span", "basis", "张成空间", "2026-06-01T09:40:00Z"),
  row("coordinates", "basis", "坐标表示", "2026-06-01T09:50:00Z"),
  row("linear-maps", "vector-spaces", "线性映射", "2026-06-02T10:00:00Z"),
  row("kernel", "linear-maps", "核", "2026-06-02T10:10:00Z"),
  row("image", "linear-maps", "像", "2026-06-02T10:20:00Z"),
  row("rank-nullity", "linear-maps", "秩-零化度定理", "2026-06-02T10:30:00Z"),
  row("matrix-theory", "linalg", "矩阵理论", "2026-06-03T11:00:00Z"),
  row("determinant", "matrix-theory", "行列式", "2026-06-03T11:10:00Z"),
  row("cofactor", "determinant", "余子式", "2026-06-03T11:20:00Z"),
  row("laplace-expansion", "determinant", "拉普拉斯展开", "2026-06-03T11:30:00Z"),
  row("eigen", "matrix-theory", "特征值", "2026-06-04T12:00:00Z"),
  row("eigenvector", "eigen", "特征向量", "2026-06-04T12:10:00Z"),
  row("diagonalization", "eigen", "对角化", "2026-06-04T12:20:00Z"),
  row("spectral-theorem", "eigen", "谱定理", "2026-06-04T12:30:00Z"),
  row("decomposition", "matrix-theory", "矩阵分解", "2026-06-05T13:00:00Z"),
  row("lu", "decomposition", "LU 分解", "2026-06-05T13:10:00Z"),
  row("qr", "decomposition", "QR 分解", "2026-06-05T13:20:00Z"),
  row("svd", "decomposition", "奇异值分解", "2026-06-05T13:30:00Z"),

  // Island 2 — web development: two kingdoms, medium depth.
  row("web", null, "Web 开发", "2026-06-10T09:00:00Z"),
  row("frontend", "web", "前端", "2026-06-10T09:10:00Z"),
  row("react", "frontend", "React", "2026-06-10T09:20:00Z"),
  row("hooks", "react", "Hooks", "2026-06-10T09:30:00Z"),
  row("components", "react", "组件模型", "2026-06-10T09:40:00Z"),
  row("lifting-state", "react", "状态提升", "2026-06-10T09:50:00Z"),
  row("css-layout", "frontend", "CSS 布局", "2026-06-11T10:00:00Z"),
  row("flexbox", "css-layout", "Flexbox", "2026-06-11T10:10:00Z"),
  row("grid", "css-layout", "Grid", "2026-06-11T10:20:00Z"),
  row("backend", "web", "后端", "2026-06-12T11:00:00Z"),
  row("http", "backend", "HTTP", "2026-06-12T11:10:00Z"),
  row("http-methods", "http", "请求方法", "2026-06-12T11:20:00Z"),
  row("status-codes", "http", "状态码", "2026-06-12T11:30:00Z"),
  row("database", "backend", "数据库", "2026-06-13T12:00:00Z"),
  row("sql", "database", "SQL", "2026-06-13T12:10:00Z"),
  row("indexes", "database", "索引", "2026-06-13T12:20:00Z"),

  // Island 3 — coffee brewing: one kingdom, shallow.
  row("coffee", null, "咖啡冲煮", "2026-06-20T09:00:00Z"),
  row("pourover", "coffee", "手冲", "2026-06-20T09:10:00Z"),
  row("grind", "pourover", "研磨度", "2026-06-20T09:20:00Z"),
  row("grind-chart", "grind", "粗细对照", "2026-06-20T09:30:00Z"),
  row("pouring", "pourover", "注水", "2026-06-21T10:00:00Z"),
  row("blooming", "pouring", "闷蒸", "2026-06-21T10:10:00Z"),
  row("pulse-pouring", "pouring", "分段注水", "2026-06-21T10:20:00Z"),
];

/** A pretend "today's walk" so the footprint trail can be previewed offline. */
export const demoSessionTrail: string[] = [
  "react",
  "hooks",
  "components",
  "frontend",
  "css-layout",
  "flexbox",
  "grid",
];

/** Long-untouched corners of the demo world so the fog has something to breathe on. */
export const demoRetentionByNode: ReadonlyMap<string, number> = new Map([
  ["eigen", 0.25],
  ["eigenvector", 0.2],
  ["diagonalization", 0.15],
  ["spectral-theorem", 0.2],
  ["determinant", 0.45],
  ["cofactor", 0.4],
  ["laplace-expansion", 0.35],
  ["css-layout", 0.55],
  ["flexbox", 0.5],
  ["grid", 0.5],
  ["pouring", 0.35],
  ["blooming", 0.3],
  ["pulse-pouring", 0.3],
]);
