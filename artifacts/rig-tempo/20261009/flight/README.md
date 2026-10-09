# 新拍触球与球路重校

所有结果为 P1-3B 人工重建候选，不是职业比赛三维实测。当前任务以项目 `PROJECT-STATUS` 为准。本目录只保存球路工具和证据，人物源由主任务指定。

## 查明的问题

- 冻结源新拍的局部触球标记在拍柄轴向约 0.468 m，旧拍脚本使用 0.533 m 的旧线床，不能复用。新提取器以实际 `RacketBatch_Racket_StringIvory` 的三角面求球头球心；不把“标记点＋半径”当作已经碰到编织线。
- 比赛513—514帧内出现球路反向；单目25fps不支持唯一实测亚帧。本候选在允许区间内选择513⅓帧，即制作160帧、本轮480Hz骨骼导出640帧（原240Hz表面样点索引320）、1.333333秒，源和GLB触点处在同一精确导出样本。
- 旧姿态实际线床向下切且拍面侧向分量很大。旧候选真实球路报告 `baseline-failed-flight.json` 显示出射约 `[3.54,0.21,-8.80]` m/s，球未到网便落在己方。它保留为失败证据。
- 不能仅调整出射曲线或给来球增加不合理侧速去掩盖拍面错误。`proposal.json` 把所需法向和法向拍速交给动作侧，由连着手和前臂的完整球拍运动重新生成出射冲量。
- 裁剪图一度导致“网前短球”的错误推断。随后核对全幅，536—537帧近端球员在己方中后场头顶击球，已撤销短球判断。487—489附近是上一拍低位防守挡球，513—514是本次接球，536—537是下一拍；仅作时间/动作类别依据，不能据此声称已测得三维速度。

## 时基与几何

制作120fps、0—480帧=4秒；原片25fps、480—540帧只对应前2.4秒，余下为制作末端停留。不能把4秒压缩/拉伸为2.4秒。

全部JSON球路向量为 glTF/Three `[Blender x,z,-y]`，单位米和秒。`contact.corkRadius=.013`。`p` 是球头球心，不是羽裙中心。球场 `groundY=-.013`，`netHeight=1.55` 表示离地高度；实际网顶Y=1.537。推算触地球心Y=0。

`runtime.mjs` 导出 `sampleFlight(data,time)`，返回 `{p,v,phase,visible}`。来去球以同一精确球心相接；接触时允许速度冲量突变。其他时刻位置用Hermite插值、速度由其解析导数计算，任意倒带不依赖前一次播放状态。上一击球之前 `visible=false`。

默认只显示到 `nextOpponentContactTime=2.26`（原片536.5，观测区间536—537），然后隐藏球。后续路径是“未被对手截击”的假想延伸，必须由预览明确选中才能展示，不可冒充原片落点。

## 可重复运行

在项目根目录，先将 `FINAL_SOURCE` 和 `FINAL_EXPORT` 指向主任务最终候选；所有输出路径保持在本目录内。更换源、GLB、物理参数后必须重新执行，不能直接改报告中的哈希。

```sh
RALLY_BLENDER=artifacts/tools/blender-5.2.2-macos-arm64/Blender.app/Contents/MacOS/Blender
FINAL_SOURCE=artifacts/rig-tempo/20261009/final/rebuild.blend
FINAL_EXPORT=artifacts/rig-tempo/20261009/final-export
FLIGHT_DIR=artifacts/rig-tempo/20261009/flight/final

"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python artifacts/rig-tempo/20261009/flight/extract-racket.py -- \
  "$FINAL_SOURCE" "$FLIGHT_DIR/racket.json" --hit-source-frame 513.3333333333333
python3 artifacts/rig-tempo/20261009/flight/build-flight.py \
  --racket "$FLIGHT_DIR/racket.json" --output "$FLIGHT_DIR/flight.json" \
  --parameters artifacts/rig-tempo/20261009/flight/parameters.json \
  --glb "$FINAL_EXPORT/clear.glb"
"$RALLY_BLENDER" --background --python-exit-code 1 \
  --python artifacts/rig-tempo/20261009/flight/verify-source.py -- \
  --source "$FINAL_SOURCE" --flight "$FLIGHT_DIR/flight.json" \
  --output "$FLIGHT_DIR/source-qa.json"
node artifacts/rig-tempo/20261009/flight/check-glb.mjs \
  "$FINAL_EXPORT" "$FLIGHT_DIR/flight.json" "$FLIGHT_DIR/glb-contact-qa.json"
node artifacts/rig-tempo/20261009/flight/check-display.mjs \
  "$FLIGHT_DIR/flight.json" "$FINAL_EXPORT" "$FLIGHT_DIR/display-qa.json"
python3 artifacts/rig-tempo/20261009/flight/compare-reference.py \
  --flight "$FLIGHT_DIR/flight.json" --output "$FLIGHT_DIR/reference-residual.json"
```

本轮有界拟合选定入射约 `[-3.569536,-4.338731,.167190]` m/s、恢复系数0.98，重力9.81，二次阻力系数0.18，从原片488帧(t=.32s)开始来球。参数冻结于 `parameters.json`，只适用于本片段，不是一般物理常量。复现命令显式传入该文件，避免误用生成器仍保留的早期默认 `[-4,-4,0]` / 0.8；生成的球路记入参数文件SHA256。它们都是制作推断；生成器只允许设置入射、阻力、恢复系数，没有直接指定出射速度的接口。出射由真实线床接触点速度和实际法向通过移动拍面恢复系数冲量导出，再用RK4积分。

`fit-bounded.py` 固定真实触球位置、时刻、拍面、拍速和阻力，只搜索入射三个分量与恢复系数。目标使用500/506/522/536粗球点按3/3/3/6px不确定度加权，488只处罚落出模糊宽区间，不锁定区间中心；513—514不进入拟合目标，避免为触点投影残差扭曲曲线。边界、全部轮次和对照由 `contact-02/bounded-fit.json` 保留。优化得到恢复系数0.98及上一触球高度约1.00m，均抵近作者假设的上界，可能反映固定触点偏低、近似镜位和简化物理残差，说明结果不唯一，不能宣称测得真实恢复系数。早期0.8候选、锁定单一起球点的0.9候选及各自QA/残差全部保留。

在当前近似镜位下，入射拟合改善大部分粗球点，但488仍比可见区域向左约14px；当前模型真实线床在触球阶段低于原片球投影约20—27px，未移动球头离开线床来遮掩。专业球路一致性保持 `improved_not_passed`。`compare-reference.py` 可对最终球路重新生成这些残差。

## 分开报告的检查

1. `racket.json`：实际编织线网三角面接触、线床内位置、源哈希、4秒运动学，480Hz全段并在触球附近加密到4800Hz。
2. `flight.json`：同一球心、来去法向速度、来去过网、单打宽度、推算落点、对手头顶接球窗口与来球起点。失败仍写出JSON并以非零退出，禁止包装成通过。
3. `source-qa.json`：球头与完整身体及全部8球拍网格，飞行全程480Hz、触球±.05秒4800Hz。检查球头进入身体/拍框、线床穿透、二次触球以及带符号线床侧。原始报告保留采样行。
4. `glb-contact-qa.json`：实际GLTFLoader加载、源/GLB哈希、所有240Hz导出样本的10μm门槛、额外亚帧插值误差、实际GLB线网触点及4800Hz窗口。额外亚帧0.2mm界限独立报告，不替换也不放宽既有240Hz/961姿态的10μm门槛。
5. `display-qa.json`：读取真实显示模块，对接触前50ms至后100ms的羽裙三角面逐一检查4800Hz采样，使用移动线床的有限椭圆±0.71mm包络；另验证姿态倒带、无瞬间180°翻转、对手接球后隐藏、外推显示和网带上缘与物理高度一致。8—65ms羽裙翻转只是明确标注的展示推断。`contact-02/display-qa.json`保留了最初无限平面诊断的失败：球已离拍后跨越其延长面不是实际球拍碰撞；随后改为真正的有限拍面相交而未改变几何或放宽间隙阈值，见`display-finite-bed-qa.json`。

球头检查不代表羽裙碰撞/空气动力学、球线弹性或软木压缩已模拟；离散高频检查也不是任意连续时间的数学证明。数值通过不能代替用户正常速度自然度验收。
