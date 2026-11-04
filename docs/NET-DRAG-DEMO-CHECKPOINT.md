# NET-DRAG-DEMO 本地检查点 · 2026-11-04

基线：实时 git ls-remote 与 fetch 核对 origin/main=92fa12b4f12ff64e098559b5fd1a012a74ea841a，发布标签 v1.12.0。原 wip/P1-3-capture 存在未提交人物与动作成果，不修改、不迁移、不覆盖；本 demo 不依赖它们。独立 worktree=/Users/xindong/Documents/开拍rally-net-drag-demo。

实现：getShotTarget 第四个参数 netDrag 默认关闭，仅试打页传 true。只扩展网前低触点的 drop 正向拖动；深度连续插值至 6.05 m，飞行时间随拖动增加，仍使用共享空气阻力、漂移、过网与落地计算。轻点、横拖、向后拖、后场、发球、clear/smash 均走原路径；正式 main.js 没有修改。此为实验参数，不是实测专业球路。

证据：
- npm test：730/730，通过，日志 /tmp/rally-net-drag-demo-tests.log。
- npm run build：通过。
- 浏览器侧边栏实际加载 /src/net-drag-demo.html，WebGL 球场正常显示，未被 Service Worker 控制。
- 通过 DOM PointerEvent 驱动实际 Controls：轻点 1.35 m 中路；横拖左路仍短；右上大幅拖 6.05 m；关闭扩展同手势 3.00 m；后场同手势 3.00 m；pointercancel 不出球。
- 共享逻辑回归：镜像两侧、连续深度、过网/落地、未开启选项与既有打法一致，3 项专项测试通过。
- 浏览器工具普通 click 本轮只触发按下，改用完整合成指针序列核对；不能据此宣称真人手势已验收。WebView 窄屏 resize 有缩放，实际 viewport 必须以 innerWidth 读数为准。

局限：固定触点，未接入跑位/连续喂球/对打；沿用旧人物动作，不代表挑球动作完成；实体手机触控与用户手感待验收。无提交、推送、合并、部署或版本修改。

复测：PORT=3217 HOST=0.0.0.0 LEADERBOARD_PATH=/tmp/rally-net-drag-demo-leaderboard.json npm start，源码变动后重启快照服务；入口 /src/net-drag-demo.html。轻点吊球 → 再试一球 → 右上拖吊球 → 关闭扩展重复对比。

文件指纹：
- `shared/game.js` SHA256 `6a21220cd5cb6d49a8754eccf9416ef435e671c2502f4d675075c1e4a1e69180`
- `src/net-drag-demo.js` SHA256 `eba2b245fceef21a2d0696a8032111ccd3005ab67b871e60eed058342e3eac3d`
- `src/net-drag-demo.css` SHA256 `2c11075bb183ea15b7a2549bf48532fb2c6687ee4fb4e446bc6f871def767941`
- `src/net-drag-demo.html` SHA256 `12708c389b9b63617dd03dca229bb441ec886ae3b5b1517ba7c213d8f203157c`
- `tests/net-drag-demo.test.js` SHA256 `8c3c33bdbd195668964f7d4acc70d97ae4f1d8df7c458019162ab2c231b54d1b`

## 完整比赛接入 · 2026-11-04

入口 /?netDrag=1 在人机和训练中设置玩家侧 netDragSide，普通入口、陪练与好友对战不开启。预瞄和真实触球共用计算，返回菜单保留试打参数。

验证：733/733，日志 /tmp/rally-net-drag-game-tests.log；构建通过。6项专项测试覆盖原路径保持、连续深度、镜像、实际stepMatch触球/落地/计分、配置序列化与轻点整段比赛一致。

浏览器完整UI：人机对战 → 开始比赛 → KeyJ按下/松开发球 → 陪练接回 → 比分0:1进入第2分。诊断netDragPlaytest=true；未注入内部比赛状态。

局限：完整UI尚未亲手完成网前深拖回球；定点Controls与真实stepMatch分别验证，手机手感等待用户试玩。沿用现有动作；未做专项挑球动画。普通入口需回读netDragPlaytest=false。

当前文件指纹：
- src/main.js SHA256 f7a41fd24d26b9c2708dc04b3e98db2b204a19de3fa8d621bf9cac9e74d19e67
- shared/game.js SHA256 098a0f475b414e995b0a1eddd001396d5ee6aae23df99a2edb8b5a92ca2e16df
- tests/net-drag-demo.test.js SHA256 79176512578afe6d2c081199ac45ab3daaf161409b70fff7310e35886336aae4

最终快照 a8d98e00cd7fc2ef。重启任务服务后逐字节核对 /src/main.js 和 /shared/game.js 与源码一致；任务源 Service Worker 注销后跨 localhost 导航再返回，完整页读取新 buildId。

## PR前验证 · 2026-11-04

用户已明确授权创建PR并在测试通过后合并。范围保留为人机/训练试打入口，普通入口和好友对战维持原行为；此实验入口不递增正式版版本号。

自审修正定点页importmap根路径为相对路径，避免Pages子目录加载失败。新增根路径与Pages构建依赖解析检查；734/734全量测试与构建通过，构建d7e2d3f4cd2527d2。逐文件检查源码和测试，无新增依赖或资产。

本轮完整页面再次开局成功；截图请求未返回，停止等待，未能附新截图。前轮实际球场画面已查看，仍不声称实体手机触控或完整网前真人回合验收完成。
