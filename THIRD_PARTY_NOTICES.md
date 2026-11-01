# 来源与授权说明

本网站供家庭学习使用，是非官方宝可梦同人项目。

## 玩法参考

[cj0103/studymon-homework](https://github.com/cj0103/studymon-homework) 的分层架构及家庭学习激励机制。该项目 README 声明自制代码采用 MIT License。本项目以 TypeScript 重新实现游戏逻辑，没有包含参考项目的部署凭据或运行存档。

## 宝可梦素材与数据

- 图片：[PokeAPI/sprites](https://github.com/PokeAPI/sprites)。
- 属性图标：同一仓库的 [Scarlet/Violet 符号素材](https://github.com/PokeAPI/sprites/tree/master/sprites/types/generation-ix/scarlet-violet/small)，使用 ID 1—18 的 60×60 PNG 原图，保存在 `public/assets/pokemon/types/`；界面以圆形裁切显示，保留原色与图形。
- 物种、中文名称、能力、捕获率与进化关系：[PokéAPI](https://pokeapi.co/docs/v2)。
- sprites 仓库的 LICENCE.txt 明确说明图片内容版权属于 The Pokémon Company。仓库对其其他可授权内容使用 CC0，并不改变宝可梦图片的权利归属。
- 宝可梦、角色及相关商标的权利属于各自权利人。本站不代表 Nintendo、Game Freak 或 The Pokémon Company。
- 战斗与成长采用家庭简化规则，包括统一招式组、等级进化替代部分道具/通信进化，以及最高等级 50；不声称完整复刻任何一代正作数值。

## 地图、字体与图标

- [Kenney Tiny Town](https://kenney.nl/assets/tiny-town)：CC0。原始授权文本位于网站素材目录的 assets/town/License.txt。
- 站酷快乐体、Noto Sans SC、Nunito：通过 Fontsource 分发；字体授权文件保留在对应依赖包中，采用 SIL Open Font License。
- [Lucide](https://lucide.dev/) 图标：ISC License。
- 场景布局、家庭头像和网站图标为本项目制作。

## 主要软件

React、Vite、TypeScript、Phaser、CloudBase SDK、Zod、Vitest、Playwright 等保留其各自开源授权。依赖版本由 package-lock.json 记录。

## 道馆徽章

关都八枚徽章使用 Bulbagarden Archives 收录的传统徽章图案，按区域 ID 绑定，供本家庭非官方学习项目展示。资料与图案核对入口：https://bulbapedia.bulbagarden.net/wiki/Badge 。Archives 页面将这些图像标为受版权保护的作品，并非 CC0 素材；相关权利仍归原权利人。

Archives 文件站直接下载返回 403，因此本版本从 Neoseeker 的同名图片镜像下载；本地保留原始 PNG，不依赖运行时外链。来源地址：

| 本地文件（public/assets/badges/gen1/） | 下载来源 |
|---|---|
| boulder.png | https://cdn.staticneo.com/w/pokemon/d/dd/Boulder_Badge.png |
| cascade.png | https://cdn.staticneo.com/w/pokemon/9/9c/Cascade_Badge.png |
| thunder.png | https://cdn.staticneo.com/w/pokemon/a/a6/Thunder_Badge.png |
| rainbow.png | https://cdn.staticneo.com/w/pokemon/b/b5/Rainbow_Badge.png |
| soul.png | https://cdn.staticneo.com/w/pokemon/7/7d/Soul_Badge.png |
| marsh.png | https://cdn.staticneo.com/w/pokemon/6/6b/Marsh_Badge.png |
| volcano.png | https://cdn.staticneo.com/w/pokemon/1/12/Volcano_Badge.png |
| earth.png | https://cdn.staticneo.com/w/pokemon/7/78/Earth_Badge.png |
