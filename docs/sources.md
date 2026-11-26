# 素材与赛道数据

| 素材 | 在 Formula one 中的用途与修改 | 来源与许可说明 |
| --- | --- | --- |
| 2026 Redbull RB22 | Tyler_Dave 制作，经 AgentiLoop/F1 获取。上游修改了贴图中的金色紧固件；Formula one 烘焙模型变换、统一比例、拆分四轮与活动翼面，保留原车涂装。 | [Sketchfab 原作](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [AgentiLoop/F1](https://github.com/AgentiLoop/F1) · [上游署名记录](../data/models/rb22/UPSTREAM-CREDITS.md) |
| 24 站平面布局 | 将 Tomislav Bacinger 的经纬度中心线投影为米制坐标，用于赛道缩略图、路带和格线定位。 | [f1-circuits](https://github.com/bacinger/f1-circuits) · [MIT 许可全文](../data/tracks/layouts/LICENSE-layout.md) |
| 路宽、杆位与 Spa 高程 | FIA 清单提供参考宽度与杆位侧；Spa 官方地图提供离散高程点，赛事指南提供宽度范围。 | [FIA 2026 清单](https://www.fia.com/sites/default/files/circuits_fia20261104.pdf) · [2023 清单](https://www.fia.com/sites/default/files/circuits_fia20231022.pdf) · [Spa 官方地图](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf) · [赛事指南](https://press.fiawec.com/assets/fileuploads/66/12/66124edb6859e.pdf) |
| 其余 23 站高程 | 沿中心线采样 Mapzen 地形瓦片，经平滑生成纵坡。不同地区的原始数据提供方与使用条件见上游署名。 | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) · [数据提供方与署名](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| 全赛道维修区 | 各站独立道路中心线，按共同地理原点转换为米制坐标，连接主赛道、车位及限速段。 | © OpenStreetMap contributors · [ODbL 1.0](https://www.openstreetmap.org/copyright) · [原始道路及 way 编号](../data/tracks/pit-lanes/) · [运行坐标](../src/tracks/circuit-pits.json) |
| 弯号、计时线与直道区 | F1 Sensor 地图注记与 MultiViewer 坐标配准到赛道中心线，FIA 分站图补充直道激活点与分段位置。 | [F1 Sensor](https://github.com/Nicxe/f1_sensor) · [MIT 许可](../data/tracks/annotations/LICENSE) · [原始地图](../data/tracks/annotations/) · [FIA 位置补充与来源](../data/tracks/annotations/station-overrides.json) |
| Spa 轨迹与计时 | OpenF1 比利时站历史正赛数据。2024 年佩雷兹第 44 圈用于路线参考，全场绿旗有效圈用于节奏对照。 | [OpenF1](https://openf1.org/) · [本地对照数据](../data/tracks/spa/race-pace/benchmark.json) |
| 主动翼区间 | 根据 FIA 比利时站赛事图，将正常抓地条件下的启用区间近似映射到本地里程。 | [FIA Spa 分站图](https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf) |


## 全赛道维修区与路牌

`fetch-pit-lanes.py` 按保存的 OSM way 编号获取道路，`build-pit-lanes.py` 将道路接续、校正行驶方向并转换到各站坐标。银石使用国际大奖赛维修区，铃鹿使用主维修区；亚斯码头出口保留下穿路径。所有赛道共用停车、出站、限速、并线和回站流程。

150／100／50 米牌按重刹区入口的路面里程布设。直道模式激活与关闭牌使用车辆同一份区域数据，维修区设置限速与解除牌。直道激活与计时位置的配准记录见 [赛道注记](../src/tracks/circuit-markings.json)。

## Spa 路面与维修区

Eau Rouge 至 Raidillon 的局部高程使用佩雷兹 2024 年比利时站第 44 圈的位置数据。处理脚本将高度对齐至赛道里程，以 30 米尺度平滑，再将局部高差约束到官方地图标高。Bruxelles 的局部 12 米路宽与 Bus Stop 路肩渐变断面采用工程估值。[原始位置样本](../data/tracks/spa/flying/location.json) · [配准高程](../data/tracks/spa/raidillon-profile.json)

轻量维修区路带参考赛事图的 Bus Stop 入口与 La Source 后方出口。中心线、6.4 米路宽、停车位、80 km/h 限速区域和模拟转播机位采用近似位置。[FIA 比利时站赛道及维修区图](https://www.fia.com/system/files/decision-document/2025_belgian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_quarantine_zone_and_red_zones.pdf)

维修区水平中心线采用 © OpenStreetMap contributors 的 [Pit Lane（way 323851541）](https://www.openstreetmap.org/way/323851541)，数据遵循 [ODbL 1.0](https://www.openstreetmap.org/copyright)。[本地坐标](../src/tracks/spa-pit-path.json) 每行依次为邻近主赛道里程、东向米数、北向米数，原点与 Spa 主路相同。里程用于挂接计时和路段状态；La Source 内侧捷径按维修区自身弧长插值。路宽、高程和两端过渡采用工程估值。

### 空力平台与悬架几何

底板前后测点和四轮连杆顶点取自当前 RB22 社区模型，可用 `node scripts/model/build-suspension-rig.mjs` 从项目 GLB 重建。静态车身相对轮心降低 3 mm。前后翼有效面积、底板离地效率曲线、偏航灵敏度与防倾杆刚度均为模拟估值。遥测中的离地间隙、下压力和轮载为模型输出。

### 翼面压力与烟流速度参考

采用 Ladson、Hill 与 Johnson 的 NASA TM 100526 自由转捩风洞测点，M=0.3、Re=600 万，选用迎角 0.0169° 与 10.0254°。以无量纲弦向坐标插值双面 Cp，将吸力面映射到倒置翼下方，按翼面开度混合两条曲线。附着流边缘速度用 U/U∞ ≈ √(1−Cp) 估算。模型使用整翼参考弦长，翼型、多段翼干扰、地面效应与分离尾流需要单独测量。车身与车轮配色为表面迎风方向估计。色标为无量纲压力系数。[验证工况](https://tmbwg.github.io/turbmodels/naca0012_val.html) · [原始压力测点](https://tmbwg.github.io/turbmodels/NACA0012_validation/CP_Ladson.dat)

交叉检查用 Gregory 与 O’Reilly 的 10° 上表面曲线（Re=288 万），在 Ladson 测点覆盖范围内逐点比较。22 个对照点平均绝对差为 0.426 Cp；该差值包含试验条件和前缘测点密度差异。[对照数据](https://tmbwg.github.io/turbmodels/NACA0012_validation/CP_Gregory_expdata.dat)

侧箱下切口、底板侧缘、前翼翼尖和扩散器边缘使用有限涡核近似。涡源位置、衰减长度与环量系数为展示估值，使用局部翼载、离地间隙及侧滑调制。前轮尾流方向随转向与侧滑移动，减速区削弱侧箱前缘的有效来流。可视化中的烟来自虚拟示踪剂。机制参考 [Formula 1 对侧箱与底板前缘的技术分析](https://www.formula1.com/en/latest/article/tech-analysis-why-audis-new-look-bodywork-in-bahrain-got-people-talking.6zWbwADblkDxwOpH0nHPYz) 和 [Knowles 等的前轮近尾流实验](https://doi.org/10.1177/0954407013491903)。

### 连续弯寻优与消耗模型

八组评估覆盖 T1、T2–T4、T5–T7、T8–T9、T10–T11、T12–T14、T15–T17、T18–T19。每组联合采样三个入弯位置、三个弯心时机和三个出弯位置，按出口直道计时门的总耗时排序。当前圈的获选路径与制动色带使用同一组规划数据。灰色备选线路可在检视工具中开启。

电量消耗与轮胎磨损默认关闭。开启时，5 MJ 等效电池预算、180 kW 电机输出与 300 kW 回收上限，以及轮胎里程、横向载荷、滑移磨损率均为可检查的工程估算。磨损同时影响纵向制动与横向抓地力，规划器收到同一份电量和四轮磨损状态。

- Brembo 2025 Spa 数据中 T1、T5、T18 峰值减速度分别为 4.6、4.7、4.7G，制动距离分别为 117、93、114 米。来源 [Brembo Spa 制动表](https://brem-p-001.sitecorecontenthub.cloud/api/public/content/570dbacfd321487ea315d58fe477b029?v=54dc7ca7)。
- Mercedes 的说明给出 Spa 总高差约 102 米，Eau Rouge 压缩段约 3G 垂向载荷。现有路带高差约 97 米，逐点倾角字段为零，需要带地理坐标的测绘资料进一步校准。来源 [Mercedes 赛道高程说明](https://www.mercedesamgf1.com/news/the-impact-of-track-elevation-in-f1)。
- 新增 150/100/50 米提示牌按本地弧长定位，弯道参考站点为估算。直道模式牌使用车辆主动翼相同的区间函数，表示系统允许区间，实际展开仍受维修区状态与制动控制。

### 方向盘屏显与车手视线

LCD 信息层级参考实车方向盘照片；PCU 硬件能力参考 [McLaren Applied PCU-8D](https://cdn.mclarenapplied.com/media/Catalogue/PCU-8D.pdf)。屏显为本平台的实时遥测页，未采用未经核实的车队内部代码。ERS 来自动力系统，制动平衡与制动力分配共用参数，四轮温度和胎压取自轮胎模型。

头盔眼位按现有座舱几何定位，相对原模型坐标约为 (0, 0.78, 0.20) m，低于 T-cam。前向、侧向惯性与弯心注视采用有限幅值、平滑响应的视觉模型，不是车手生理测量值。

烟流使用四轮实模半径、轴向宽度与当前轮轴方向建立有限圆柱距离边界，车身部件使用三角网格 BVH 距离查询；着色器为烟带宽度提供补充遮挡。绕流、翼面上洗、轮胎尾流与涡核仍由降阶流场近似驱动，不等同于 RB22 整车 CFD 标定。
