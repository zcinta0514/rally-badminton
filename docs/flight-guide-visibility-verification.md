# 球路清晰度验证（1.20.1）

基于 main `977cf94444a35aafcac90b91db768c38f8927b8b`，保留 1.20.0 的球路预测、音乐和灯光亮度功能。

原线条约 1 像素宽且线尾衰减明显。现在预期线宽 3.25、来球线宽 2.75，外加深色描边；使用 Three.js 固定屏幕宽度线段，复用实例缓冲。只改变表现，不修改预测或出球物理。

## 已执行

- 42 项相关 Node 测试通过：flight-guide、ground-hints、model-build、view-dispose、release-version、release-notice、performance、pwa-cache。
- root 和 Pages 资源构建由 model-build 测试验证，新增线段依赖均离线打包。
- 本地服务 `http://127.0.0.1:3347/`，版本 1.20.1，构建 `25eedda15ac88923`。
- Chrome 手机触控模拟：844×390 和 568×320。实际进入比赛，按住发球、拖动改变预期线、松手出球；固定来球场景覆盖接球与高远/吊球/杀球预期。
- 两种尺寸分别检查绿、蓝、紫、粉四种球场，以及粉色球场 180% 亮度。虚线可辨认，按钮可操作，无页面或 WebGL shader 错误。
- 自动结果与截图位于本地 `artifacts/flight-guide/`（不提交生成物）。

复跑：设置 `RALLY_QA_URL` 指向当前源码启动的服务，设置 `RALLY_PLAYWRIGHT_MODULE` 指向本地 Playwright，再运行 `node scripts/verify-flight-guide.mjs`。

此结果为 Windows Chrome 浏览器模拟，不是真机或 iOS Simulator 验证。此补丁增加一层描边绘制；未测真机帧率。本分支尚未合并或发布。
