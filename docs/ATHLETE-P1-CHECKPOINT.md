# P1 运动样板与变形检查点

2026-10-01。此文件记录本轮可复现结果；当前进行到哪里以 [PROJECT-STATUS.md](PROJECT-STATUS.md) 为准。

## 本轮范围与交付

对应 DEVELOPMENT-PLAN 的 P1-1、P1-2。已实际使用 Blender 5.2.2 制作独立运动样板，保留旧 V4 与正式人物；骨架、关节变形和服装尚未全部通过，不能称为 P1 阶段完成。

- 可编辑制作文件：`artifacts/p1/candidate-03/athlete-p1.blend`。
- 独立运行资产：`src/models/athlete-p1.glb`，SHA256 `07273aa822cda78c023428fd91b4fd40b4f8e7e0fb8674e8c03f15cdf6f22158`。
- 资产清单：`assets/characters/p1-movement-sample.json`；来源仍为已采用的 CC0 人体、六段 MultiSenseBadminton 动作及项目自制服装、球拍和动作。
- 现有 65 骨及 23 个动作保留。新增 Blender 手／脚四个 IK 控制器及四个极向控制器，独立于导出集合；默认 IK 为 0，保留源片段，编辑后必须烘焙并重新验收。GLB 没有带入控制器、约束或驱动器运行逻辑。
- 新增四个脚底绑定标记、握柄中点接口。运行时通过标记元数据查找实际导出鞋底顶点并采样其蒙皮位置，不用骨骼标记冒充接地证据。
- 球场入口：`/src/p0-review.html?candidate=p1`；“人物候选”可切换旧 V4 与 P1，五组场景、来球、输入及模拟状态相同。

## 已实施的 Blender 修改

1. 从真正包含修形的 `artifacts/model-workbench/v4-court-correctives/athlete-v4-rigged-corrected.blend` 派生。其同目录导出 QA 的 GLB 指纹与当前旧球场资产一致；早期 `athlete-v4-court.blend` 不含这些修形，未用它覆盖最新资产。
2. 对静态脚部及少量头部交叉采用局部三圈邻域修复，保留全部皮肤和三角拓扑。66 对静态非相邻三角面交叉降为 0，829 个解剖顶点发生位移，最大约 **0.824 mm**；没有扩大服装或改变四肢长度。glTF 的法线接缝会拆分 GPU 顶点，不能把拆分数量当作新增解剖顶点。
3. 右手中指根部的自制握拍屈曲减少 **0.5°**。原持续存在的手掌—中指交叉在 281 个源动作采样中消失；右手五指对真实拍柄检查无超过 1 mm 穿入，无未验证样本。中指最近表面间距由约 0.665 mm 变为 0.573 mm，未用松开握拍来避开皮肤折叠。
4. 对四个 Blender IK 目标实际施加 15–20 mm 位移。最大端点误差约 **0.017 mm**，最大骨长误差约 **0.004 mm**；权重归一化、无漏权重及最多四影响检查通过。此项只证明控制器和数据结构可用，不证明动态皮肤通过。

## 真实动作与实际运行姿态结果

Blender 重新导入真实导出的 GLB，按 30 Hz 对六段已有许可的高远／反手平抽动作采样，共 281 个姿态；保留完整身体表面，不排除衣物遮住的皮肤。

| 检查 | 旧基线 | 候选 03 |
| --- | --- | --- |
| 身体存在交叉的采样 | 281/281 | **162/281** |
| 静态身体交叉对 | 66 | **0** |
| 手掌—中指交叉 | 每个采样均有 | **该项为 0** |
| 实际 Three.js 表面失败 | 31/77 | **31/77** |

来源报告：`artifacts/p1/baseline/source-motion-audit.json`；候选源动作报告：`artifacts/p1/candidate-03/motion-audit.json`；握拍报告：`grip-qa.json`；控制器报告：`authoring-qa.json`；实际运行表面：`runtime-surface-qa.json`。

源动作身体采样有改善，动态肘部、脚踝仍失败；服装和收拍失败集合与旧版相同。源动作采样、静态修复、骨骼代理、单张截图均不能替代最终运行姿态或用户正常速度验收。

## 试验与决定

- 候选 01 的少量肘部半角骨权重使高远动作交叉明显增多（例如 clear-140 峰值从 160 对增至 426 对），已拒绝，未放入运行预览。
- 候选 02 保留静态修复，未改握拍，作为中间对照。
- 候选 03 采用静态修复与 0.5° 中指调整，作为当前独立样板；不是正式人物，也不是质量通过版本。
- 候选 04 尝试在身体与服装上共同分配肘部权重，但遇到涉及其他骨骼的四影响边界，生成过程明确停止，未产出 GLB。没有删掉其他解剖影响或突破四权重限制来强行导出。
- Blender 单独启用双四元数保体积作为原因对照后，身体失败采样降至 64/281，但仍失败。**该结果仅为 Blender 诊断，未导出、未接入 Three.js**；不能以此声称游戏已改善。报告：`blender-dq-probe.json`。

必要重做范围据此限定为：肩肘／前臂连续权重与轴向旋转分配、踝足变形、少量非持拍手与大腿的恢复路径。保留约 1.806 m 身高与现有四肢长度；本轮证据不支持为解决这些局部问题而整个人体换源。不能继续只给少数顶点加辅助骨，或只修源片段时钟下的服装；后续需联合检查过渡和实际适配后的姿态。

BVH 三角面交叉检查采用 Blender 的三角面相交回调；方法核对参考 [Blender 5.2.2 源码](https://github.com/blender/blender/blob/v5.2.2/source/blender/python/mathutils/mathutils_bvhtree.cc#L492)。当前采样不构成全部时间、全部姿态或全部自碰撞的证明。

## 复现与验证

从项目根目录执行，所有新报告使用不存在的输出路径：

```sh
# 使用项目中固定的 Blender；下文命令以该路径代替 Blender。
./artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python scripts/build-p1-sample.py -- --out artifacts/p1/<新目录> --grip-relax-deg 0.5

node --test tests/p1-model.test.js
node scripts/check-v4-court-contact.js --p1 --out artifacts/p1/<新的几何目录>
```

候选 03 的精确制作脚本版本保存在 `artifacts/p1/candidate-03/build-p1-sample.py`，与 `build.json` 中指纹一致。需要精确复现旧实验时将该版本放回项目 `scripts/` 的另一个文件名执行，保持其项目根定位逻辑；不要用后续修改过的试验算法冒充旧版本。

Blender 复查入口：`scripts/audit-p1-model.py`、`scripts/check-p1-grip.py`、`scripts/check-p1-authoring.py`；最后的 Three.js 几何交给 `scripts/check-v4-transitions.py -- --court --source <几何目录> --output <新报告.json>`。实际表面仍失败，检查器退出 1 是质量拒绝结果，不是环境故障。

本轮 Node 专项验证：拓扑和服装／球拍位置保留、两个球场方向的触球轨迹一致、真实鞋底探针、独立资产和控制器导出边界。浏览器对比覆盖五组场景的 12 个两端用例，48 张同条件图片，模拟状态严格一致；P1 倒带的完整姿态与鞋底探针一致。浏览器报告在 `artifacts/p1/candidate-03/browser/report.json`。

专业采集未落实，P0-5 手机条件与实测未完成；没有采购、外部联络、正式人物替换、推送或部署。
