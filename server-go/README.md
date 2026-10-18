# 谱审 · Go 后端

乐谱审阅管理系统的 Go + Gin 后端，是 `../server`（Node/Express/TypeScript 版）的等价重写。

**前端零改动即可对接**——端口、路由、响应结构、JWT 格式、密码哈希算法全部与原版逐字节对齐。

> 环境要求：Go **1.26+**（依赖 `go-redis v9.23` 要求该版本）、MySQL 8+；Redis 与 DashScope 均为可选。

---

## 快速开始

```bash
# 1. 初始化数据库（首次运行）
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql
# 可选：AI 功能演示数据
mysql -u root -p score_review < db/ai-review-seed.sql

# 2. 配置环境变量
cp .env.example .env          # 按需填写 DB_PASSWORD / JWT_SECRET / DASHSCOPE_API_KEY

# 3. 启动（需要 MySQL；Redis 可选，不可用会自动降级）
go run ./cmd/api              # 默认监听 3001

# 4. 健康检查
curl http://localhost:3001/api/health
# {"status":"ok","message":"乐谱审阅系统 API 运行中"}
```

Redis 不可用时缓存自动降级为直查数据库；`DASHSCOPE_API_KEY` 缺失或账户异常时，
知识库检索自动降级为关键词匹配——两者都不影响服务启动与主流程。

### 测试账号

`db/seed.sql` 会初始化以下演示账号，**密码统一为 `1234`**：

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| **张教授** | `1234` | admin | **主测账号**，可提交审阅（通过/驳回） |
| 管理员 | `1234` | admin | 系统管理员 |
| 王老师 | `1234` | reviewer | 审阅人 |
| 李同学 | `1234` | contributor | 贡献者 |
| 陈同学 | `1234` | contributor | 贡献者 |

```bash
# 登录验证
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"张教授","password":"1234"}'
```

> ⚠️ 密码存储为 `sha256(明文)` 的十六进制**前 20 位**（`1234` → `03ac674216f3e15c761e`）。
> 新增演示账号时须按同样算法生成哈希，否则无法登录。
>
> 张教授的角色必须是 `admin` —— 前端审阅按钮硬编码 `reviewer_id: 1`，
> 后端也要求 admin 才能提交审阅。

---

## 目录结构

```
server-go/
├── cmd/api/main.go              入口：装配依赖 → 建路由 → 监听
├── internal/
│   ├── app/                     依赖容器（替代 Node 的模块级全局状态）
│   ├── config/                  环境变量与 .env 解析
│   ├── database/                sqlx 连接池 + 事务辅助 WithTx
│   ├── httpx/                   响应助手 + JSTime（对齐 Node 的时间序列化）
│   ├── middleware/              JWT 鉴权、CORS、请求日志、panic 兜底
│   ├── router/                  全部路由注册（对照 src/index.ts）
│   ├── handlers/                21 个 handler，与 server/src/routes/ 一一对应
│   ├── services/                AI 三层过滤、DashScope、向量、缓存等
│   ├── notation/                456 行简谱解析器移植
│   └── rules/                   GB/T 规则知识库（go:embed 打包）
├── db/                          数据库脚本（schema / seed / AI 演示数据）
├── testdata/                    基准数据（迁移期由 Node 版生成，现为冻结基线）
└── scripts/                     迁移期契约对比与写操作验证脚本
```

---

## 验证体系

### 日常回归（Node 版删除后仍然可用）

```bash
go test ./internal/...           # 19 个测试函数 / 43 个子用例
go build ./... && go vet ./...
```

| 包 | 覆盖内容 |
|----|---------|
| `internal/handlers` | 密码哈希与 Node 一致；**路由集成测试**（httptest）：健康检查、注册/登录/伪造 token、写端点鉴权、批注校验、只读端点形状与空数组语义 |
| `internal/notation` | 简谱解析器 86 条基准（含 seed 真实谱面） |
| `internal/rules` | 知识库 567 条逐条比对 + 关键词检索 |
| `internal/services` | 规则过滤、偏好学习、冲突检测、影响分析（基准比对）；RAG 过滤；AI 三层流水线短路逻辑与降级；向量结果解析 |

> 集成测试**依赖真实数据库与 seed 数据**；数据库不可达时会自动 `t.Skip`，
> 因此在没有 MySQL 的机器上 `go test ./...` 依然会通过（只是跳过集成部分）。

### 基准数据（testdata/）——冻结的契约基线

这些文件是**迁移期由 Node 版（权威实现）生成**的，Go 测试加载后逐字段断言，
是保证「重写不改变行为」的零漂移闸门。Node 版删除后，它们作为**历史基线**保留：

| 文件 | 覆盖 | 断言 |
|------|------|------|
| `notation_fixture.json` | 简谱解析器全分支 + seed 真实谱面 | 86 条 |
| `rule_filter_fixture.json` | 规则过滤 + 优先级 | 26 条 |
| `preference_fixture.json` | 特征提取 / 驳回匹配 / 统计 | 26 条 |
| `diff_fixture.json` | 冲突检测 + 影响分析 | 21 对 |
| `knowledgebase_fixture.json` | 知识库 567 条 + 关键词分词 + 检索 | 567 条 |

> ⚠️ **不要用 Go 版重新生成基准**——那会变成「自己校验自己」，失去基线意义。
> 如确需重新生成，请先从 git 历史恢复迁移前的 Node 版：
> `git log --all -- server/src/utils/notation.ts` 找到提交后 `git worktree add` 取出，
> 再运行当时的 `gen-fixtures.ts`。

### 迁移期双跑脚本（需要两个后端）

`scripts/contract-diff.mjs` 与 `scripts/write-verify.mjs` 是迁移期工具：它们同时请求
Node 版（3001）与 Go 版（3002）并逐字段比对。**Node 版已删除**，脚本保留作文档；
若要复用，需先从 git 历史恢复 Node 版并同时启动两个服务。

---

## 与原版的行为差异（有意为之）

| 差异 | 原版 | Go 版 | 原因 |
|------|------|-------|------|
| **写端点鉴权** | 仅 5 个端点有鉴权，创建/删除乐谱、分支合并、导入等全部裸奔 | 所有**会写库**的端点均要求 JWT | 修复既有安全缺陷 |
| **导入主键** | `SELECT MAX(id)+1` 手工算主键，并发下会撞号 | 依赖 MySQL 自增 + `LastInsertId` | 修复既有并发缺陷 |
| **多写事务** | `sections PUT`／`tags PUT`／`comments POST` 的多次写无事务 | 全部用 `WithTx` 包住 | 修复既有数据一致性缺陷 |
| **外部调用超时** | 调用 DashScope 无超时 | HTTP 客户端显式 30s／60s 超时 | Go 的 `http.Client` 零值表示**永不超时**，不设会永久挂起 |
| **Token 用量落库** | 因类型未声明而丢失，`review_suggestions.token_usage` 恒为 0 | 正常记录 | 修复既有 bug |

**已知保留未改的既有行为**（为避免改变接口契约，原样搬运）：

- `GET /api/merge/conflicts/:branchId` 是**非幂等 GET**——无 pending 冲突时会重新检测、调用 LLM 并写库
- `PUT /api/notifications/read-all/:userId` **忽略路径参数**，只按 token 里的用户 id 更新
- `GET /api/users` 系列用 `SELECT *`，会把 `password` 一并返回
- 冲突检测按音符**下标对齐**（非 LCS diff），中间插入音符会导致后续整体错位误报
- 结构性校验对休止符用了 `beatTime/max(duration,4)`，全休止与二分休止的时值会被算错
- RAG 的向量路径与关键词路径评分尺度不同却共用阈值

---

## 维护提示

⚠️ **规则文档是物理副本**。`internal/rules/embedded/` 下的 GB/T 文档复制自仓库根目录的
`简谱规则/`、`五线谱规则/`、`简谱五线谱映射规范.md`——因为 `go:embed` 不允许引用包目录之外的路径。
**修改根目录文档后必须重新复制**，否则二进制里仍是旧规则：

```bash
cp ../简谱规则/*.md internal/rules/embedded/jianpu/
cp ../五线谱规则/*.md internal/rules/embedded/staff/
cp ../简谱五线谱映射规范.md internal/rules/embedded/mapping/
go test ./internal/rules/   # 条数应仍为 567
```

---

## 容器化

```bash
docker compose up -d --build server-go   # 在仓库根目录执行
```

多阶段构建（golang builder → alpine），产物是约 13MB 的静态二进制，规则文档已 embed 进二进制。
compose 中 `server-go` 与 `server` 共用同一套环境变量与数据库，**JWT 密钥一致即可双向互认 token**，
因此可以灰度切换：把 `client/nginx.conf` 的 `proxy_pass` 指向 `http://server-go:3001` 即可，改回即回滚。
