# 开发与扩展

## 本地运行

使用 Node.js 24。执行 npm ci 安装 package-lock.json 中记录的依赖，随后配置 .env.local：

- VITE_CLOUDBASE_ENV_ID：目标环境完整 ID。
- VITE_PUBLISHABLE_KEY：环境的公开访问键，可以出现在浏览器。

npm run dev 启动本地站点；npm run typecheck、npm test、npm run build 分别检查类型、业务规则和构建。

真实云端浏览器测试使用 npm run test:e2e。它需要本地 private/account-identities.json、private/family-seed.json、private/server.json 和运行中的开发服务器，只操作独立 QA 家庭。每次会先初始化 QA 存档，不修改正式家庭；多个真实环境测试脚本不要并行运行。这些私人文件不进 Git；GitHub Actions 运行不依赖这些文件的单元测试与构建。

## 代码分层

| 部分 | 责任 |
|---|---|
| src | React 界面、Phaser 场景、客户端会话和交互 |
| content | 世代内容包、地图定义、宝可梦和词汇数据 |
| server | 出题、判题、战斗、捕捉、审核、奖励与权限 |
| cloudbase/migrations | 按版本维护的 PostgreSQL 结构变更 |
| scripts | 素材准备、构建、部署、备份及真实环境验证 |

核心结算是 server/engine.ts 的纯函数。运行时传入服务端时间、随机数和 UUID。浏览器不会提交伤害、经验或捕获结果。

存档保存在 rr_saves 的 JSONB 字段中；rr_members 记录账号、家庭和角色；rr_operations 记录已完成操作。业务状态使用数据库事务更新，并通过 revision 处理并发冲突。客户端重试使用原 operationId。

CloudBase Node SDK 3.18.3 提供云函数身份读取，但安装版本没有 rdb()。因此服务器使用官方 PostgreSQL REST/RPC 接口；服务 API Key 仅放在云函数环境变量中。前端仍使用 CloudBase JS SDK 的用户名登录和云函数调用。

## 加入后续世代

1. 使用 python3 scripts/prepare-assets.py --generation 2 下载对应物种、图片和进化资料。脚本按上游世代清单取数据，并保留与已安装早期世代的进化关系。
2. 在新世代目录加入 regions.json 和 encounters.json，编写区域、道馆、赠礼与解锁条件。区域 ID 必须与已有内容不同。
3. 在 content/packs.ts 注册新的内容包。全国图鉴 ID、旧区域 ID、旧遭遇池和已有存档保持稳定；不要重新按全局区域数量分配旧野怪。
4. 增加内容覆盖、进化分支和旧存档兼容测试。需要新机制时，扩展 ruleset 和规则实现。
5. 通过功能分支、PR、版本标签发布。普通内容扩展不会重置伙伴、徽章或单词进度。

## 全国图鉴预览

`content/pokedex/species.json` 是独立的物种展示资料，覆盖 #001—#1025，按首次登场世代归类；地区形态与 Mega 不重复计数。来源为 [PokéAPI 数据仓库](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) 的物种、多语言名称、默认形态和属性表。第一世代名称及属性沿用已发布内容包，旧游戏 ID 与英文身份不改动。

`npm run pokedex:prepare` 读取上游 CSV 并生成中文、英文、全拼及首字母索引。原始资料缓存于被忽略的 `private/pokedex-source/`；显式刷新使用 `npm run pokedex:prepare -- --refresh`。网络需要系统代理时，在 Node.js 24 下使用 `NODE_USE_ENV_PROXY=1 npm run pokedex:prepare -- --refresh`。脚本不下载图片、不注册玩法内容包；拼音转换只在准备资料时执行，多音字修正保存在脚本中。提交前检查生成差异并运行数据与检索测试。

`src/game/pokedex.ts` 的 `DEX_DISPLAY` 分别配置默认打开的世代与可显示图片的世代；卡片和详情使用 `dexPresentation()` 解析同源图片路径。以后补齐一个世代的本地图片，再将其加入 `artworkGenerations`。游戏区域、进化、遭遇和完整能力仍须按“加入后续世代”流程独立发布；浏览某个标签不会解锁玩法。当前只有 gen1 显示图片，gen2—gen9 不请求宝可梦图片，所有搜索建议均使用文字。

本地启动开发服务器后执行 `npm run test:pokedex-ui`，默认端口 5176，可通过 `TEST_BASE_URL` 覆盖。脚本使用合成存档与隔离浏览器，覆盖五种宽度、筛选、输入法、键盘、详情焦点、无图片请求和无游戏操作；不登录云端。

## 首版规则

- 同一谱系按当前已发布内容包的进化关系判定，不使用包含未来世代的上游 chainId 判定重复。
- 重复捕获变为同谱系经验，受每日总上限约束；顺延经验保留原接收伙伴。
- 伊布三个分支有额外收藏赠礼：4 枚徽章后完成妈妈挑战领水伊布，6 枚后完成外公挑战领雷伊布，8 枚后完成外婆挑战领火伊布。每只只领取一次。
- 新打卡按首次提交时的任务清单和奖励参数逐项结算；当天英语首答成绩继续累积，自动补足已通过任务的对应加成。历史已审批记录保留原结果。
- 复习日期以首次学习或答错当天计算，安排当天及第 1、3、7 天；提前重复答对不会跳过后面的复习。跨日未完成的纠错仍会保留，改为复习，不领取昨天的每日加成。
- 打卡可在之后审核，经验占用实际发放日的上限。快手奖励按提交时的上海时间计算。
- 初代战斗采用家庭简化招式与现代属性相克，没有 PP、异常状态或暴击。部分道具和通信进化折算为等级条件；最高进化门槛 48，等级上限 50。

## 迭代约定

main 保存可发布版本。新功能使用 codex/ 或其他功能分支，通过 PR 合入；CI 执行类型检查、业务测试与构建。

功能增加升次版本，修复升补丁版本。同步更新 package.json、CHANGELOG.md、界面版本号和静态缓存版本，再创建对应 Git 标签与 GitHub Release。云部署独立执行，不把云端管理员凭据放进 GitHub Actions。

## 已知验证范围

首版自动化使用本机 Google Chrome、真实 CloudBase 登录与独立 QA 存档。覆盖桌面及 1024×768 横屏触屏仿真；实际 iPad/Safari 和外接键盘硬件仍需实机试用。浏览器不支持系统读音时，单词选择题仍可正常完成。

CloudBase Node SDK 的旧 NoSQL 依赖在 npm audit 中仍有上游警报。本项目不使用 NoSQL 或向该 SDK 传递用户控制的路径、URL；数据库通信使用原生 fetch。后续 SDK 升级时继续核查，不为消除报告而降级到旧 SDK。

## 分项审批与奖励（v0.5.0）

当天首次提交保存任务 ID、名称及基础经验、快手、英语和连续奖励参数。任务等权，之后的规则修改用于下一份新打卡；每日到账上限仍按实际发放日的当前设置执行。有待审批次时不能叠加提交，通过项不能再次提交，补交只允许北京时间当天。家长可以迟审，跨日退回的项目只能查看。

`parent.review` 使用 `date`、`approvedTaskIds`、`submissionVersion` 和可选 `reason`。未选的待审任务退回；旧批次不能审批新提交。旧客户端整单审核仅兼容尚未处理的首次批次，后续批次要求刷新。原有事务、revision 冲突重读和 operationId 去重继续生效。

当任务总数为 N、通过数为 A、按时提交且通过数为 F 时，累计经验为三个分别取整的分量之和：`round(baseExp*A/N)`、工作日 `round(baseExp*(fastMultiplier-1)*F/N)`、`round(baseExp*englishPerQuestion*englishCorrect*A/N)`。每次只结算累计差额，顺延也计入已经结算，避免重领。快手按每项最新提交时间判断。

至少一项通过就计一个有效日。连续日期区间每满七天结算一次，历史记录首次加载时初始化已结算次数；补审只补新增次数。唤醒累计获赠后（含当天）的有效日期，按伙伴保存已经计数的日期，保留旧剩余天数。

满级伙伴不参与新的队伍经验分配。无法分配的奖励记入 `unallocatedExp`；既有顺延经验仍按伙伴 UUID 保存。`reward.claim` 仅将待分配余额及已满级伙伴的顺延余额主动转到当前可成长小队，服从实际到账上限。它不会转移尚未满级伙伴的顺延经验。

`Checkin.review`、伙伴计数日期、每日 `goal`、待分配余额和连续奖励次数均为兼容性新增字段；根 schemaVersion 保持 1。旧待审记录以原提交项目作为分母，保留原整单奖励口径。旧已审批记录不重算。两个函数均包含存档校验，发布先更新备份函数，再更新游戏函数和网页。

本地运行开发服务器后，用 `TEST_BASE_URL=http://127.0.0.1:5176/ npm run test:rewards-ui` 验证分项审批、丢失响应重试、英语补奖和四种屏幕宽度。`npm run test:rewards-live` 仅使用独立 QA 家庭，先备份并读回验证，结束恢复 QA；其他家庭逐一只读对照。旧 `test:e2e` 会初始化 QA，不用于此次发布验收。
