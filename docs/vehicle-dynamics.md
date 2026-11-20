# F1Lab 公开数据检索结论

检索日期：2026-11-18。范围：FIA / 车队 / 轮胎厂商、公开遥测服务、大学与论文、开源仿真仓库、粉丝社区和政府地理数据。此次仅调研、保存原始资料和修改文档，没有修改应用代码、替换运行参数或运行功能测试。“全网查找”指跨来源主动检索，不表示已穷尽互联网。

## 结论

**存在能显著改善当前模型的公开数据，不应继续只凭经验填参数。** 已找到并保存三套参数文件，但必须区分：历史 F1 的圈速拟合参数、通用赛车默认参数，以及本项目 RB22 的真实参数。前两类可以支持后续参考和估计，不能改名当作第三类。

**最新取数口径：不限车队、车型、年代或赛车类别，历史真实赛车数据可作为正式选型对象，不再以 RB22 数据齐全为前置条件。**

目前未找到可核实的 RB22 全套悬架标定、轮胎台架、惯量测量、气动图谱和动力单元扭矩地图。这是本轮检索结论，不是断言网上永远不存在。后续缺口由开发代理继续搜索或从公开数据推导，不要求用户提供。

## 数据可用性与用途

| 需要的数据 | 已核实来源与实际内容 | 可以做什么 | 限制 / 状态 |
|---|---|---|---|
| 质量、质心、惯量、轮距、轮胎与气动参数 | [Fastest-lap 参数 XML](https://raw.githubusercontent.com/juanmanzanero/fastest-lap/main/database/vehicles/f1/mercedes-2020-catalunya.xml) | 历史 F1 参考、速度曲线拟合的起点 | 作者明确说明由 Hamilton 2020 西班牙站排位最快圈拟合；非车队原始数据；已下载 |
| 四轮悬架、轮胎、非簧载质量与执行器参数 | [TUM Open-Car-Dynamics 默认配置](https://github.com/TUMFTM/Open-Car-Dynamics/tree/main/python3/ocd_vehicle_models_py/config) | 建立有公开出处的通用模型参考，核对单位与结构 | [作者说明](https://raw.githubusercontent.com/TUMFTM/Open-Car-Dynamics/main/README.md)真实 AV21 关键参数保密，公开的是通用单座赛车及运动型公路轮胎；已下载一套双轨 MF52 配置 |
| 最优线、车辆约束和轮胎优化参数 | [TUM racecar.ini](https://raw.githubusercontent.com/TUMFTM/global_racetrajectory_optimization/master/params/racecar.ini) | 行车线求解的参数结构和约束参考 | 文件质量示例为 1200 kg，并非 F1；不能整套移植；已下载 |
| 速度、RPM、挡位、油门、刹车状态 | [FastF1 官方源代码](https://raw.githubusercontent.com/theOehrly/Fast-F1/master/fastf1/_api.py) | 按车型 / 年份 / 赛事获取真实比赛曲线，推导传动比区间、约束宏观加减速 | car_data 列明 Brake 为布尔值，通常约 240 ms 一样本；不是刹车压力。未包含悬架位移、轮荷或转向角。本次核实通道，未下载完整比赛 |
| 比赛遥测的备用入口 | [OpenF1](https://openf1.org/) | 历史速度、RPM、挡位、位置、天气、圈时查询 | 官方页面标示约 3.7 Hz，历史访问无需注册；具体场次覆盖和数据条件需获取时核实，不把库开源等同于上游数据可任意再分发 |
| 轮胎系数估计方法与示例 | [TUM Tire Parameter and Uncertainty Estimation](https://github.com/TUMFTM/Tire_Parameter_and_Uncertainty_Estimation) | 从公开速度 / IMU 等资料估计 Magic Formula 参数及不确定性 | 作者工具需要速度和 IMU 等测量；FastF1 基本通道并不等价于这些输入。不是 Pirelli F1 轮胎系数库 |
| RB22 官方基本规格 | [Red Bull RB22 官方页面](https://www.redbullracing.com/int-en/cars/rb22) | 车型、动力单元和基本规格交叉核对 | 页面列出 1.6 L、6 缸、15000 RPM 等；未给出完整悬架 / 轮胎 / 气动表。185 kg 标为 chassis weight，不能当整车质量 |
| 2026 轮胎规格、赛事使用条件 | [Pirelli 2026 轮胎发布](https://press.pirelli.com/pirelli-reveals-2026-f1-tyres-a-fresh-logo-design-and-new-compounds/)、[FIA 发布的 Pirelli Miami 赛事文件](https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf) | 查询尺寸、配方范围以及逐站压力 / 外倾限制的官方入口 | 尺寸或使用限制不等于侧偏刚度、联合滑移或磨损试验曲线；Miami 条件不能套用 Spa |
| 真实 F1 悬架运动学研究 | [2019 年与 Toro Rosso 合作的大学论文](https://morethesis.unimore.it/theses/available/etd-10262019-164508/unrestricted/THESIS.pdf) | 悬架建模结构、几何调校方法 | PDF 第 13 页附近的 Introduction / §1.3 明确因保密省略 Excel 工作簿、宏等细节；未据此取得 RB22 硬点坐标或弹簧阻尼表 |
| 轮胎真实台架数据的另一来源 | [FSAE Tire Test Consortium 官方说明](https://www.millikenresearch.com/fsaettc.html) | 识别真实轮胎试验数据存在的渠道 | 会员学校通过受限论坛下载，且属 FSAE / Formula Student；不能视为匿名开放的 F1 数据，本轮未取得 |
| Spa 高程与坡度 / 横坡候选 | [Wallonia 官方 2021–2022 MNT](https://geoportail.wallonie.be/catalogue/a004e570-99d6-4fe5-b83d-49b774409278.html)、[LAS 点云索引](https://geoportail.wallonie.be/catalogue/218f0248-a265-4cac-878c-43029d6ada8a.html) | 比现有稀疏高程锚点更细的路面重建候选 | 官方 MNT 为 0.5 m 栅格，绝对高程精度约 0.12 m，EPSG:3812 / 5710；未下载 Spa 瓦片。须核对路面覆盖、2022 前后改建、桥梁过滤与相对高程误差，不能自动宣称厘米级赛道测量 |

上述条目中“已下载”与“已找到入口”分别标记；没有把仅发现的页面称作已取得全部数据。

## 已保存的参数原件

原件位于项目 [data/vehicle-dynamics](../data/vehicle-dynamics/)，来源 URL、下载日期、字节数和 SHA-256 记录在 [sources.json](../data/vehicle-dynamics/sources.json)。保存原始输入不代表已应用到模拟器。

### 1. Fastest-lap 历史 F1 拟合模型

文件：`fastest-lap_mercedes-2020-catalunya.xml`；仓库许可 MIT，已随原件保存。

可直接读取的数值示例：质量 746 kg，偏航惯量字段 Izz=500，参考面积 1.5，Cd≈0.99517、Cl≈2.96587，前后轴位置约 2.02153 / −1.70447，制动力前轴分配≈0.57416。轮胎有 2000 / 6000 参考载荷下的摩擦系数与滑移峰值。

这些是原模型字段。坐标系、单位和轮胎公式必须按原实现解释，不能把 `com.z` 直接当本项目质心离地高度。该模型侧倾 / 俯仰惯量及轮胎径向弹簧阻尼存在零值，说明它不是可直接替代完整悬架的参数表。不得将旧年代参数冒充 2026 车型实测值。

### 2. TUM 通用双轨 MF52 模型

文件：`TUM_OCD_generic_double_track_MF52.json`；仓库 Apache-2.0，已保存许可证。此处仅摘少量字段用于确认文件内容，**全部是通用默认值**：

| 字段 | 原值 | 单位 / 注意 |
|---|---:|---|
| mass_vehicle_kg | 800 | kg |
| cog.height_m | 0.3 | m |
| wheelbase_m | 3.2 | m |
| mass_wheel_kg.front / rear | 15 / 15 | kg，具体每轮 / 轴定义依原实现 |
| vehicle_spring_stiffness_Npm.front / rear | 120000 / 90000 | N/m，转用前核对等效刚度定义 |
| vehicle_damper_coefficient_Nspm.front / rear | 1300 / 900 | N·s/m |
| antirollbar_virtual_spring_stiffness_Npm.front / rear | 12000 / 5000 | N/m，**不是本项目使用的 N·m/rad** |
| tire.spring_stiffness_Npm.front / rear | 250000 / 250000 | N/m |
| steering_actuator.T_PT1 | 0.06 | 按原模型时间常数定义解释 |

另含四轮 MF52 系数、车身惯量、滚动阻力、转角 / 转速限制等。作者明确警告其真实赛车关键数据保密，所以这套文件适合方法参考，不是完成 F1 实车标定的证据。

### 3. TUM 轨迹优化示例

文件：`TUM_racecar.ini`，许可 LGPL-3.0（已保存）。它包含车辆约束、轮胎和优化器设置，定位为算法参考；非当前 RB22 参数替换方案。

## 当前参数缺口及后续自行取数方向

| 缺口 | 后续取数或推导方向 | 必须保留的边界 |
|---|---|---|
| RB22 簧上 / 非簧载质量、三轴惯量、质心 | 车队公开规格、论文、历史车辆数据，结合模型几何估计范围 | 法规最低值不是实车运行质量；外形网格不能唯一确定材料分布 |
| 弹簧 / 阻尼曲线、防倾杆、第三弹簧、限位、运动比 | 大学论文、供应商公开试验、公开赛车配置，检查参数定义与年份 | 社区调校数值不是实车测量；不同车型仅作替代参考 |
| 连杆硬点、主销 / 后倾、bump steer、外倾变化 | 合法公开 CAD、技术图、多角度照片、已知尺寸重建 | 照片重建需标注估计误差，不能从渲染图声明工厂 CAD |
| Pirelli 联合滑移、温度 / 压力 / 载荷 / 磨损曲线 | 厂商与论文公开数据、公开比赛曲线的受约束拟合 | 单靠速度 / 圈时无法唯一识别全部轮胎参数；只称行为拟合 |
| 气动随车高、俯仰、侧偏、翼角变化图谱 | 开放赛车 CFD 数据、论文和公开车型拟合 | 单个 Cl / Cd 无法替代完整图谱，旧车数据不代表 RB22 |
| 八速齿比、扭矩 / 功率 / 效率与 ERS 图谱 | 用实际比赛 RPM / 速度 / 挡位估计总传动比区间，结合规则和公开引擎资料 | 有效滚动半径、滑移及混动输出影响估计；最大功率不是完整扭矩曲线 |
| Spa 逐段宽度、高程、横坡、路肩 | 官方 LiDAR / 正射影像、赛道图和政府资料 | 核对数据采集时间及改建；0.5 m 栅格分辨率不等于横坡测量精度 |

## 本轮访问与范围记录

- FastF1 文档站本轮返回 403，改读维护者官方 GitHub 源码核实字段；GitHub 树 API 遇到频率限制，改用公开目录页和 raw 文件完成所需参数获取。
- 已查阅车队与厂商页面、开源仓库、大学研究、遥测工具、政府地理资料及社区搜索结果。技术结论采用原作者 / 官方来源，社区帖子只用于发现线索。
- 不下载或使用来源不明的泄露数据，不把商业游戏解包参数当车队实测数据；遵守适用个人使用条件，不发起商业授权、购买、发布或对外联络。
- 已核对三套原件可读，XML / JSON / INI 类型与许可文件匹配。本轮无应用代码变更，无新增功能实现，无运行测试。


## 范围放宽后的新增发现：Dallara F308 / 历史方程式赛车

已找到并保存 [Dallara F308 制造商车主手册](https://monoposto.co.uk/wp-content/uploads/2022/10/dallara-f308-owners-manual.pdf)。托管方 [Monoposto Racing Club](https://monoposto.co.uk/technical/setup-manuals/) 说明这些手册是制造商提供给参赛车队的原手册副本。相比通用仿真假设，这属于真实赛车的制造商技术资料；手册推荐设定仍应与测试实测曲线区分。

本地原件：`data/vehicle-dynamics/Dallara_F308_制造商车主手册.pdf`，40 页，已记录来源与 SHA-256。仅本地技术参考，未发现开放再分发许可，不将整本手册作为开放资产发布。

已核实的少量数据（按手册印刷页码）：

| 项目 | 原手册值 | 位置及限制 |
|---|---|---|
| 轴距 | 2730 mm | 第 4 页 |
| 前 / 后轮距 | 1585 / 1535 mm | 第 4 页 |
| 质量 | 540 kg，包含驾驶员及配重 | 第 4 页，不能擅自解释为任意燃油工况总重 |
| 变速箱 | Hewland 顺序式，六前进挡及倒挡 | 第 4 页，不是八速 |
| 前 / 后弹簧 | Avon 基础配置 900 / 800 lb/in | 第 5 页，其他轮胎配置不同 |
| 轮端行程 / 弹簧行程比 | 前 1.131，后 1.299 | 第 6 页，手册定义为 WHEEL/SPRING RATIO（vertical）；转用前按安装形式核对 |
| 减振器 | Koni 2812，压缩 / 回弹可调 | 第 4 页及第 17 页章节；此处未完成阻尼曲线数值提取 |

手册还有悬架调校、防倾杆、差速器、车高及气动章节，后续可继续提取。尚未核实其是否足以覆盖全部轮胎力曲线、三轴惯量及所有气动工况，不能先称整车已完整标定。

另已找到同一俱乐部的 Dallara F397/F398、F399–F301、F302–F304、F305–F307、Tatuus Formula Renault 2.0（2000–2010）维修手册及 1990/1991 Reynard 技术手册入口。暂未下载或核实这些手册的全部参数。下一阶段优先比较历史方程式赛车资料完整性，以一致参数组为选型依据；无需用户补资料，也不再等待 RB22 专有数据。本轮未改应用代码或运行参数。


### 2026-11-19 四轮避震与模型动画联动

当前巡游指定车辆中心位置与朝向。车轮每帧从固定轮心起算，悬架行程由车身升沉和姿态反推。各轮缺少独立的路面高度输入，过路肩时很难呈现单轮先压缩、车身随后响应的过程。

| 现成实现 | 能直接借鉴的部分 | 集成条件 |
|---|---|---|
| [cannon-es RaycastVehicle](https://github.com/pmndrs/cannon-es/blob/master/src/objects/RaycastVehicle.ts) | 每轮独立探测接地，求行程和支承力，在刚体步进后更新轮姿供渲染 | 完整控制器需要动态底盘和可射线检测的路面。保留自动巡游时适合借鉴各轮接地与渲染的计算顺序 |
| [Rapier 车辆控制器](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html) | 暴露接地点、法线、悬架长度、力和接触状态，支持分开设置压缩与回弹阻尼 | 需要物理世界、底盘刚体和路面碰撞体。现有巡游若逐帧覆盖刚体位姿，会抵消求解结果 |
| [Project Chrono 双横臂](https://api.projectchrono.org/classchrono_1_1vehicle_1_1_ch_double_wishbone.html) | 用铰点约束摆臂和立柱，可读出弹簧与减振器各自的长度、力和速度 | 适合作机构参考。车模需要可动部件和安装点，推杆与摇臂还需按选用赛车的几何单独建模 |

建议先保留巡游的纵向进度和转向。用同一物理步内的四个轮位采样路带及路肩，结合轮胎半径、静态行程和限位计算各角压缩量；按压缩速度求阻尼力，以各轮支承力和力矩更新车身升沉、侧倾与俯仰。渲染读取同一步的车身与轮姿，摆臂绕内侧铰轴转动，减振器按两安装点距离伸缩。有摇臂时先用其几何或注明来源的运动比换算减振器行程。未经测量的铰点须标为估算。沥青细纹仅用于材质，不能当作轮胎逐点起伏的路面输入。

本次仅核对公开接口和源码，未集成引擎或进行动态验证。
