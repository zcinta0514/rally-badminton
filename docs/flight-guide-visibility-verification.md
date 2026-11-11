# 球路清晰度验证（1.20.1）

基于 main `977cf94444a35aafcac90b91db768c38f8927b8b`，保留 1.20.0 的球路预测、音乐和灯光亮度功能。

原线条约 1 像素宽且线尾衰减明显。第一轮加粗和重描边后，用户反馈过于夸张。本轮预期线宽 2、来球线宽 1.65；底衬仅比主线宽 0.8，透明度从 0.86 降为 0.18；主线采用淡粉/淡青，远端逐渐减弱。使用 Three.js 固定屏幕宽度线段，复用实例缓冲。只改变表现，不修改预测或出球物理。

## 参考与取舍

- [PES 2014 官方手册，定位球章节](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/250870/manuals/PES2014_PC_UK.pdf?t=1573598093)：按键显示预期飞行引导，借鉴按需显示的用途。
- [EA FC 官方任意球说明](https://help.ea.com/en/articles/ea-sports-fc/free-kicks/)：轨迹线辅助调整旋转与高度，Dead Ball 特性提供更长预览。借鉴引导有信息范围，不应理解为结果保证。
- [EA PGA Tour 官方设置说明](https://www.ea.com/able/resources/ea-sports-pga-tour/ea-sports-pga-tour/pc/gameplay)：描述局部弧线和完整弧线的区别，借鉴显示范围需要克制的思路。该说明中的具体选项可能对应早期版本，不作为当前游戏默认值依据。

本项目保留完整击球意图和短段来球预览，采用较弱的远端表现。以上资料用于设计参考；这里的线宽、颜色、透明度是针对本项目手机画面调整的数值，不是从其他游戏测得的参数。

## 已执行

- 43 项相关 Node 测试通过：flight-guide、ground-hints、model-build、view-dispose、release-version、release-notice、performance、pwa-cache。包括 240 次连续切换球种、方向与接球方，检查单条引导、当前轨迹范围、有限坐标、短线段和 GPU 缓冲复用，防止旧线残留或跨段连接。
- root 和 Pages 资源构建由 model-build 测试验证，新增线段依赖均离线打包。
- 本地服务 `http://127.0.0.1:3348/`，版本 1.20.1，构建 `1d03d81bcdced38c`。
- Chrome 手机触控模拟：844×390 和 568×320。实际进入比赛，按住发球、拖动改变预期线、松手出球；固定来球场景覆盖接球与高远/吊球/杀球预期。
- 同一浏览器脚本追加每种尺寸 9 次快速换线、暂停冻结、退出清除、重开与恢复比赛；均通过。持续输入使用 21 分局，避免默认 5 分局在场景完成前结束。
- 两种尺寸分别检查绿、蓝、紫、粉四种球场，以及粉色球场 180% 亮度。虚线可辨认，按钮可操作，无页面或 WebGL shader 错误。
- 自动结果与截图位于本地 `artifacts/flight-guide/`（不提交生成物）。

复跑：设置 `RALLY_QA_URL` 指向当前源码启动的服务，设置 `RALLY_PLAYWRIGHT_MODULE` 指向本地 Playwright，再运行 `node scripts/verify-flight-guide.mjs`。

此结果为 Windows Chrome 浏览器模拟，不是真机或 iOS Simulator 验证。此补丁增加一层描边绘制；未测真机帧率。用户已确认当前表现并授权测试通过后合并；线上状态需在合并部署后单独核验。
