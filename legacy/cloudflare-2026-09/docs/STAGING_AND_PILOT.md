# Radar Agent：测试环境与真实交付清单

更新：2026-09-20。这里是 Arc Radar Agent，不是 SwapGuard。

## 本轮完成到哪里

- 主网基础接口只读检查已通过，主网付款仍被代码拦截。
- 47 项自动测试通过，类型检查、独立 staging 构建与本地 Worker 检查通过。
- D1 迁移、唯一请求占用、状态转换、响应保存已在本地 SQLite 和
  Miniflare/workerd 中验证。Worker 的数据库绑定、健康接口、OpenAPI、
  未付款 402 与错误参数 400 也已验证。
- 9 月 20 日 Cloudflare 官方授权完成，在原 Radar 账号创建了独立 Worker
  `radar-agent-integration-staging` 和 D1 `radar-payments-staging`，迁移已应用。
  未覆盖旧演示，也没有修改 SwapGuard、升级付费套餐或上传私钥/Circle 凭证。
- 云端健康接口、OpenAPI、ETH/BTC 未付款报价、错误参数、禁用演示模式和
  禁用收款检查均通过；自有独立 HTTP 客户端也通过报价/收款方白名单校验。
- 独立 `radar_staging_probe` 表中的明确标注模拟记录，在重新部署后保持原值；
  `payment_receipts` 记录数仍为 0。这不是完整云端付费请求恢复证明。
- 本轮没有充值、签署付款或发送链上交易；没有真实付费交付或第三方用户采用。
- 新增 `RADAR_ACCEPT_PAYMENTS`：只有显式值 `true` 才接受付款授权；未设置、
  `false` 或其他值均阻止付款请求，先于账本访问、付款验证与结算执行。
  已部署的 staging 保持 `false`；同意部署不等于同意启用收款或买方支出。
- `/api/health` 实际对 D1 执行不返回记录的 schema 读取；缺库/未迁移/不可访问
  返回 503，仅读取成功才显示 `schema_read_verified`。这不证明写入和完整交易能力。

本地可复现检查（不加载钱包、不付款；Worker 检查禁用所有外部 HTTP）：

```bash
npm test
npm run typecheck
npm run build:staging
npm run check:worker
```

报告位于 `docs/evidence/worker-d1-*.json`。首次用 Wrangler 本地预览时遇到
文件监听/目录权限问题；后来改用显式模块列表的独立 Miniflare 验证。
本地模拟与下面的独立云端验证是不同层级的证据。

## 已上线：独立测试环境，不覆盖老演示

- [健康检查](https://radar-agent-integration-staging.chrischang2026.workers.dev/api/health)
- [公开 OpenAPI](https://radar-agent-integration-staging.chrischang2026.workers.dev/api/openapi)
- [部署、持久化与网络验证记录](evidence/staging-deployment-2026-09-20.md)

`wrangler.staging.jsonc` 固定到已确认的原 Radar 账号、新 Worker 和新 D1。
`wrangler.staging.example.jsonc` 仍是占位模板，不用于远程部署。
配置里的历史测试网卖方地址只是发现/报价元数据，**不代表本次付费试验已确认
钱包控制权或获准使用资金**。收款开关与主网执行均关闭。

复现未付款云端检查：

```bash
npm run check:staging -- --url https://radar-agent-integration-staging.chrischang2026.workers.dev --save
npm run agent:probe -- --url https://radar-agent-integration-staging.chrischang2026.workers.dev --network testnet --seller 0x00902065f410A5B9Af8e80BF663790744D378a0C --save
```

此次本机直连出现超时/不可达；使用用户已配置的系统代理后通过，报告已注明
代理传输。不能把这一次结果当成全地域可用性或生产 SLA。不要通过关闭 TLS 校验解决。

独立 staging 重新部署命令（仍不启用收款）：

```bash
npm run build:staging
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false WRANGLER_SEND_METRICS=false WRANGLER_LOG_PATH=.wrangler/staging-setup.log npx wrangler deploy --config wrangler.staging.jsonc
```

迁移为 `migrations/0001_payment_receipts.sql`；可复现的独立存储探针为
`scripts/staging-storage-probe.sql`，只能运行在 `radar-payments-staging`。
它创建单独的模拟表，不伪造付款记录。不要清空或覆盖旧演示账本。
`npm run deploy:workers` 会拒绝缺少 D1 的旧配置，避免误覆盖演示站。

最新本地报告：[Worker/D1 检查](evidence/worker-d1-2026-09-20T10-27-06-635Z.json)。
构建命令关闭 Vite dotenv 和 Wrangler dotenv dev-vars 加载，不会启动买方 CLI。

## 下一步：真实交付前的剩余门槛

1. 补未知付款结果的操作者核对/恢复工具与测试，不允许直接重付或释放预留。
2. 确认测试网买方/卖方地址、控制权、请求次数、数据费上限和充值 Gas；
   取得单独支出许可后，才可以开启测试网收款并验证云端付费响应恢复。
   现有 `.env.local` 不代表钱包获得了此次支出授权。
3. 先用自有客户端完成小额测试，再与愿意参与的外部 Agent 运营者做交付试验；
   两种来源分开记录，不把自有探针说成真实客户。
4. 主网保持代码阻断，待对账、钱包/预算授权和真实交付门槛通过后再单独评估。

## 付费请求的协议变化

- 客户端独立配置 `EXPECTED_SELLER_ADDRESS`，不要盲信网页地址或报价收款方。
- 每个逻辑请求使用一个 UUID `x-radar-request-id`。
- 同一请求恢复时必须保持请求 ID、查询条件和付款授权不变。
  使用新 nonce 重付同一个请求会被拒绝；不要通过换 ID 绕开未知结果。
- 已接受的完全相同请求返回原始响应与 `x-radar-replayed: true`，不再收款。
  响应时间戳保持原值，恢复响应不是一条新鲜市场观测。
- 409、超时、未知结算或响应校验失败均不触发自动重付。
- 服务端保留请求摘要、payer、nonce、公开付款条款和原始输出用于核对；
  不保存可重用的授权签名。数据库访问、备份和保留期限要在上线前配置。
- 客户端先预留信号费再签名，未知结果跨天也不会释放；未解决记录阻止下一轮。
  本地文件锁只保护同一主机/状态目录，不提供多机器共同预算控制。

## 未知结果的恢复原则

目前支持“已接受且已存储响应”的精确恢复；未知结算的自动对账尚未实现。
发生未知结果时先暂停，按 request ID、payer、nonce、network、金额和
Gateway 返回记录核对接受状态，再检查批次/链上结算证据。
**不能删除锁、清空 reservations、重置 breaker 或修改数据库状态来假装没花钱。**
进程崩溃留下的锁需先确认进程已退出，并完成付款核对；不存在自动超时解锁。
没有可靠的付款结果，就保留预留金额和未知状态。需要补经过测试的
操作者对账工具与审计流程后，才能开放主网付费实验。

## 最小真实交付实验

第一轮只测信号服务，不自动转移资金库本金。`npm run agent` 默认如此。
`--execute-treasury` 只用于历史测试网实验；该分支的真实余额、Gas 和
最终回执核验仍是未完成项，不能作为主网生产能力。

先测试网，再经过单独批准做小额主网验证。每轮留下：

- 客户端身份：自有测试程序，还是经同意的真实外部 Agent；两者分开统计。
- 尝试数、接受付款数、成功收到并校验的数据数、重试/恢复数、失败/未知数。
- request ID、付款引用、响应哈希、客户端收到时间、耗时。
- 总支出、每次有效交付成本、充值/提现 Gas 分开计量；未测量不写成零。
- 成功率的分母必须包含失败与未知请求，恢复响应不重复计为新销售。

通过后再准备 Microgrants 与 Marketplace 申请。仍需确认：公共主网服务、
真实付款与交付证据、项目/开发者资料、收款地址，以及资助资格。
Tameion 保持候选，完整规则出来前不报名、不作时间承诺。

## 技术依据

- [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [D1 sessions and database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)

数据库状态检查采用 primary-first session；占用和状态转换使用独立原子 SQL，
而不是把 Gateway 网络调用放进数据库事务中。它能阻止服务端盲目再次收款，
但不能自动解决外部付款完成、本地确认丢失的所有不确定性。
