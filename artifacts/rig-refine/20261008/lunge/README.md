# 2026-10-08 承重下沉与回撤候选

交付：`candidate-06/rebuild.blend`。`apply.py` 已冻结，SHA256 `ebd8eab1abe2464952468fc26f448f166be9b685547806573a45d959145c8d4f`。

本目录只是骨骼动作候选。独立检查未认证最终表面、导出或专业动作完全还原。主线程把脚本应用到保留已修表面的输入后，必须重新运行全段身体、球拍、关节、支撑和导出检查。

## 固定重现命令

```sh
artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python artifacts/rig-refine/20261008/lunge/apply.py -- --input artifacts/rig-rebuild/20261007/integration/author-body-13/rebuild.blend --output artifacts/rig-refine/20261008/lunge/reproduced
```

允许 `--input` 指向同一新版骨架的其他已修输入；必须只应用一次。输入有不同根/腿动画时，输出并不等同本目录候选。不得用本目录的 DQ author 候选覆盖已经修复的最终表面。

## 修改范围与依据

- 依据本地实际比赛 `2_18_14.mp4`，25 fps，重点原片 513–519、521–535。脚本以 120 fps 制作帧对应原片 `480 + f × 25 / 120`。
- 仅改 `CTRL_root` 位置、双腿/脚/脚掌控制与腿 IK 标记，范围原片 508–539。保留骨长、静止网格、约束范围、上身/双臂/手指局部曲线和球拍握持。
- 515–517 骨盆协同下降，后膝朝下收低；518 起卸载恢复。515 左后膝投影从约 (264,205) 到 (258,217)，517 从 (262,202) 到 (254,214)。像素来自固定近似相机，仅用于轮廓比较，不是真实三维关节测量。
- 后脚围绕前脚掌支点转向，最大额外 yaw −40°、额外抬跟 10°，接触区间保持固定。**这是可行的三维重建假设，不是原片测得角度**；远处后鞋只有十余像素且与小腿重叠。未强行追逐 ±8–12 px 的模糊膝轮廓。
- 回撤骨盆向支撑侧转移并回升：525 右膝几何屈曲约 82°→57°，530 约 56°→43°，减轻宽蹲回位。
- 未删改上一轮 `final/source-contact-contract.json` 的支撑窗口。已废弃的早段双脚支撑推断仍由上一轮合同保存，不新增错误支撑锁定。

## 独立核查

`candidate-06/construction.json` 保存参数和每个制作帧的双腿求解数据；`control-support-qa.json` 覆盖 961 个 240 Hz 采样；简表见 `summary.json`。

- 上身受保护局部矩阵差 0、静止顶点差 0，约束未改，实际约束越限 0。
- 足部端点最大求解误差约 2.16 µm，无伸长求解。
- 改动范围内右支撑最大漂移 0.160 mm、左支撑 0.116 mm；整段最大 1.597 mm 来自未改的原片 487–491 早段。
- 原片 508–539 外脚底表面差约 0.00035 mm（数值误差）。
- **DQ 输入仍继承旧制作版早段近单位 scale 的 13.765 µm 骨长数值误差，未标为通过最终 10 µm 门槛**。主线程使用已 unit-scale 的最终输入并重新核查。

## 已看画面与保留问题

- `candidate-06/pairs/`：513、515、517、519、523、525、530、535 原片/候选同帧对照。
- `candidate-06/close/`：510、515、517、519、525、530 的左侧、背后、三分之四近景。
- 独立原片复查认为 06 的近地后膝、起身时序与回撤伸腿均比上版改善；517 侧/后视可读作后腿正常屈曲、足掌支撑与抬跟，未见明确反关节。
- DQ 膝前/膝后仍存在压缩折角和凹陷，必须由合成后的表面核查处理。不能以远景改善或角度门槛代替表面验收。
- 530 三分之四近景中拍头与前腿投影重叠，单图不能判断真实穿插；最终整体 QA 必须覆盖全部球拍网格与身体。
- 回撤换步幅度、体型和近似相机仍有差异；未标记专业还原或用户自然度验收通过。

`candidate-01` 到 `candidate-05` 是保留试验，不能作为当前交付；没有新版本号、发布或线上替换。

## 合成后下肢表面修复交付

动作合成到 `combined-02/rebuild.blend` 后，深屈膝与旧时间修形不再一致。新增表面交付为 **`surface-08/rebuild.blend`**，SHA256 `02d75b732ecccf2e3bd635f0800091c8132e660b05b81ec26704f5f1d299d0ba`。此文件仅供主线程提取 281 个 `Oct08Lower_` 新形键及其动画曲线；保留所有原形键、骨骼动作和蒙皮权重，不覆盖髋代理修复。

```sh
artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python artifacts/rig-refine/20261008/lunge/solve-lower.py -- artifacts/rig-refine/20261008/combined-02/rebuild.blend artifacts/rig-refine/20261008/lunge/surface-reproduced
artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python artifacts/rig-refine/20261008/lunge/audit-lower.py -- artifacts/rig-refine/20261008/lunge/surface-reproduced
artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python artifacts/rig-refine/20261008/lunge/audit-lower.py -- artifacts/rig-refine/20261008/lunge/surface-reproduced --dense
```

`solve-lower.py` 冻结 SHA256 `3ea2ffb54640df70e48dff02514ce747d5d86c6d0fdc3613fab165cc3487370c`。膝后径向压缩比例 32%，另允许距压缩种子最多 12 mm 的局部接触/边长/有向面积松弛；实际相对于 `combined-02` 的最大追加位移 **35.8135 mm**，没有声称整体只有 12 mm。可动域限制于静止位置 `.035 ≤ z < .85`，足底和更高的髋部表面固定。

失败归因：单纯 25 mm 接触排斥留下深屈膝大腿/小腿交叠；原面积约束仅覆盖膝中心 16 cm，漏掉实际接触到的远端后侧软组织。扩大至 32 cm 并使用有向面积约束后，可用 32% 连续后侧压缩清除交叠。43% 试验虽然困难帧通过，但组织压缩更明显，未采用；新 DQ 表面直接替换也不能解决本来存在的深屈接触，未采用。`surface-01` 至 `surface-07` 的失败/对比记录保留。

- `surface-08/lower-qa.json`：全段 240 Hz、961 姿态，下肢自交 0，双膝/双踝原 `.35–1.8` 边比门槛全过。
- `surface-08/dense-lower-qa.json`：改动范围及边界制作帧 132–285、480 Hz、613 姿态，同门槛全过。
- 足底表面差 0、静止位置 `z ≥ .85` 表面差 0；所有新增键在 0.5 制作帧网格上，没有导出会丢失的独立四分之一帧尖峰。
- 已查看 517 左侧/背后、525 侧面近景，膝后为较细压缩褶；独立复查认为 32% 比 43% 克制，未见整段小腿塌薄。不能把静态近景当作用户自然度验收。
- 本单项通过不代表髋部或全身已通过。主线程合并分区修形后仍须完整身体/球拍/支撑/导出检查。
