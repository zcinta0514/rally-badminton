# 开拍 RALLY 场馆预览

在游戏大厅点「场馆预览版」进入审片页。选「界内」「界外」或「下网」，示例球会由同一套比赛物理计算落点和得分。切到「主裁席」可看记分动作。点「进入对局」可体验正常比赛。

## 本地启动

在项目根目录运行以下命令，然后打开终端显示的本机地址。审片页位于 `/src/preview/arena.html`。

```powershell
npm ci
npm start
```

## Blender 文件

用 Blender 4.5 LTS 打开 `开拍 RALLY.blend`。在时间轴播放第 1 至 140 帧，可看两次判罚、主裁记分和场边屏幕更新。摄影机随时间轴标记切换。五台摄影机分别用于总览、底线、主裁、比分牌和灯架。Blender 文件保留场馆各部件、照明和角色动画。GLB 使用独立简化后的几何。

从项目根目录重新生成需要 Node 依赖与 Blender。第一条命令生成仅供离线渲染使用的两名准备姿势球员，第二条命令生成 Blender 场景和游戏 GLB。

```powershell
node art/arena/generate-players.mjs
blender -b --python-exit-code 1 -P art/arena/source/build.py
```

端墙、地胶、围挡与比分牌沿用游戏标题的两套字体。中文为 Rally Display 的 650 字重，拉丁文为 Rally Numerals。Blender 使用的字形已随工程打包，网页模型使用由这些字形生成的网格。若项目字形更新，可从根目录运行 `python art/arena/source/prepare-sign-fonts.py` 重新生成两份 TTF 子集，需要 fontTools、Brotli 与 skia-pathops。围挡图标沿用大厅标志的双斜线和圆点轮廓。[项目字体说明](../../src/fonts/NOTICE.txt)

## 判罚与表现

游戏使用 `rallyEnd.id` 识别一次得分。主裁操作平板，电子屏读取双方实际分数。四名司线员分别负责两条边线和两条底线，单、双打切换时两侧司线员随负责的界线移动。出界选越过距离较大的边界，界内选最近的边界。只有当值司线员出手势。下网与发球违例由主裁处理。发球裁判保持就座观察。游戏沿用可受撞击变形的球网和实时球员。

场馆采用单片中心球场的原创布置。比赛净空、侧向照明、深色端线背景、裁判席与器材布局参考世界羽联文件。灯具强度按画面调校。球员沿用《开拍》已有模型，来源信息见 [Quaternius 授权说明](../../src/models/LICENSE-Quaternius.txt)。

- [BWF 国际标准场馆设施规范，第 5.3.4 节](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-5---TECHNICAL-REGULATIONS/Section%205.3.4%20-%20Specs%20for%20Int%27l%20Standard%20Facilities%20-2.pdf)
- [东京奥运会羽毛球场馆要求，比赛区与器材](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-5---TECHNICAL-REGULATIONS/Section%205.4.1.3%20-%20OG%20-%20Statement%20of%20Badminton%27s%20Requirement%20-%20Tokyo%202020.pdf)
- [BWF 技术官员指引，司线员手势](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/Section%204.1.1%20-%20Instructions%20to%20Technical%20Officials%20%28ITTO%29.pdf)
