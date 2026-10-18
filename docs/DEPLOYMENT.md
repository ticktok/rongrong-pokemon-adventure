# 部署、备份与恢复

目标环境为国内站、上海地域 wind-d7gesdlb779f8214f。环境状态与费用应在每次需要变更套餐时重新查询；当前任务不自动购买、续费或升级。

## 发布

1. 执行 npm run typecheck、npm test、npm run build。
2. 执行 npm run backup，导出当前家庭存档到本机 private/backups。备份文件含家庭资料，不提交 Git。
3. 有数据库变更时，先运行 npm exec -- tcb db pg migration up --env-id wind-d7gesdlb779f8214f --dry-run，检查后再执行同一命令去掉 --dry-run。
4. 首次函数部署前运行 node scripts/production-config.mjs，生成已忽略的 .cloudbaserc.production.local.json。它读取 private/server.json 并注入服务端 API Key。新函数使用该配置运行 tcb fn deploy。
5. 后续仅改代码时，运行 npm exec -- tcb fn code update rongrong-game --env-id wind-d7gesdlb779f8214f。不要用空的环境变量配置覆盖线上密钥。
6. 执行 npm run deploy:web。该脚本只从 dist 打包与上传，避免带上私有资料、源码运维文件或依赖目录。
7. 检查部署返回的实际 URL，用独立测试账号验证 HTTPS 登录、存档读回和关键操作，再记录前端/函数版本、数据库迁移版本和 Git 标签。

CloudBase CLI 某些发布请求可能超时但云端已完成。发生超时后先查看函数或应用状态，不直接重复创建资源。

## 家庭资料与访问控制

家庭名单、账号凭据、服务密钥、浏览器测试会话和备份位于 private 或已忽略的本地配置文件。公开网站只包含通用素材与登录界面；姓名和个人进度在登录后由云函数读取。

PG 表不向 anon 或 authenticated 角色授权直接读写。rr_commit 内部必须验证 service_role；不能仅依赖 GRANT EXECUTE。云函数从可信运行上下文获取 UID，再查询家庭与角色。

网关规则只针对 rongrong-game 的函数入口限制家庭账号。新增家庭账号时需要同时维护 rr_members 和对应网关用户清单，保留环境中其他既有规则。

## 存档导出与恢复

家长可在“存档与记录”导出家庭存档。运维备份额外保存家庭 ID、数据库 revision 和导出时间。

恢复时先暂停该家庭的操作并导出最新存档，确认目标 family_id、schemaVersion 和备份日期。使用服务端凭据，通过 rr_commit 传入当前 revision、新 operationId 和待恢复状态；不要修改账号映射，不要清空数据库。恢复后重新登录，核对队伍、等级、徽章、图鉴、打卡及词汇进度。

应用回滚通常只需部署前一个 Git 标签对应的前端与函数版本。数据库保持向后兼容，孩子的新进度保留；只有确实需要恢复数据时，才按上述指定家庭的流程处理。

## 当前套餐边界

2026-10-18 查询结果：体验版，ExpireTime 为 2027-04-18 23:59:59，未开启自动续费和超额付费。

新增安全域名返回 OperationDenied.FreePackageDenied。网站使用已开通的默认 HTTPS 入口。若以后需要自定义域名或新增白名单，先核实当时的套餐要求和费用，再由环境所有者决定。

默认测试域名的浏览器入口包含腾讯云访问提示页。该页可能返回 HTTP 404，但显示的是平台提示；等待 3 秒后使用页面的“确定访问”按钮进入。验收必须走这个真实浏览器流程，不能只依据脚本请求的 HTTP 200 判断网站可用。
