# 0002. 数据访问用手写 SQL 仓储，不用 ORM 查询构建器

- **状态**: 已批准
- **上下文**: Drizzle 的 sqlite-proxy 驱动要求行数据为「值数组」，而 tauri-plugin-sql 返回「列名对象」，中间转换层脆弱且违反"无猜想"原则。M1 查询极简单（CRUD + 两个聚合）。
- **决策**: `core-db` 不引入 ORM。改为：TS 手写行类型 + append-only 迁移 SQL + 仓储函数（注入 `SqlClient` 接口，应用侧由 tauri-plugin-sql 实现，测试侧可用假实现）。
- **后果**: 少一个重依赖，SQL 完全可见、AI 可读性最高；若未来查询复杂度显著上升，可再评估引入查询构建器（届时补新 ADR）。
