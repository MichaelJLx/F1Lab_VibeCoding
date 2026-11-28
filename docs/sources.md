# 素材与赛道数据

| 素材 | 在 Formula one 中的用途与修改 | 来源与许可说明 |
| --- | --- | --- |
| 2026 Redbull RB22 | Tyler_Dave 制作，经 AgentiLoop/F1 获取。上游修改了贴图中的金色紧固件；Formula one 烘焙模型变换、统一比例、拆分四轮与活动翼面，保留原车涂装。 | [Sketchfab 原作](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [AgentiLoop/F1](https://github.com/AgentiLoop/F1) · [上游署名记录](../vehicles/rb22/sources/UPSTREAM-CREDITS.md) |
| 24 站平面布局 | 将 Tomislav Bacinger 的经纬度中心线投影为米制坐标，用于赛道缩略图、路带和格线定位。 | [f1-circuits](https://github.com/bacinger/f1-circuits) · [MIT 许可全文](../references/circuits/layouts/LICENSE-layout.md) |
| 路宽、杆位与 Spa 高程 | FIA 清单提供参考宽度与杆位侧；Spa 官方地图提供离散高程点，赛事指南提供宽度范围。 | [FIA 2026 清单](https://www.fia.com/sites/default/files/circuits_fia20261104.pdf) · [2023 清单](https://www.fia.com/sites/default/files/circuits_fia20231022.pdf) · [2026 本地原件](../references/circuits/terrain/FIA-2026-circuits.pdf) · [2023 本地原件](../references/circuits/terrain/FIA-2023-circuits.pdf) · [Spa 官方地图](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf) · [赛事指南](https://press.fiawec.com/assets/fileuploads/66/12/66124edb6859e.pdf) |
| 其余 23 站高程 | 沿中心线采样 Mapzen 地形瓦片，经平滑生成纵坡。不同地区的原始数据提供方与使用条件见上游署名。 | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) · [数据提供方与署名](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| 全赛道维修区 | 各站独立道路中心线，按共同地理原点转换为米制坐标，连接主赛道、车位及限速段。 | © OpenStreetMap contributors · [ODbL 1.0](https://www.openstreetmap.org/copyright) · [原始道路及 way 编号](../circuits/) · [运行坐标](../circuits/) |
| 弯号、计时线与直道区 | F1 Sensor 地图注记与 MultiViewer 坐标配准到赛道中心线，FIA 分站图补充直道激活点与分段位置。 | [F1 Sensor](https://github.com/Nicxe/f1_sensor) · [MIT 许可](../references/circuits/annotations/LICENSE) · [原始地图](../circuits/) · [FIA 位置补充与来源](../circuits/) |
| Spa 轨迹与计时 | OpenF1 比利时站历史正赛数据。2024 年佩雷兹第 44 圈用于路线参考，全场绿旗有效圈用于节奏对照。 | [OpenF1](https://openf1.org/) · [本地对照数据](../circuits/spa/sources/sessions/race-pace/benchmark.json) |
| 主动翼区间 | 根据 FIA 比利时站赛事图，将正常抓地条件下的启用区间近似映射到本地里程。 | [FIA Spa 分站图](https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf) |


## 全赛道维修区与路牌

`fetch-pit-lanes.py` 按保存的 OSM way 编号获取道路，接续、方向与高程校正后的路径统一保存到各站 `CircuitData.pit`，由 `build-circuits.mjs` 校验。银石使用国际大奖赛维修区，铃鹿使用主维修区；亚斯码头出口保留下穿路径。所有赛道共用停车、出站、限速、并线和回站流程。

150／100／50 米牌按重刹区入口的路面里程布设。直道模式激活与关闭牌使用车辆同一份区域数据，维修区设置限速与解除牌。直道激活与计时位置的配准记录见 [赛道注记](../circuits/)。

## Spa 路面与维修区

Eau Rouge 至 Raidillon 的局部高程使用佩雷兹 2024 年比利时站第 44 圈的位置数据。处理脚本将高度对齐至赛道里程，以 30 米尺度平滑，再将局部高差约束到官方地图标高。Bruxelles 的局部 12 米路宽与 Bus Stop 路肩渐变断面采用工程估值。[原始位置样本](../circuits/spa/sources/sessions/flying/location.json) · [配准高程](../circuits/spa/sources/elevation/raidillon-profile.json)

轻量维修区路带参考赛事图的 Bus Stop 入口与 La Source 后方出口。中心线、6.4 米路宽、停车位、80 km/h 限速区域和模拟转播机位采用近似位置。[FIA 比利时站赛道及维修区图](https://www.fia.com/system/files/decision-document/2025_belgian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_quarantine_zone_and_red_zones.pdf)

维修区水平中心线采用 © OpenStreetMap contributors 的 [Pit Lane（way 323851541）](https://www.openstreetmap.org/way/323851541)，数据遵循 [ODbL 1.0](https://www.openstreetmap.org/copyright)。[本地坐标](../circuits/spa/circuit.json) 中的 `pit.points` 为米间隔的 `[x,y,z]` 局部中心线，Y 为高程。里程用于挂接计时和路段状态；La Source 内侧捷径按维修区自身弧长插值。路宽、高程和两端过渡采用工程估值。

### 空力平台与悬架几何

底板前后测点和四轮连杆顶点取自当前 RB22 社区模型，可用 `node scripts/vehicles/build-suspension-rig.mjs` 从项目 GLB 重建。静态车身相对轮心降低 3 mm。前后翼有效面积、底板离地效率曲线、偏航灵敏度与防倾杆刚度均为模拟估值。遥测中的离地间隙、下压力和轮载为模型输出。

### 翼面压力与烟流速度参考

采用 Ladson、Hill 与 Johnson 的 NASA TM 100526 自由转捩风洞测点，M=0.3、Re=600 万，选用迎角 0.0169° 与 10.0254°。以无量纲弦向坐标插值双面 Cp，将吸力面映射到倒置翼下方，按翼面开度混合两条曲线。附着流边缘速度用 U/U∞ ≈ √(1−Cp) 估算。模型使用整翼参考弦长，翼型、多段翼干扰、地面效应与分离尾流需要单独测量。车身与车轮配色为表面迎风方向估计。色标为无量纲压力系数。[验证工况](https://tmbwg.github.io/turbmodels/naca0012_val.html) · [原始压力测点](https://tmbwg.github.io/turbmodels/NACA0012_validation/CP_Ladson.dat)

交叉检查用 Gregory 与 O’Reilly 的 10° 上表面曲线（Re=288 万），在 Ladson 测点覆盖范围内逐点比较。22 个对照点平均绝对差为 0.426 Cp；该差值包含试验条件和前缘测点密度差异。[对照数据](https://tmbwg.github.io/turbmodels/NACA0012_validation/CP_Gregory_expdata.dat)

侧箱下切口、底板侧缘、前翼翼尖和扩散器边缘使用有限涡核近似。涡源位置、衰减长度与环量系数为展示估值，使用局部翼载、离地间隙及侧滑调制。前轮尾流方向随转向与侧滑移动，减速区削弱侧箱前缘的有效来流。可视化中的烟来自虚拟示踪剂。机制参考 [Formula 1 对侧箱与底板前缘的技术分析](https://www.formula1.com/en/latest/article/tech-analysis-why-audis-new-look-bodywork-in-bahrain-got-people-talking.6zWbwADblkDxwOpH0nHPYz) 和 [Knowles 等的前轮近尾流实验](https://doi.org/10.1177/0954407013491903)。

### 连续弯寻优与消耗模型

八组评估覆盖 T1、T2–T4、T5–T7、T8–T9、T10–T11、T12–T14、T15–T17、T18–T19。每组联合采样三个入弯位置、三个弯心时机和三个出弯位置，按出口直道计时门的总耗时排序。当前圈的获选路径与制动色带使用同一组规划数据。候选策略仍在后台进行比较，场景只显示获选走线。

电量消耗与轮胎磨损默认关闭。开启时，5 MJ 等效电池预算、180 kW 电机输出与 300 kW 回收上限，以及轮胎里程、横向载荷、滑移磨损率均为可检查的工程估算。磨损同时影响纵向制动与横向抓地力，规划器收到同一份电量和四轮磨损状态。

- Brembo 2025 Spa 数据中 T1、T5、T18 峰值减速度分别为 4.6、4.7、4.7G，制动距离分别为 117、93、114 米。来源 [Brembo Spa 制动表](https://brem-p-001.sitecorecontenthub.cloud/api/public/content/570dbacfd321487ea315d58fe477b029?v=54dc7ca7)。
- Mercedes 的说明给出 Spa 总高差约 102 米，Eau Rouge 压缩段约 3G 垂向载荷。现有路带高差约 97 米，逐点倾角字段为零，需要带地理坐标的测绘资料进一步校准。来源 [Mercedes 赛道高程说明](https://www.mercedesamgf1.com/news/the-impact-of-track-elevation-in-f1)。
- 新增 150/100/50 米提示牌按本地弧长定位，弯道参考站点为估算。直道模式牌使用车辆主动翼相同的区间函数，表示系统允许区间，实际展开仍受维修区状态与制动控制。

### 方向盘屏显与车手视线

LCD 信息层级参考实车方向盘照片；PCU 硬件能力参考 [McLaren Applied PCU-8D](https://cdn.mclarenapplied.com/media/Catalogue/PCU-8D.pdf)。屏显为本平台的实时遥测页，未采用未经核实的车队内部代码。ERS 来自动力系统，制动平衡与制动力分配共用参数，四轮温度和胎压取自轮胎模型。

T-Cam 外壳从现有 GLB 分离，保留原模型的颜色、贴图与材质；镜头放在提取外壳最前端前方 12 mm，车载视角隐藏该外壳。头盔眼位按现有座舱几何定位，在弹簧车身坐标内为 (0, 0.46, 0.42) m，垂直视场角 70°，机位配置见 `vehicles/rb22/rig/cameras.json`。前向、侧向惯性与弯心注视采用有限幅值、平滑响应的视觉模型，不是车手生理测量值。

烟流使用四轮实模半径、轴向宽度与当前轮轴方向建立有限圆柱距离边界，车身与四组活动翼使用从实模预烘焙的 25 mm 距离场查询，活动翼边界独立跟随转轴；着色器为烟带宽度提供补充遮挡。绕流、翼面上洗、轮胎尾流与涡核仍由降阶流场近似驱动，不等同于 RB22 整车 CFD 标定。

车辆灯光参考 FIA 2026 技术规则 Issue 21 的 C14.3、C14.7，详细控制规格指向 FIA-F1-DOC-025/026。公开说明介绍了尾灯能量警示与后视镜侧向安全灯用途。本项目按交互需求采用 2 Hz 慢闪、4 Hz 快闪的展示参数，并为出场、回场和无效圈提供前后同步警示。[FIA 技术规则](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf) · [F1 官方灯光说明](https://www.formula1.com/en/latest/article/explained-what-do-the-new-lights-on-f1-cars-mean.2W9KyVqIpHgZAvKqJXxAEM)

## 全赛道资料归档

2026-11-28 完成 24 站资料分类归档。每站均使用 `circuits/<目录名>/sources/`，包含 `layout`、`elevation`、`annotations`、`pit-lane`、`sessions` 五类；各类 `source.json` 逐文件记录来源 URL、资料年份及 SHA-256，根索引记录年份选择顺序。

- 平面与比赛规则证据：F1 官方赛道参数、FIA 分站赛道图、维修区图与可获取的赛事说明。FIA 原件保留完整图示；`fia-map-index.json` 提取可读取的分段长度、计时门和直道模式标记，`fia-pit-index.json` 索引维修区图页及限速标识。PDF 页坐标不当作赛道米制坐标。
- 注记与地形：MultiViewer 按年份的计时坐标、弯号与分段，OSM 维修区道路，以及与经纬度逐点对应的 DEM 高程锚点。保留历史建模输入，不以新归档覆盖它们。DEM 测量年份不明时记为 `null`，与资料获取日期分开。
- 场次：OpenF1 已结束场次的圈表、有效参考圈、分段、进站、车辆遥测和位置样本。参考圈筛选要求非出站圈、完整三段且分段之和与单圈用时一致；所选参考圈不等同于赛道纪录。

资料按维度优先采用 2026，其次 2025 → 2024 → 2023。巴林按项目指定使用 **2025 萨基尔**，不混用其他赛道的 2026 赛事资料。吉达及亚斯码头此次采用 2025 赛事资料；摩纳哥保留 2026 圈表与车辆数据，同时补存有位置样本的 2025 参考圈。马德里采用 FIA 2026 图与 OpenF1 场次，未将不可用的 MultiViewer 接口伪装成已取得资料。巴林、吉达、亚斯码头的部分扫描版图纸未自动提取完整数值，原始图纸已归档，索引中相应字段留空。

[巴林资料索引](../circuits/bahrain/sources/source.json) · [Spa 资料索引](../circuits/spa/sources/source.json) · [24 站目录](../circuits/catalog.json)

此次来源更新仅写入资料库；运行时 `circuit.json`、3D 几何生成、驾驶参数与赛道计时门均保持原值。

### 轮胎配方与主动翼连杆

干地配方以现有软胎为基准：软／中性／硬胎抓地力倍率为 1.00／0.97／0.94，磨损倍率为 1.00／0.72／0.50，为本平台的相对调校。配方参数由实时动力学与后台走线规划共用，侧壁只重着色原配方标记。换胎恢复 80°C、160 kPa、零磨损与零平斑，保留轮速和轮胎相位。

主动翼构型依据 [FIA 2026 技术规则 Issue 21](https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf) C3.10.10 与 C3.11.6：前翼采用左右对称的双襟翼组件，绕各侧前缘轴减小迎角；后翼活动翼片保持内部几何关系，绕同一横轴转动。后翼转轴位于组件后半部，打开时前缘抬起、翼片整体收平，匹配用户提供的 RB22 正面开闭参考图。开角从当前模型弦线估算，前翼约 22°、后翼约 36°；沿用 300 ms 平滑过渡。

`scripts/vehicles/build-wing-rig.py` 从 GLB 连通面提取完整翼片、附着小件、作动杆与材质层。前翼翼间支架与后翼翼间连接件使用完整刚体旋转，保持长度与截面；鼻锥和尾翼壳体连接杆保留固定安装端，沿轴向适配活动端。距离场由同一份转轴与三角面归属配置重新烘焙。

### 烟流来流与车底扩散

相对来流叠加车身横摆产生的局部速度（角速度与距重心距离的乘积），车底两侧根据来流方向产生不同的流速与偏移；主动翼按对应组件转轴转换距离场，避免翼片打开后仍留下闭合位置的排斥边界。偏航造成翼面压力、载荷与涡流不对称的趋势参考 [Roberts 等，2015，地效翼片偏航风洞研究](https://journals.sagepub.com/doi/10.1177/0954407015596274)。本文仅用于定性趋势参考，项目中的幅值沿用降阶展示模型。

烟束数量不变，使用固定非均匀上游入口、连续时间相位与高斯羽化；车底宽度同时受底板边缘、中央木板和实际离地间隙限制。几何求解在后台线程按最高 8 Hz 执行，前端逐帧插值；64 束烟流使用非均匀截面、双层高斯烟带及连续噪声浓度扩散。模型载入时只预热一次完整路径，开启时使用常驻缓冲区并在 150 ms 内渐显；关闭后停止持续求解。生产流场不再叠加旧椭球排斥包络或将入口强制推到轮胎外侧；底板边缘采样合并低位车壳并补齐仅采到中央木板的断行，路径使用连续宽度边界，烟带不再逐顶点吸附高度场栅格。实模回归检查左右侧射线首个车壳交点与距离场的误差小于 5 cm，并检查直行及双向侧滑下的流线连续性。距离场由 `scripts/vehicles/build-airflow-boundary.py` 生成，分离静态车身及四组活动翼，轮胎仍使用实时轮轴与有限圆柱边界。

### 头盔视角转头范围

[HANS 官方 FAQ](https://www.hansdevice.com/faq/)说明滑动系带允许驾驶员左右观察，并未给出统一的驾驶转头角度。当前座舱采用左右 55°、向上 18°、向下 30°的保守模拟限位，侧转时进一步缩小俯仰范围；这些是交互调校参数，非 FIA 规定或车手实测关节范围。鼠标输入只控制眼位朝向，不移动机位或改变驾驶决策。
