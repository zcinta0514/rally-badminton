# V4 近景贴合与独立动作检查点｜2026-09-19

这是 V4 最新工作入口。用户授权继续打磨服装、配件和头脸，然后推进绑定与基础动作；**先不替换正式比赛人物**。用户追加要求：衣服顺着身体曲线自然垂落，不要膨胀、悬浮。当前资产是独立制作/审核版本，不是正式比赛角色定稿。

## 基线与保留

实施前核对根目录 main、origin/main、远端 main、v1.6.1 和两个工作树，均基于 `84b32a8`；保留根目录所有既有未提交成果。原文件归档和资产指纹位于 `artifacts/model-workbench/v4-detail-rig-backup/`。没有提交、推送或部署；产品版本仍为 1.6.1。正式 `src/models/athlete.glb`、Hair ref39、Clothing 和 Polished 检查点均保留。

## 静态近景版

`src/models/athlete-v4-detailed.glb`，预览参数 `model=v4d`，资产修订 `appearance-1.1.0`。

- 收掉腰腹、腰侧和衣摆空鼓，按上臂与三角肌收整肩袖；保持活动余量和独立衣物表面，不贴出腹肌。
- 增加下摆垂向细褶、短裤局部褶皱、缝线和护腕/髌腱带边缘；重建实际袖口与领口边界上的包边。
- 调整技术针织、毛巾护腕、鞋面支撑片、橡胶鞋底的粗糙度与微表面；鞋带交叉、鞋眼、鞋头/侧片缝线独立建模。
- 毫米级调整眉弓、颊部和下颌，增加不规则眉毛纤维、皮肤微法线与粗糙度变化。头发沿用本轮前已建立的短发方向，不宣称达到参考图的扫描人物精度。
- 构建门槛仍是完整人体的顶点/面中心静态穿透采样、球衣/短裤主体自交、开口和非流形检查。没有删除衣服下的身体来隐藏问题。

对应源文件是 `artifacts/model-workbench/athlete-v4-detailed.blend`。静态回读图位于 `v4-detailed-fitted/`，包括正、侧、背、3/4、肩袖、头脸、鞋。

## 分层骨架与基础动作

`src/models/athlete-v4-rigged.glb`，预览参数 `model=v4r`，资产修订 `rig-1.0.0`。

54 根分层骨骼：根、骨盆、脊柱、胸、颈、头；双侧锁骨、上臂、前臂、前臂扭转、手、大腿、小腿、足和趾；双手 30 根手指骨。每顶点最多 4 个归一化权重，使用与 glTF 相同的线性蒙皮。坐标继承 V4，角色左侧在 Blender -X。

| 动作 | 时长 | 当前目的 |
|---|---:|---|
| V4_ready | 2.4 秒 | 准备姿态与轻微呼吸 |
| V4_split-step | 1.6 秒 | 分腿垫步与落地 |
| V4_lateral-step | 3.2 秒 | 侧步移动与回位 |
| V4_reach | 1.8 秒 | 前场伸手和躯干配合 |
| V4_overhead | 2.2 秒 | 头顶挥臂的准备、上举、随挥和回位 |
| V4_lunge | 2.6 秒 | 前场跨步、屈膝和回位 |

动作按 30 fps 烘焙，保持骨长，脚部目标由两节肢体解算。六段回到共同准备姿势。衣物局部接触修形随对应动作导出为形态键；这是这些研究动作的姿势修形，**不是通用实时布料或任意姿势都已通过的保证**。

使用独立 `src/athlete-v4-rigged-preview.js` 加载器，保留真实父子层级、蒙皮矩阵和形态键。没有接入会压平骨架的旧比赛加载器。预览支持慢放、暂停、进度拖动、角度、近景与护具开关。

右手和脚底原有导向点已跟随相关骨骼，但握拍手势、实际球拍 socket、拍面方向和触球时刻仍未校准。当前手指是放松弯曲研究；“头顶挥拍”不是已验收的高远、吊球或杀球，不能直接复用为比赛动作。

## 构建与验收

按顺序运行（Blender 5.2.2，本机需允许独立 Blender 进程）：

```sh
BLENDER=./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
"$BLENDER" --background --factory-startup --python-exit-code 1 --python scripts/build-athlete-v4-detailed.py
"$BLENDER" --background --factory-startup --python-exit-code 1 --python scripts/build-athlete-v4-rigged.py
"$BLENDER" --background --factory-startup --python-exit-code 1 --python scripts/correct-v4-garment-motion.py
"$BLENDER" --background --factory-startup --python-exit-code 1 --python scripts/check-v4-rigged.py -- --dense
node --test tests/athlete-v4-rigged.test.js
npm test
npm run build
```

初始绑定源 `athlete-v4-rigged.blend`；含姿势修形的最终源 `athlete-v4-rigged-corrected.blend`。这些 `.blend` 位于 Git 忽略的 artifacts，需另行备份。最终资产指纹与验收统计以本检查点旁的 `ATHLETE-V4-DETAIL-RIG-QA.json` 为准。

**本轮验收结论：静态贴合版通过几何门槛；动作版未通过全部衣物变形验收。** 最终 GLB 回读覆盖六段共 420 帧，检查完整人体与衣裤/袜/鞋面/护具顶点和三角形中心，容差 1 mm。准备呼吸、分腿垫步采样清零；侧步有一处袜子面中心约 1.80 mm，头顶动作有一处球衣面中心约 1.95 mm；前伸最深约 3.87 mm；弓步短裤裆部最深约 44.85 mm，单帧最多 25 个穿透顶点、42 个穿透面中心。弓步是明确未解决项，不能把渲染图未露肤或回归测试通过写成变形验收通过。

修形只改善已烘焙姿势，目前球衣保留 152 个修形基，短裤 48 个；局部逆蒙皮空间分量最高接近 10 cm，说明裆部需要回到权重/拓扑层修正，不能靠继续加大接触修形或整体撑大衣服来宣称完成。也未证明衣物之间、衣物自身在全部姿势下均无交叉。

静态 GLB 为 5362936 字节，SHA-256 `475c1fd9e667e8663603fdf42de5f4a4c5f8ee3f89b9b653e2df3d20fcb1e52f`；动作草稿为 12801304 字节，SHA-256 `a6a870aa1cb51ecdafa226168bf63163dd13263c80ce869e0d9d29d1cb26799d`。聚合报告由 `node scripts/summarize-v4-detail-rig-qa.js` 生成，它拒绝混用旧 QA 与新 GLB。

全量 `npm test` 611/611 通过，`npm run build` 通过，build id `f12e699e99ca5bf9`。这些测试覆盖加载、权重归一化、层级、骨长、支撑脚、闭环、导出的修形轨和 QA 状态一致性，**不把未通过的布料变形改判为通过**。侧边栏实测暂停/进度、半速播放、切回静态时禁用动作控件；页面读取两份 GLB 的字节数与 SHA-256 均一致。当前本地端口 3006，服务来源是项目根工作区。

导出经验：Blender 5.2.2 的 NLA_TRACKS 路径会漏采部分多对象形态键动作；使用 ACTIONS + 同名 NLA 轨合并，并关闭“把所有动作赋给单个骨架”。GLB 回读时须为形态键选择同一动画的正确 slot，且把滑块范围设为 [-2,2]；导入器只按初始动作推定范围，会错误截断其他动作的合法负权重。Three.js 原生支持这些有符号权重。专项测试实际读取 GLB，并检查每段的修形轨、闭环和共同起始形态。

## 后续比赛衔接

先完成握拍与触球标定，再根据比赛输入分开制作高远、吊球、杀球及极限够球；根位置、命中和得分继续归比赛状态控制。当前形态键数量和高模只适合审核，正式接入前需要减少修形基、制作 LOD、合并材质，并实测双人/阴影/手机帧耗时。静态和基础动作检查不能替代这些验收。
