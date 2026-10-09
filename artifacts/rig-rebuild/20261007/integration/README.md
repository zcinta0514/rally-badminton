# 新骨架、支撑步法与重建球拍的最终检查链

此目录属于 P1-3B 的本地动作研究。当前交付是重建骨架、左脚支撑修正、新球拍与五指握拍的一段组合动作。比赛参照为 `artifacts/match-reference/20261006/match15/2_18_14.mp4`，实际帧率 25 fps；对照范围为原片 480–540 帧。人物体型、单镜遮挡及空间位置仍有人工推断，不能把数值 QA 当作专业动作还原或用户自然度验收。

## 冻结输入与身份核对

2026-10-07 读取实际文件，并核对了输入、导出报告、流式运行报告的哈希一致性：

| 文件 | SHA256 |
| --- | --- |
| `final/rebuild.blend` | `f3081bc384c2aff262361102757d89b8de4ee546abd124c5be908aedb94336a4` |
| `final-export/clear.glb` | `a0ae1b16210ac72d7559ee2b724cdd4aa2c94eb423d9e1ac974447f9a6c616a6` |
| `runtime-stream/morph-stream.mjs` | `9cad3fc031551bdb27297b08a8520704e297fef9b495f32215645ce988a3bd69` |

`final-export/fixture.json`、`final-export/export-parity.json` 与 `runtime-stream/runtime-parity.json` 均指向上述同一 Blender 输入和 GLB。`ankle-residual/candidate-03/rebuild.blend` 与 `final/rebuild.blend` 内容相同，局部加密报告中的 `sourceSHA256` 也匹配。`final/final-qa.json` 和 `final/finger-full-qa.json` 是源文件的动作／表面检查；它们自身不记录源哈希，不应被单独用作资产身份凭据。

当前状态、浏览器实际加载记录和未完成项由项目状态入口、`checkpoint.json`、主线程的浏览器 QA 管理。本文件说明固定产物与复现方法，不替代实时项目状态。

## 上游制作文件索引

以下链条保留中间文件，用于追查表面与动作的来源；中间候选的局部通过不等于整段通过。

| 阶段 | 产物／入口 | 作用与证据 |
| --- | --- | --- |
| 作者动作 | `author-body-13/rebuild.blend`、`author-body-13/build.json` | 继承 `author-steps-12` 的步法和持拍侧，加入非持拍臂的连续后摆、展开和回收；仍是有限序列作者文件。 |
| DQ→LBS 编码 | `bake-lbs.py` → `body-lbs-14/rebuild.blend` | 把作者表面编码为最多 4 权重的 LBS 与姿态修形；`body-lbs-14/bake-qa.json` 记录 481 整数姿态最大表面差 0.968461 µm。此项不代表后来半帧或任意姿态通过。 |
| 通用局部接触松弛 | `solve-surface.py` → `body-skin-15/rebuild.blend` | 接触分离、边长及有向面积约束；`body-skin-15/contact-skin.json`、`failures-by-region.json` 保留当时修形与残余失败。 |
| 深屈膝专项替换 | `knee-fold/solve-local-06.py` → `knee-fold/candidate-06/rebuild.blend` | 替换后侧小腿／远端大腿的错误方向通用修形，采用角度驱动的局部软组织压缩；详见 `repair-summary.json`、`local-qa.json` 和 `half-grid.json`。候选当时仍有范围外踝部穿插。 |
| 消除数值缩放漂移 | `unit-bone-scales.py` → `unit-scales-16/rebuild.blend` | 从 candidate-06 移除非故意的近单位控制骨缩放；`rebuild.scale-qa.json` 记录最大原偏差 `2.294778823852539e-5`。修改后重新做整段 QA。 |
| 半帧表面余量 | `repair-half-poses.py` → `final-skin-17/rebuild.blend` | 输入为 `unit-scales-16`；补充整数采样之间的接触修形。 |
| 踝部过渡修形 | `repair-ankle-band-18.py` → `final-skin-18/rebuild.blend` | 输入为 `final-skin-17`；保留这一轮后仍待处理的局部过渡问题。 |
| 最终踝部残余 | `ankle-residual/solve-03.py` → `ankle-residual/candidate-03/rebuild.blend` | 输入为 `final-skin-18`；使用半帧网格包络替换左前踝的重叠窄修形。方法、范围和限制见该子目录 `README.md`。 |
| 冻结整合源 | `final/rebuild.blend` | 与 candidate-03 内容及哈希相同，重新完成整段身体／球拍／支撑、手指、导出及运行一致性检查。 |

**膝部修形幅度必须单独披露：** `knee-fold/candidate-06/repair-summary.json` 记录相对原 `body-lbs-14`（关闭继承的通用 `EdgeContactMargin` 修形）的最大累积位移为 **45.769054 mm**。这是角度驱动的后侧软组织压缩与局部松弛的总效果；局部松弛的 10 mm 上限不是总修形上限，不能用它声称“整体仅改 10 mm”。撤回并替换先前方向错误的修形后，相对 `body-skin-15` 的最大位置变化为 **64.117347 mm**。该改动可解除此序列的皮肤相交，但幅度较大，需要继续结合模型体型、膝后软组织和比赛动作检查；不能据此宣称通用解剖重建已完成。

## 时间基准与处理顺序

1. **Blender 源：120 fps，0–480 帧，4 秒。** 原片帧与模型帧的关系为 `modelFrame = (sourceFrame - 480) * 120 / 25`。原片 540 帧对应模型 288 帧／2.4 秒；模型 288–480 帧为制作出的末端停留，并非额外实拍动作。
2. **表面检查：240 Hz，961 个整数及半帧姿态。** 身体、全部 8 个球拍网格、关节、支撑脚均显式覆盖。踝部另对两个危险区间做了局部 480 Hz 检查。
3. **压缩修形：保留 961 个独立半帧表面。** 不仅采整数帧；在整数邻帧为零、半帧独立生效的修形也保留。压缩前后全部 961 姿态的误差必须小于 2 µm。
4. **导出副本：240 fps，0–960 帧，仍为 4 秒。** 仅将副本的时间轴等比例放大，以便 glTF 导出器在每个原半帧实际采样。作者源不改。不要把副本 `export.blend` 的帧号当成 120 fps 源帧号。
5. **GLB 一致性：标准 Three.js 加载，全 961 姿态。** 每个身体顶点及所有 UV／材质分裂、8 个球拍网格和 10 个接口标记均核对，误差门槛仍为 10 µm。
6. **实时预览：CPU 流式修形 + 标准骨骼蒙皮。** 保留全部 CPU position／normal 目标，按原权重插值更新当前两个非零样本。首 render／compile 前清空 GPU morph attributes，避免构造 961 层 morph 纹理。骨骼与球拍动画轨道不变。

源上的有限姿态修形包含这段动作专用的 DQ→LBS 表面补偿、关节接触修形和局部半帧修形。**这些修形不是已验证的通用 rig，也不是任意动作下的自动解剖或碰撞求解器。** 扩展动作、改变握拍或改变骨骼曲线后，必须重新检查，不能沿用本段的通过结论。

## 关键证据与门槛

| 检查 | 文件 | 当前结果与门槛 |
| --- | --- | --- |
| 身体、球拍、肘膝方向、骨长、接缝及支撑 | `final/final-qa.json` | 240 Hz／961 姿态，全部显式 gates 通过；身体与球拍穿插记录为零。骨长误差最大 0.593342 µm，接缝差为零。 |
| 左脚与整体支撑 | 同上；窗口依据 `final/source-contact-contract.json` | 初始左脚支撑漂移 0.033355 mm；左脚所有接受窗口最大 0.396350 mm；所有接受窗口最大 1.420289 mm，小于原 3 mm 门槛。地板 Z 为 −0.013 m，支撑鞋底允许间距为 −1 至 +5 mm。 |
| 关节及手指表面 | `final/final-qa.json`、`final/finger-full-qa.json` | 以原始长度至少 5 mm 的边检查长度比，门槛保留 0.35–1.8；双侧肩／肘／腕／髋／膝／踝与五指均有明确覆盖。五指严重异常帧为零。 |
| 踝部局部加密 | `ankle-residual/candidate-03/dense-qa.json` | 原模型 33.5–60.5、205.5–212.5 帧，每 0.25 帧采样，共 138 姿态；身体穿插及局部边长异常记录为零。相对 source18 最大调整 2.404601 mm，8 个顶点，鞋底及局部范围外位移为零。此项不是全片 480 Hz 验收。 |
| 修形压缩 | `final-export/compression-qa.json` | 961 姿态最大差 0.756298 µm，小于 2 µm。 |
| glTF 编码 | `final-export/export-parity.json`、`final-export/fixture.json` | 一条 4 秒 clip；961 姿态、9 个网格、10 个标记。最大表面差 5.047955 µm，标记差 2.418002 µm，均小于 10 µm。 |
| 小权重保留 | `final-export/skin-encoding.json` | 仅在导出 Python 进程中覆盖厂商的 `≤0.0001` 权重丢弃逻辑，保留所有正权重，超过 4 个正骨权重即拒绝。未修改 Blender 安装、作者源权重或几何；原模块哈希与保留项有记录。 |
| 流式运行一致性 | `runtime-stream/runtime-parity.json` | 同一 fixture、同一 961 姿态与 10 µm 门槛；最大表面差 5.047952 µm、标记差 2.418002 µm。与原标准 Three.js 顶点路径最大差 0.021662 µm，法线分量最大差 `2.98023224e-8`。 |
| 流式运行契约 | `runtime-stream/contract-tests.json` | 两样本位置及法线保留；缺法线、NaN、超过两个非零修形样本会报错，不静默舍弃。 |

支撑窗口不是根据“怎样容易通过”决定的。原片 497–500 帧的旧双脚锁定假设已被单脚支撑观察替换；旧窗口的漂移仍保存在 `legacySupportComparison` 中。新窗口、原片证据、左右脚判定置信度和未解决的遮挡在 `source-contact-contract.json` 中逐项记录。

## 从冻结 Blender 文件复现导出

以下命令从项目根目录执行，使用新输出目录；不要覆盖冻结的 `final-export/`。本次编写文档仅核对已有文件，未重跑这些验证。

```sh
RALLY_BLENDER=artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
RALLY_INTEGRATION=artifacts/rig-rebuild/20261007/integration
RALLY_EXPORT_DIR="$RALLY_INTEGRATION/repro-export"

"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python "$RALLY_INTEGRATION/export-tools/export.py" -- \
  --input "$RALLY_INTEGRATION/final/rebuild.blend" \
  --output "$RALLY_EXPORT_DIR"

node "$RALLY_INTEGRATION/export-tools/check-export.mjs" "$RALLY_EXPORT_DIR"
```

导出器保留全部球拍网格和握柄／拍面／接触点接口，记录作者源、脚本及产物哈希，并输出 float32 二进制 fixture。身体材质仅在导出副本换为诊断预览的中性 PBR；新球拍材质保留。任何压缩或导出门槛失败都应停止，不得放宽门槛或改写真值。

如需复验源，`audit-final.py` 的必要参数为 `--input`、`--output`、`--racket-manifest final/racket-manifest.json` 和 `--support-contract final/source-contact-contract.json`；路径以本目录为前缀。手指检查入口为 `check-final-fingers.py -- <含 rebuild.blend 的目录>`。请在复制的源／QA 输出目录运行，避免改写冻结证据。

## 接入侧栏与逐帧比较

`preview.html` 在 GLTFLoader 完成后、第一次渲染前调用 `runtime-stream/morph-stream.mjs` 的 `prepare(gltf)`。返回的 `stream.clip` 交给 AnimationMixer；每次正常播放或拖动进度，用相同局部秒数调用 `mixer.setTime(t)` 和 `stream.update(t)`。详细接口及独立复验命令见 `runtime-stream/README.md`。

当前运行方法为在项目根目录启动：

```sh
node artifacts/rig-rebuild/20261007/integration/serve.mjs
```

服务地址是 `http://127.0.0.1:3040/`。重要路由如下：

| 路由 | 实际文件 |
| --- | --- |
| `/` | `preview.html` |
| `/match-rebuild.glb` | `final-export/clear.glb` |
| `/runtime-morph-stream.js` | `runtime-stream/morph-stream.mjs` |
| `/review-config.json` | `review-config.json`，含期望模型哈希 |
| `/match-authoring.blend` | `final/rebuild.blend` |
| `/racket-model.blend` | `artifacts/racket-rebuild/20261007/racket.blend` |
| `/reference-frames/0480.jpg` 至 `/reference-frames/0540.jpg` | 原片连续帧裁剪 |
| `/normal-speed-comparison.mp4` | `normal-speed-comparison.mp4` |

服务启动时构建资源快照。修改资源后必须重启对应服务，并核对 `served-hashes.json`、HTTP 返回和浏览器实际加载的模型／模块哈希；旧标签一次刷新不构成核验。复验输出目录不会自动替换当前展示资源，若切换产物，服务入口和 `expectedModelHash` 必须一并更新。不要根据端口可访问或 Node QA 通过宣称浏览器已正常播放。

流式路径仍保留 167,928,984 字节 CPU 修形数据；每帧 position＋normal 缓冲为 174,744 字节，GPU morph target 数为零。这解决的是预览传输及着色器规模，不构成手机性能或用户视觉验收结论。

`browser-qa.json` 记录当前浏览器核验：66 项实际加载资源哈希与服务清单一致，61 个原片帧映射、8 个视角 API 和重复采样一致性通过。但是 WebView 视口为 **1×1**；首次约 1.512 秒的播放探针中动画时间与渲染计数未推进，后续独立工具调用间的探针则在 1.0199 秒墙钟内观察到动画推进 0.2829 秒、渲染 2 次。结论是**后台计时受限／不连续，尚未核实可见正常速度与流畅度**，不能把其中一次静止或一次推进当作播放验收。两次 pointer 点击均未命中元素，按钮交互状态仍为 `not_verified`。最终控制状态保留 front、1×、playing；这些结果仅证明加载、API 采样、视角渲染及资源一致性，不能称播放通过。

## 仍未通过的范围

新球拍已重新建模、挂接右手并结合五指包握验证，但 **flight／球路尚未按新拍面、接触点和人物动作重新校准**，不能将本轮结果视为触球物理通过。旧球路资源或历史预览只作为对照。

`reference-review/final-rebuilt-review.json` 记录 480–540 共 61 个连续原片帧的逐张对照，明确标记 **`professionalFidelity = not_passed`**、`userNaturalnessAcceptance = not_received`。主要残差为：

- **513–519 帧，后膝折叠与承重下沉：** 原片左后膝深折并位于髋下后方；候选后腿投影仍较长较直，躯干较直立，前后弓步承重轮廓不一致。
- **480–495 帧，前进时的躯干配合：** 侧倾、前倾以及胸髋共同转向仍不足；收腿与上身配合不完整。
- **521–535 帧，回位换重：** 分步回撤时的伸屈及换重偏弱，仍较长时间保持相似屈膝轮廓后移。
- 非持拍臂的固定硬弯形态已有改善，但后摆、展开高度和肘部柔和弯曲仍未完全对应。体型与近似镜位也限制绝对像素比较。

该逐帧检查未在当前分辨率发现明确反关节，但也明确记载 `reverseJointAbsenceProven = false`。几何门槛通过不能替代专业动作还原，也不能证明任意时刻、任意视角完全没有解剖错误。正常速度的自然观感和其他羽毛球动作仍待验收；当前仅覆盖一次上网挑球及回位的研究序列，不代表全部动作库、连续对打、任意组合姿态或通用骨架均已完成。
