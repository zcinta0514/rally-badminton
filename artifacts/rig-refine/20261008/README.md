# P1-3B：比赛动作承重、躯干与回撤精修

本目录是任务分支上的研究候选，不替换正式游戏人物，不代表专业动作或手机性能验收。项目当前入口是 `docs/PROJECT-STATUS.md`；本轮固定证据见 `checkpoint.json`。

2026-10-09冻结源：`final/rebuild.blend`，SHA256 `c77cf94202253cb37727a72a002a54e568f9dd597b5fc3d4cbdec39bd344a100`。生成GLB的SHA256为 `5a1cb6a58c66d845c09f9175b59c8b385af48bf6fd6623ca8ac7877f8bddf4f0`。

最终240Hz/961及完整480Hz/1921姿态的身体、8个球拍网格、12关节、弯曲方向、骨长、接缝和支撑原门槛全部通过；支撑最大漂移1.420096mm。压缩最大0.968461µm，导出最大5.434458µm，均低于原2/10µm门槛。流式运行一致性通过。61帧逐张视觉复核为 **improved_not_passed**，见 `reference/final-review.md`。最终自动化视口1×1，未声明可见播放帧率或用户自然度通过。

## 本轮范围

参照 2020 全英男单决赛 TrackNetV2 `match15/2_18_14.mp4` 的远端球员，使用实际 25 fps、原片480—540帧。重编513—519帧后膝下沉与承重、480—495帧躯干前倾和转向、521—535帧回撤伸腿与换重。保留上轮新骨架、球拍、五指握拍和支撑回归。原片541帧之后的下一拍未制作，触球和球路未随新姿势重校。

后脚额外−40°朝向、骨盆位移和胸廓角度属于单镜参考下的三维制作假设，不能称为职业运动员的实测关节角。局部皮肤修形只覆盖本段已采样姿态，不是通用关节碰撞系统。

## 冻结源与制作链

- 上轮底座：`artifacts/rig-rebuild/20261007/integration/final/rebuild.blend`。
- 可编辑 DQ 制作底座：同目录 `author-body-13/rebuild.blend`；其旧数值scale误差有记录，不能直接沿用本轮最终骨长检查结论。
- `torso/apply.py INPUT OUTDIR`：胸廓前倾/转动、头部跟随、持拍臂方向补偿，保留腿/腕指/挂接。
- `torso/repair-surface.py INPUT OUTDIR`：新增上身姿势的肩髋有界表面修正。
- `lunge/apply.py --input INPUT --output OUTDIR`：下肢06参数、骨盆承重与回撤；脚掌支点保留，骨长和关节限制不变。
- `combined-02/` 保留首次合成失败报告：身体穿插206个采样姿态。不能把它当交付文件。
- `torso/repair-hips.py` 和 `lunge/solve-lower.py`：分别处理互不重叠的髋区、膝踝表面。修形幅度、失败尝试及作用域以各目录报告为准，不能将单次松弛上限当作累计位移上限。
- `merge-residuals.py`：在同一骨动画上合并两个独立区域的新增形键，核对顶点域互不重叠及原形键保留；合并本身不等于几何通过。
- 最终交付源、SHA256、QA与仍未通过项由 `checkpoint.json` 明确指定；仅这些文件可用于当前预览。

本轮髋残差增加360键，膝踝残差增加281键，顶点域互不重叠。下肢32%后侧软组织压缩较被拒的43%保留了更完整的膝后接触褶；其最大追加35.8135mm，不能称为“仅12mm修形”（12mm只是压缩种子后的松弛限制）。髋部累计追加10.000233mm，恢复包络关键值均在半帧网格。范围外和脚底不因这些残差移动；不将有限片段结果当作通用解剖保证。

制作时间轴为120fps、0—480帧，共4秒；原片时间关系为 `modelFrame=(sourceFrame-480)*120/25`。原片540对应模型288帧/2.4秒；余下1.6秒是制作末端停留，不冒充额外原片。导出副本按240fps保留全部961个半帧修形表面，物理时长不变。

## 恢复、导出与预览

在项目根目录执行。Node依赖由现有 `package-lock.json` 固定。需要 Blender 5.2.2（含其内置NumPy）；本机应用、node_modules与生成缓存不属于Git源资产。`RALLY_BLENDER` 可改成该机器的Blender路径。

```sh
npm ci
RALLY_BLENDER=artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
RALLY_REVIEW=artifacts/rig-refine/20261008
RALLY_EXPORT=artifacts/rig-rebuild/20261007/integration/export-tools

"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python "$RALLY_EXPORT/export.py" -- \
  --input "$RALLY_REVIEW/final/rebuild.blend" --output "$RALLY_REVIEW/final-export"
node "$RALLY_EXPORT/check-export.mjs" "$RALLY_REVIEW/final-export"
node "$RALLY_REVIEW/check-runtime.mjs" "$RALLY_REVIEW/final-export"
node "$RALLY_REVIEW/serve.mjs"
```

GLB约160MB，是可重生成的编码产物，不直接作为普通Git大文件提交。可编辑的压缩 `.blend`、脚本和检查报告保存到任务分支。`final-export` 内的GLB及浮点验证样本由以上命令生成；恢复时不要拿旧fixture去验证新产物。

要从上一轮底座重做本轮完整动作/修形链，运行 `sh artifacts/rig-refine/20261008/rebuild-candidate.sh 新的输出目录`。脚本拒绝覆盖已有目录，全部原门槛通过后才继续导出。它不自动切换当前预览或上线。日常继续编辑可以直接打开已保存的 `final/rebuild.blend`，不必重做全部历史失败尝试。

`sync-files.json` 是本次GitHub明确选择的文件清单。它保存当前源及复现依赖，不包括其他未提交游戏代码、历史大缓存或广播媒体；旧阶段的README可能引用仅保留在原工作目录的历史候选。本轮完整恢复以本文件及冻结源为准。

需要上轮对照时，用同一导出器从上轮 `integration/final/rebuild.blend` 生成 `integration/final-export/`。服务会在资源存在时显示对照链接。服务启动时固定资源快照；修改后须重启并核对 `served-hashes.json` 与浏览器实际模型哈希。

参考视频与裁剪帧保留在本地，不随本分支重新分发比赛转播内容。已有本地参考帧时，服务读取 `artifacts/match-reference/20261006/lift-frames/0480.jpg` 至 `0540.jpg`；缺少它们时，模型仍可独立预览，参考区明确显示未配置，不伪装成已加载原片。来源记录及观察帧号在参考审查报告中；原视频SHA256为 `e76277c477ebf887de15778585d07fc27dbfb0df926220ad40e499afba900112`。

## 检查边界

`audit-final.py` 延续身体/全部8个球拍网格、12关节边长比0.35—1.8、肘膝弯曲方向、骨长、接缝和支撑门槛，支持240Hz与480Hz。脚底支撑窗口沿用有原片依据的合同；旧错误双脚锁定窗口仍保留作失败对照。导出压缩误差门槛2µm，Blender至GLB全961姿态误差门槛10µm，不因换候选放宽。

无穿插和数值门槛通过不能证明专业动作自然度。最终视觉报告须逐一记录源帧覆盖、明显改善与剩余差异；手机60帧、用户正常速度观感、球路和其他运动样段分别保持未验收，直到有对应证据。

## 资产来源

休止人体来自 Quaternius Universal Base Characters Standard 的 `Superhero_Male_FullBody`，随包CC0条款已完整保留在仓库现有 `src/models/LICENSE-Quaternius.txt`；另保存来源 `artifacts/body-stress/20261004/source/provenance.json`。本轮骨架/动作/修形与重新建模的球拍是项目内制作，不能把肌肉型底模称为真人扫描或某位运动员的实测模型。
