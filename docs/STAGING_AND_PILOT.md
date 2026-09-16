# Radar Agent：测试环境与真实交付清单

更新：2026-09-16。这里是 Arc Radar Agent，不是 SwapGuard。

## 本轮完成到哪里

- 主网基础接口只读检查已通过，主网付款仍被代码拦截。
- 42 项自动测试通过，类型检查和构建通过。
- D1 迁移、唯一请求占用、状态转换、响应保存已在本地 SQLite 和
  Miniflare/workerd 中验证。Worker 的数据库绑定、健康接口、OpenAPI、
  未付款 402 与错误参数 400 也已验证。
- 这些是本地/模拟证据，不是真实付费交付，也不是第三方用户采用。
- 本轮没有创建云端数据库、发布新 Worker、充值、签署付款或发送链上交易。

本地可复现检查（不加载钱包、不付款；Worker 检查禁用所有外部 HTTP）：

```bash
npm test
npm run typecheck
npm run build
npm run check:worker
```

报告位于 `docs/evidence/worker-d1-*.json`。首次用 Wrangler 本地预览时遇到
文件监听/目录权限问题；后来改用显式模块列表的独立 Miniflare 验证。
不能把本地模拟成功描述为云端已上线。

## 下一步：独立测试环境，不覆盖老演示

1. 取得建立独立 Cloudflare Worker 与 D1 数据库的确认；检查账户套餐/用量。
2. 为测试网单独创建数据库、绑定 `RADAR_PAYMENTS`，应用
   `migrations/0001_payment_receipts.sql`。不要清空或迁移覆盖旧演示账本。
3. `wrangler.staging.example.jsonc` 仅是模板；全零数据库 ID 和 `0x111…111`
   收款方都是占位，不能拿它远程部署或付款。替换为真实数据库 ID 和
   经所有者确认的测试网收款地址。不要把私钥或 Circle 凭证放进配置。
4. 在独立域名部署；验证绑定、迁移、重启后记录恢复和外部未付款客户端。
   `npm run deploy:workers` 会拒绝缺少 D1 的旧配置，避免误覆盖演示站。
5. 再确认测试网买方/卖方地址、请求次数、数据费上限，以及充值 Gas。
   现有 `.env.local` 的存在不代表这些钱包获得了此次支出授权。

没有 D1 时，接口允许未付款报价用于兼容诊断，但带授权的请求返回 503，
不会调用收款接口。`/api/health` 会显示 `blocked_missing_store`。
绑定存在也不等于数据库迁移和访问权限已验证。

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
