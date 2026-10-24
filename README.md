# 融融的宝可梦英语冒险

和宝可梦一起学英语，把每天的努力变成冒险的力量。

- [进入冒险](https://rongrong-pokemon-adventure-wind-d7gesdlb779f8214f.webapps.tcloudbase.com/)
- [家长空间](https://rongrong-pokemon-adventure-wind-d7gesdlb779f8214f.webapps.tcloudbase.com/#/parent)

腾讯云测试域名会先显示访问提示。等待 3 秒并点击“确定访问”，即可进入网站。家庭账号由项目所有者保管。

首版包含第一世代 151 只宝可梦、8 个可走动区域、8 座道馆、300 个常用英语词，以及家人与同学 NPC。支持平板横屏、方向键/WASD、触屏方向键和主屏幕快捷入口。

## 第一次使用

1. 家长为平板登录儿童账号，融融从四位初始伙伴中选一位。
2. 完成每天的英语练习，勾选实际完成的任务并提交。
3. 家长在自己的设备逐项确认，按通过比例发放经验；未通过项可以当天补做、再次提交。
4. 周末到草丛寻找伙伴、挑战道馆；家长可以在“家庭规则”临时开放学习日。

选择攻击招式或抛球时会出现单词题。首次答对获得助攻；答错会出现解释，纠正后继续普通行动。进入“学习手册”可查看每日进度和待复习单词。

## 开发与部署

React + TypeScript + Vite，Phaser 3.90，CloudBase 用户名登录与 Node.js 云函数，PostgreSQL 事务存档。游戏结果在服务器计算；网页只提交操作和选项。

- [开发、规则与后续世代扩展](docs/DEVELOPMENT.md)
- [部署、备份与恢复](docs/DEPLOYMENT.md)
- [版本记录](CHANGELOG.md)
- [首版验证范围](docs/VALIDATION.md)

常用命令：

    npm ci
    npm run dev
    npm run typecheck
    npm test
    npm run build

本地运行需要 .env.local 中的环境 ID 与 Publishable Key。当前项目的家庭账号、服务密钥、名单及备份保存在被 Git 忽略的私人目录；不要把它们加入提交或网站构建目录。

## 来源

玩法参考 [studymon-homework](https://github.com/cj0103/studymon-homework)。宝可梦图片来自 [PokeAPI sprites](https://github.com/PokeAPI/sprites)，图片权利属于 The Pokémon Company；地图使用 [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) 的 CC0 素材。详见 THIRD_PARTY_NOTICES.md。

真实名单、账号凭据和运行存档不进入源码仓库。
