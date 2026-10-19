# 发布、备份与恢复

项目级发布流程见 [.agents/skills/rongrong-release/SKILL.md](../.agents/skills/rongrong-release/SKILL.md)。当前目标环境、地域、网站地址和资源名称保存在 deployment.json；实际发布回执随每个 GitHub Release 保存，包含 Git 提交、前端与函数版本、数据库迁移版本和验收结果。

## 常规发布

1. 使用 codex/ 分支修改，更新 package.json、package-lock.json 和 CHANGELOG。修复升 patch，功能升 minor；构建从 package.json 生成界面、SW 缓存及函数包版本。
2. 运行 npm run typecheck、npm test、npm run build、npm run verify:saves -- --ref <上次已部署标签>。该检查从 Git 读取旧内容，并只读当前云端存档，不生成冻结清单。内容 ID 移除或改指向需明确迁移，不能跳过检查。
3. 创建并关联 PR，检查通过后合并。切回合并后的 main、确认工作区清洁，再构建同一提交。
4. 运行 npm run backup -- --reason release。它保存一份本机压缩快照到 private/backups，同时上传私有云端桶并读回完整比较。两者成功后才能更新线上应用。
5. 需要数据库变更时，先运行 npm exec -- tcb db pg migration up --env-id wind-d7gesdlb779f8214f --dry-run，再应用同一增量迁移。部署不得初始化、清空或覆盖正式家庭。
6. 新函数部署前运行 node scripts/production-config.mjs 生成已忽略的本地密钥配置，然后通过 tcb --config-file .cloudbaserc.production.local.json fn deploy <函数名> 创建。已有函数代码更新使用 tcb fn code update，避免覆盖既有环境变量。
7. 运行 npm run deploy:web，只上传 dist。CLI 超时后先查询云端状态，不重复创建应用或函数。
8. 使用独立 QA 家庭测试实际变更；正式家庭只查看、导出和对照存档。运行 node scripts/production-smoke.mjs 及兼容检查。正常登录会触发既有 bootstrap 和跨日处理，因此以实际进度及正常 rollover 结果核对，不要求 revision 静止。
9. 验证成功后推送版本标签并创建正式 GitHub Release，附非敏感回执。备份、家庭 ID、账号、密钥和带签名下载地址不进入 Git、dist 或 Release。

当前任务完成部署，不在 GitHub Actions 中新增云端管理密钥。缺少认证时完成登录；套餐、费用和资源能力以当时查询为准，不自动升级或续费。

## 云端备份

- 私有 PG Storage 桶：rongrong-save-backups。保持 public=false，不向 anon/authenticated 配置任何读写策略。
- 独立事件函数：rongrong-backup。无 HTTP 路由；网关明确拒绝客户端调用，管理端及定时触发器可调用。
- 定时器：rongrong-daily-backup，每天北京时间 03:00，七字段 cron 为 `0 0 3 * * * *`。上线时核对平台时区和触发配置。
- rr_export_backup 是 service_role 专用 RPC，单条 SQL 读取 rr_saves、rr_members、rr_operations 的一致 MVCC 快照。它不改变三张业务表。
- 备份包含格式版本、环境、导出时间、备份程序版本、原因以及每个家庭的 revision、schemaVersion 和全部存档。gzip 文件按时间和随机 ID 新建，禁止覆盖或自动清理。
- 上传后下载、解压、验证结构及引用，再比较全部内容；只有完成后才写 backup_verified 日志。失败抛出错误，使用云函数平台的异步重试和失败日志。
- 使用 npm run backup:verify -- --latest 下载并验证最新每日快照；超过 26 小时未有成功记录需排查。当前环境未开通集中日志服务，不自动开通额外付费服务。每日备份的正常恢复点间隔最多约 24 小时，不等于零数据丢失保证。

首次安装时，先使用已有只读导出保存本地 rr_saves，再应用备份 RPC 迁移、创建私有桶、部署函数和权限，完成首次云端备份后才发布网站。现有安全措施保持不变。

## 验证与恢复

```sh
npm run backup:verify -- --file private/backups/<备份文件>.json.gz
npm run backup:verify -- --key release/<云端对象>.json.gz
npm run backup:restore -- --file private/backups/<备份文件>.json.gz --family <精确家庭ID>
```

恢复默认 dry-run，输出目标家庭、快照时间、当前 revision 和变化字段，不写数据库。实际恢复须由用户明确指定家庭与备份；在相同命令后增加 `--apply --revision <预览值>`。执行前再生成并读回一份云端安全备份，然后使用 rr_commit 和新 operationId 写入。revision 冲突后重新读取和预览，不盲目重试。恢复后核对完整 state 与 revision；若有同时发生的正常写入，停止自动重试并检查当前状态。

恢复只替换指定家庭的状态，不修改 rr_members，不回退 rr_operations。备份中的账号映射和操作历史用于故障调查；整库灾难恢复需要单独方案和明确授权。

应用回滚优先恢复上一可用前端/函数版本并保留用户的新进度。数据库迁移应向后兼容；不自动执行破坏性逆迁移或用旧备份覆盖正式存档。

## 访问与验证边界

PG 表和备份 RPC 保持服务端权限，rr_commit 在函数内部检查 service_role。CloudBase 默认网站入口可能先显示平台访问提示页，真实浏览器需等待后点击“确定访问”；不能仅按脚本 HTTP 状态判断站点可用。

家庭名单、账号凭据、服务密钥、备份、浏览器会话位于 private/ 或忽略的本地配置。QA 与正式家庭按 family_id 区分；测试不能依靠昵称选择家庭。QA 写入测试前备份，测试结束后用已授权的 QA 恢复流程还原。

备份函数的客户端限制须同时覆盖 SDK 与 HTTP 调用。HTTP 网关 Rego 不覆盖 SDK 的 Cloud API 通道；当前 PG 环境的 DescribeResourcePermission 接口返回不支持，不能照搬传统环境的函数安全规则。备份函数从平台每次传入的 context.environment 解析可信用户身份，拒绝所有终端用户（包括匿名身份）；不从 process.env 或仅依赖 SDK 的进程全局身份判断，以免函数热复用残留前一次用户身份，HTTP 网关另保留拒绝策略；不能凭 event.Type=Timer 判定权限。验证须包含真实 SDK callFunction、匿名与登录用户的文件/RPC读取，以及管理端和定时器成功执行。

## 独立体验账号

体验家庭与正式家庭、自动化 QA 家庭分别保存进度。账号清单单独保存于忽略的 `private/trial-accounts.json`，不加入 QA 账号清单或原家庭初始化脚本。首次创建前完成备份和内容跟随迁移，先运行 `npm run trial:provision` 查看无副作用预览，再运行 `npm run trial:provision -- --apply` 创建。重试会核对已创建身份和家庭关系，不重置已有进度。两个身份只使用应用内的 child／parent 权限，不授予平台管理权限。

`rr_saves.content_source_family_id` 由管理端配置，普通客户端不能指定。服务端每次操作读取来源家庭的 NPC、词库、启停项和完整 settings，只提交体验家庭自己的状态。已生成题目保持原题面；来源丢失、串联或引用不兼容时保留存档并报错。正式家庭和 QA 的此字段为空。备份包含关联字段，恢复命令仅恢复 state，不修改关联。

体验家长的家庭规则、任务、词库和 NPC 为只读，包括临时对战放行；审核、奖励和导出只操作体验家庭。发布后验收新账号必须先备份，并在交付前恢复到零进度；交付后的体验进度不参与常规 QA 重置。动态同步验收使用 QA 作为临时内容来源并在结束时恢复双方状态和原关联，正式家庭始终只读。

本地界面与账号切换回归：启动 `npm run dev` 后运行 `npm run test:trial-ui`，可用 `TEST_BASE_URL` 指定端口。此脚本使用合成数据和隔离浏览器，不登录云端。真实验收另测试已部署函数的来源跟随、鉴权、提交、审核、导出和数据库读回。
