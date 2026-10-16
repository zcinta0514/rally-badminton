# RELEASE-1.10.0 发布检查点：地胶配色

2026-10-15 在 worktree `.cindy-worktrees/fx-4-court-colors`（分支 `feat/FX-4-court-colors`，PR [#5](https://github.com/zcinta0514/rally-badminton/pull/5)）准备并执行 1.10.0 发布。
基线为联网核验的 `origin/main` `dcf053230b36`（v1.9.0 发布文档合并）。用户确认上线（"合并 PR #5 并发布"）。

## 发布范围

- FX-4：四套地胶配色（经典绿／赛事蓝／紫罗兰／玫瑰粉）与比赛屏右上角独立「配色」入口；`courtPalette` 本机偏好保存，随更新迁移。功能细节、取样色值与截图证据见 [FX-4 检查点](FX-4-CHECKPOINT.md)。

发布**不包含**：在制人物实验（P1-3／V3／V4 资产与入口）、FX-3 灯光迭代未合并部分、其它未合并候选分支。

## 版本号

按整批实际改动确定为 **1.10.0**（1.9.0 → 1.10.0；面向玩家的功能与体验更新递增次版本位）。同步更新：`package.json`、`package-lock.json`、首页「正式版」、玩家更新公告（`src/release-notes.js`）、README、部署与公开网站说明。

## 已核验证据（1.10.0 版本号确定后重跑）

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 全量回归 | 709 项通过，0 失败（Node v24.21.0） | 本检查点记录 |
| 版本一致性 | `package.json`／`package-lock.json`／首页「正式版 1.10.0」一致 | `tests/release-version.test.js` |
| 玩家公告 | 根路径与 Pages 构建均嵌入新公告 `2026-10-15-court-palettes`，线上更新路径实际弹出 | `tests/release-notice.test.js`、`RELEASE-1.10.0-QA.json` |
| 构建 | PWA `31e7cd941732fbc7`（87 个资源） | `npm run build` |
| 功能证据 | 四色实机截图、独立入口、reload 持久化、0 页面错误 | `docs/FX-4-CHECKPOINT.md`、`artifacts/fx4/20261015-entry/report.json` |

## 合并与部署（2026-10-16 已核验）

- 合并：PR [#5](https://github.com/zcinta0514/rally-badminton/pull/5) → `main` 合并提交 `6aecf9a878ed901ee0609ff591e93d2ff7d875c0`；标签 `v1.10.0`（annotated `bd41d950b2473001e1c1b884022ac963c61acf4c`）指向该提交。
- GitHub Actions「Tests and build」与「Deploy browser game to GitHub Pages」在 main 与标签上均成功（run 38839954084／38839954128／38839979218）；Vercel 生产部署完成。
- 线上核验：Pages 实际构建号 `152a297fac2bf852`、Vercel `31e7cd941732fbc7`；两处首页均显示「正式版 1.10.0」，更新公告「地胶配色更新」在实际更新路径弹出，进入比赛可打开「配色」入口、切换紫罗兰并本机落盘，页面零错误。完整记录见 [RELEASE-1.10.0-QA.json](RELEASE-1.10.0-QA.json)。

## 回退

- 移除 FX-4 提交即回到单一绿色球场；旧存档 `courtPalette` 字段未知自动回退，不影响启动与联机。
- 线上问题优先用可审查的 revert／修复提交，不重写 main 历史。

## 仍需用户确认的项目

1. iPhone／Android 实体机横屏 30 分钟、稳定 60 帧与触控实测（用户自理）。
2. 联机双人各自配色视觉（本机偏好，不影响对手与判定）。
3. 玫瑰粉如需终版校准，以用户提供的参考为准。
