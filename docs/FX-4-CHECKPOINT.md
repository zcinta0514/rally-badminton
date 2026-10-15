# FX-4 检查点：地胶配色可选与独立入口

2026-10-15 在独立 worktree `.cindy-worktrees/fx-4-court-colors`（分支 `feat/FX-4-court-colors`）完成实现与两轮用户验收。
基线为联网核验的 `origin/main` `dcf053230b36`（`git ls-remote` 与实际 fetch 一致），任务卡 [FX-4](tasks/FX-4.md)。

## 交付内容

- `src/court-palettes.js`：四套地胶配色定义（经典绿／赛事蓝／紫罗兰／玫瑰粉）与回退规范化；经典绿保持现有 `0x0c7054` 不变。
- `src/view.js`：`makeCourt()` 按当前配色构建地胶／外场／场边 accent／底座四层材质，`setCourtPalette(name)` 运行时原位换色（材质复用，不重建场景）。
- `src/arena-preferences.js`：偏好新增 `courtPalette` 字段（默认 `green`，未知值回退，旧存档兼容），随音量一起读写并纳入更新前偏好迁移。
- `src/palette-picker.js` + `index.html` + `src/ui-match.css`：比赛屏右上角独立「配色」入口（圆点显示当前颜色），浮层 2×2 色块选择；设置面板内的配色下拉已移除。
- `src/match-settings.js`：移除下拉绑定，新增 `selectPalette(name)` 作为唯一状态出口；`src/main.js` 统一协调偏好保存、场馆换色与入口选中态。
- `scripts/capture-fx4-palettes.mjs`：可复现的 Playwright 截图／持久化核验工具（可选外部 QA 工具，非游戏依赖）。

## 色值与参考

| 配色 | court | apron | edge | dark | 参考 |
| --- | --- | --- | --- | --- | --- |
| 经典绿 | `0x0c7054` | `0x1c4248` | `0x3d7069` | `0x14383c` | 现有默认，逐字节保留 |
| 赛事蓝 | `0x154473` | `0x1e324a` | `0x415970` | `0x192838` | BWF 赛事主流蓝 |
| 紫罗兰 | `0x73589e` | `0x483861` | `0x776494` | `0x362b47` | 2024 巴黎奥运紫调 |
| 玫瑰粉 | `0xa14d72` | `0x633449` | `0x8f5871` | `0x452634` | 商业球馆浅玫粉方向 |

- 紫色按用户第一轮反馈（"太深"）调浅：真实照片（巴黎奥运紫色区域）取样均值 `RGB(122,108,163)`／`#7A6CA3`，调浅后游戏截图紫色区域均值 `RGB(135,101,171)`／`#8765AB`，两者观感对齐；对比图 `artifacts/fx4/20261015-lighter/compare-purple-vs-real.png`。
- 粉色同轮调亮为浅玫粉；公开渠道未找到可作像素级对齐的粉色地胶实拍（真实赛事案例为绿／蓝／红，2023-24 杭州总决赛为红色），待用户提供具体球馆照片可再校准。
- 调研更正：2024 巴黎奥运会为绿色场地 + 紫色外场；杭州 BWF 总决赛场地为红色，均非粉紫地胶。

## 已核验证据（2026-10-15）

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全量回归 | 709 项通过，0 失败（`npm test`） | 本检查点记录；Node v24.21.0 |
| 构建 | PWA `a691ee18f5a7129b`（`npm run build`） | 本检查点记录 |
| 配色单元测试 | 四套定义完整、白线对比度 ≥ 4.5:1、亮度阶梯、色相区分、回退 | `tests/court-palettes.test.js` |
| 偏好存储 | courtPalette 读写、旧存档兼容、损坏 JSON 回退 | `tests/arena-preferences.test.js`、`tests/update-preferences.test.js` |
| 场馆换色 | 构建取色、运行时切换材质复用、未知名回退 | `tests/view-court-palette.test.js` |
| 独立入口 | 选项生成、选择回调、选中态、Escape／外部点击关闭 | `tests/palette-picker.test.js` |
| 应用集成 | main.js 装配与灯光／联机路径无回归 | `tests/connection-recovery.test.js` |
| 实机截图与持久化 | 四色切换即时落盘、reload 保留（pink）、0 页面错误 | `artifacts/fx4/20261015-entry/report.json`（sha256 `30eac38bdbfceed7`） |
| 入口视觉 | 「配色」按钮 + 浮层四色块（当前项高亮） | `artifacts/fx4/20261015-entry/palette-panel.png`（sha256 `d2ac5620c1acc725`） |
| 四色实机画面 | 绿 `e2adec30a191b6c9`／蓝 `acc151e663215567`／紫 `c0776cd8a4a8efe8`／粉 `791422e2aef38281` | `artifacts/fx4/20261015-entry/court-*.png` |
| 真实参考对比 | 巴黎奥运实拍 vs 游戏紫罗兰 | `artifacts/fx4/20261015-lighter/compare-purple-vs-real.png`（sha256 `b58f6be681e7a37c`） |

截图与报告位于被忽略的 `artifacts/`（不入库）；哈希为 sha256 前 16 位，用于找回对应文件。

## 用户验收记录

1. 第一轮：颜色整体通过前，用户反馈"紫色和粉色太深"，要求调浅并对照真实球场配色 → 已调浅并提交对比图。
2. 第二轮：颜色调浅通过（"OK了"）；同时要求换配色入口"更明显、独立出来" → 实现独立入口并交付截图。
3. 第三轮：用户确认补任务卡与检查点、提交归档（本文件）。

## 局限与未完成

- 手机真机 30 分钟／稳定 60 帧、横屏触控实测未做（用户自理）。
- 联机对打时双方各自的配色视觉未做双机实测；实现为本机偏好（不上传、不影响对手与判定）。
- 粉色仍无权威实拍基准，如需终版校准以用户提供的参考为准。
- 菜单页入口（未开打时换色）未做；当前入口与「视角」「设置」一致，仅在比赛屏显示。

## 回退

- 移除本任务提交即回到单一绿色球场；旧存档中 `courtPalette` 字段因未知自动回退，不影响启动与联机。
- 恢复默认：设置面板「恢复默认」或清除 `localStorage` 键 `rally.arena.v1`。

## 下一步

推送分支并建立 Draft PR；合并策略与是否随下一批发布由用户确认。版本号未在本任务内调整，发布门槛满足时再按整批改动确定。
