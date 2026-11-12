# 球路提示与操作舒适度（1.20.2 预览）

基于正式版 1.20.1，main 33a64f16。手机单机用户反馈加线后难看清、打不准、不跟手。

排查发现旧逻辑在不能击球时，用考虑未来跑位的触球点显示完整出球线，且覆盖来球提示。可复现显示出球线但原地松手接不到球。控球、击球规则没有随辅助线修改。电脑 568×320 浏览器开/关/关/开对照均约 16.7ms 中位帧间隔，辅助线更新 P95 约 0.2ms；此结果不代表手机 GPU 性能，也不能排除真机掉帧。

本次仅调整显示：不可击时保留来球线，可击且按住后显示最多 0.35 秒、且不超过总飞行时长 45% 的出球方向；设置开关立即停止辅助线更新与显示，选择保存在 arena preferences。地面落点、移动、击球判定和物理保持原有行为。默认开启，关闭后可直接对比无球路线的玩法。

验证命令：`node --test tests/flight-guide.test.js tests/arena-preferences.test.js tests/model-build.test.js tests/release-version.test.js tests/ground-hints.test.js tests/view-dispose.test.js tests/menu-audio-preferences.test.js`；浏览器回归使用 `scripts/verify-flight-guide.mjs`。本地测试资料位于 `artifacts/flight-guide/`。

本轮结果：30 项相关测试通过，root/Pages 打包通过。Chrome 手机模拟 844×390、568×320 实际发球与拖动、提前按住仍保留来球提示、可击后三种短球路、设置开关、退出清除、暂停恢复和重开通过，无页面或 shader 错误。844×390、568×320、390×844 设置面板在屏内，开关刷新后保持选择。预览 http://127.0.0.1:3349/ ，构建 cc676e81457202cd。

真机舒适度仍需用户对比，不能以自动化通过替代手感验收。未授权发布本轮预览。
