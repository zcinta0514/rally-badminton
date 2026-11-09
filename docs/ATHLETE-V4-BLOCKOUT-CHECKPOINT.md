# ATHLETE V4 Blockout 检查点｜2026-09-18

## 状态

这是全量重制的第 0 阶段，只用于比例审核。它不是正式人物、不是比赛资产，也没有接入侧边栏预览。

- 输入：Blender Studio Human Base Meshes v1.4.1（CC0）中的独立男性人体对象。
- 新工程：artifacts/model-workbench/athlete-v4-blockout.blend。
- 新 GLB：src/models/athlete-v4-blockout.glb。
- GLB：512,720 字节；SHA-256：cb0813dff88e4dd089c7fb6a76ab943858907aba495a6d2d497c6f95a0b125f6。
- 几何：单个静态人体网格，10,582 顶点、10,590 面；0 动画、0 骨骼、0 服装、0 头发、0 鞋、0 运行时接口。
- 固定视图：artifacts/model-workbench/v4-blockout-review-1/，含 front / threequarter / side / back / top。

## 当前可验证结果

- Three.js GLB 解析通过。
- 身高约 1.806 m，包围盒坐标有限。
- 产物名称和网格中没有 V3、jersey 等旧人物/旧服装标识。
- node --test tests/athlete-v4-blockout.test.js：2/2 通过。
- git diff --check：通过。

## 尚未通过的事项

- 用户尚未确认正面、三分之四、侧面和背面比例；因此不能进入面部、服装和绑定阶段。
- 当前材质是中性灰，仅用于读轮廓；没有眼球、头发、衣物或鞋的视觉承诺。
- top 图只用于检查肩胯平面，不作为自然站姿验收。
- 没有证明动作、握拍、脚底约束、移动端性能或正式比赛兼容性。

## 下一步门槛

用户确认 Blockout 的头身比、肩宽、腰胯比、四肢长度和站姿后，才建立 V4 面部/手脚细节；若比例不合格，只修改 scripts/build-athlete-v4-blockout.py 并重导出，不在其上堆服装和绑定。
