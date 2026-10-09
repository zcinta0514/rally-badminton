# P1-3B：起步节拍与当前线床球路

这是独立人物研究候选。正式游戏人物、main、线上部署和发布版本保持原状态。当前制作进度只看项目 `docs/PROJECT-STATUS.md`；本目录的最终冻结源及验证结果由 `checkpoint.json` 指定。

## 修改与证据边界

从 `artifacts/rig-refine/20261008/final/rebuild.blend` 冻结底座继续。起步处理后大腿摆回、小腿折叠、后脚抬高与踝向的先后关系，并保留前支撑脚和骨长。触球处理前臂分段旋转与手腕，保持握柄挂接和手指包握；球头从当前实际编织线网求接触，出射由真实线床速度和法向计算。

专业参考是2020全英决赛25fps的原片480—540帧。完整全幅观察和中间方案被否决的原因保存在 `review/`。单目遮挡、人物比例、近似摄影机与人工参数仍有不确定性；本轮不是职业运动员三维实测，也不等于完整P1或其他球种已经完成。

## 时钟、导出与验证

作者时间轴120fps、0—480帧，共4秒；原片480—540只对应0—2.4秒。预览保持真实秒数，不能把4秒动作压成2.4秒。2.4秒以后冻结人物与原片，只有显式选择未截击落点时才延长球的推算。

本轮 `export-tools/export.py` 保留全部961个240Hz表面样本，将骨骼、球拍和动画权重烘焙到480Hz。增加骨骼时间采样，不将形态网格数量翻倍。原压缩2µm、源到GLB的961样本10µm门槛保留；额外球拍亚帧误差单独报告。

`sample-runtime-dense.mjs` 用实际GLTFLoader与CPU流式渲染逻辑采1921个480Hz姿态。它在合并同位置顶点前逐个比较真实导出拆分，防止漏掉UV/材质接缝；完整8件球拍与各局部网格SHA逐项核对。`audit-runtime-dense.py` 再检查实际运行表面的身体/球拍相交、12关节原边长门槛、接缝与脚底支撑。源骨架方向和骨长仍由源QA分别检查。

球路的参数、失败旧姿态、源/GLB独立检查及复现命令见 `flight/README.md`。冻结的 `flight/parameters.json` 仅适用于本片段，不是一般羽毛球物理常量。球线弹性、软木压缩、羽裙气动力未实测；羽裙翻转只用确定性短暂过渡表现，不能冒充气动力仿真。

## 恢复最终预览

在项目根目录执行；需要项目锁文件依赖和Blender 5.2.2。最终源必须先按检查点的SHA核对。

```sh
RALLY_BLENDER=artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
RALLY_REVIEW=artifacts/rig-tempo/20261009
"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python "$RALLY_REVIEW/export-tools/export.py" -- \
  --input "$RALLY_REVIEW/final/rebuild.blend" --output "$RALLY_REVIEW/final-export"
node "$RALLY_REVIEW/export-tools/check-export.mjs" "$RALLY_REVIEW/final-export"
node "$RALLY_REVIEW/check-runtime.mjs" "$RALLY_REVIEW/final-export"
node "$RALLY_REVIEW/sample-runtime-dense.mjs" "$RALLY_REVIEW/final-export" "$RALLY_REVIEW/runtime-dense"
"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python "$RALLY_REVIEW/audit-runtime-dense.py" -- "$RALLY_REVIEW/runtime-dense" \
  artifacts/rig-rebuild/20261007/integration/final/source-contact-contract.json
```

随后按 `flight/README.md` 针对同一最终源和GLB生成 `flight/final/` 并运行源/GLB触球检查。配置中的模型SHA必须与刚生成的GLB相符，服务会拒绝混用不同候选的球路。

```sh
node artifacts/rig-tempo/20261009/serve.mjs
```

服务启动时读取资源快照，更新文件后必须重启并核对HTTP和浏览器实际指纹。默认显示本轮，`/?version=baseline` 显示2026-10-08底座。参考原片仅本地保留，不重新分发；缺少原片时预览明确显示参考未配置。`check-browser.mjs` 的完整61帧对照检查要求本地原片已配置，不能用占位图冒充通过。

Cindy侧栏加载核验与独立1440×1080桌面浏览器检查分别记录。桌面结果不证明手机性能，机器门槛不代替用户正常速度观感验收。
