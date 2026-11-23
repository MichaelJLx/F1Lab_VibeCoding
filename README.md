<div align="center">

# F1Lab

**面向整季 24 站的浏览器端 F1 动力学与遥测平台**  
24 站赛道目录 · Spa 全流程 · RB22 动力学与遥测

</div>

## 模型、开放数据与第三方署名

| 资源 | 作者与来源 | 项目用途及许可 |
| --- | --- | --- |
| **2026 Redbull RB22** | Dave Love（Tyler_Dave），[Sketchfab 原作](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [AgentiLoop/F1 上游版本](https://github.com/AgentiLoop/F1) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。上游调整了金色紧固件贴图。F1Lab 保留原涂装，烘焙模型变换，按 1.90 m 参考宽度缩放，并绑定车轮、主动翼与悬架。[修改与署名记录](data/models/rb22/UPSTREAM-CREDITS.md) · [模型清单](public/models/manifest.json) |
| 24 站平面布局 | Tomislav Bacinger，[f1-circuits](https://github.com/bacinger/f1-circuits) | 经纬度中心线用于生成缩略图、三维路带和发车格。[MIT](data/tracks/layouts/LICENSE-layout.md) |
| Spa 维修区中心线 | © OpenStreetMap contributors，[Pit Lane · way 323851541](https://www.openstreetmap.org/way/323851541) | 维修区道路的平面走向。[ODbL 1.0](https://www.openstreetmap.org/copyright) |
| 地形与高程 | [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) · [Open Topo Data / EU-DEM](https://www.opentopodata.org/datasets/eudem/) | Mapzen 瓦片生成其余 23 站的纵坡；Spa 另存有 EU-DEM 25 m 采样。地形数据按地区保留原提供方署名。[Mapzen 数据提供方与使用条件](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| 翼面风洞压力 | Ladson、Hill 与 Johnson，NASA TM 100526 | NACA 0012 双面压力测点用于翼面 Cp 配色与吸力面烟流速度参考。[实验数据与验证说明](https://tmbwg.github.io/turbmodels/naca0012_val.html) |
| 比赛遥测 | [OpenF1](https://openf1.org/)，2024 年比利时大奖赛 | 佩雷兹第 44 圈用于配准路线、速度与 Raidillon 高差；20 位车手的 723 个绿旗有效圈用于节奏对照。[本地基准数据](data/tracks/spa/race-pace/benchmark.json) |
| 车辆动力学参考 | Juan Manzanero / Fastest-lap · TUM Institute of Automotive Technology | 历史 F1 拟合参数、通用赛车模型和轨迹优化配置。[Fastest-lap · MIT](data/vehicle-dynamics/fastest-lap_LICENSE) · [Open-Car-Dynamics · Apache-2.0](data/vehicle-dynamics/TUM_OCD_LICENSE) · [轨迹优化 · LGPL-3.0](data/vehicle-dynamics/TUM_trajectory_LICENSE) |

**赛事与技术文献**　FIA 赛道清单、分站赛事图、Spa 官方地图和赛事指南用于定位路宽、高程锚点、主动翼区间及刹车距离牌。Dallara F308 手册用于动力学查阅，开放再分发许可尚未核实。[逐项来源与赛道定位](docs/sources.md) · [动力学参考文献](docs/vehicle-dynamics.md)

**开源软件**

| 用途 | 项目与许可 |
| --- | --- |
| 页面与三维渲染 | React、React DOM、Three.js（MIT） |
| 开发与构建 | Vite、DefinitelyTyped 类型定义（MIT）；TypeScript（Apache-2.0） |
| 模型处理与校验 | glTF Transform、meshoptimizer（MIT）；Khronos glTF Validator（Apache-2.0） |
| 赛道与贴图处理 | NumPy、SciPy（BSD-3-Clause）；Pillow（HPND） |

前端依赖的锁定版本和许可记录见 [package-lock.json](package-lock.json)，数据处理环境见 [Python 依赖清单](scripts/requirements.txt)。F1Lab 用于个人学习与非商业演示，项目自身代码尚未指定开源许可证。

## 🏎️ 项目简介

F1Lab 在同一浏览器场景中呈现赛车走线、车辆动力学与分段遥测。Three.js 负责三维渲染，物理求解、逐圈规划与计时均在本地运行。

24 站共用赛道目录和车辆检视工具。Spa 已接入维修区出站、1–44 个计时圈与进站流程，其余 23 站支持三维路带和发车格浏览。Spa 界面展示官方长度 7.004 km，模拟里程按本地重建路带 6.984 km 计算。车辆动力学与部分局部路宽、横坡及路肩参数采用工程估值。

## ⚡ 快速开始

需要 Node.js `^20.19.0` 或 `>=22.12.0`（Vite 7 的要求），以及支持 WebGL 2 的浏览器。

```sh
git clone https://github.com/MichaelJLx/F1Lab_VibeCoding.git
cd F1Lab_VibeCoding
npm ci
npm run dev
```

终端会打印实际地址，默认是 `http://127.0.0.1:5173`。页面启动后停在 Spa 维修区车位；在顶栏设置计时圈数并点击“开始比赛”，即可看到出站、计时和进站流程。顶栏的“赛道目录”用于切换 24 站。

首次加载需下载约 15 MB 的 `public/models/rb22.glb` 和赛道数据，加载时间会相应变长。

## 🚧 平台状态与完成度

**已完成。** Spa-Francorchamps（`be-1925`）已打通维修区出站、1–44 个计时圈和进站圈的完整流程，分段计时、遥测、弯段回放、部件读数与检视工具均可用。

**已具备。** 24 站赛道目录，包含地区、英文名和轮廓缩略图；除 Spa 外的 23 站已生成三维路带和发车格；Spa 具备完整路带、路肩、弯号牌、维修区和围栏；Spa、蒙扎、布达佩斯、墨西哥城、蒙特利尔、吉达有按赛事资料定位的刹车距离牌。

**建设中。** 其余 23 站的自动巡游、计时与遥测尚未接入，目前只能静态查看赛道，不参与圈速、分段和弯道记忆。

## 功能范围

**圈流程（Spa）。** 支持维修区出站、1–44 个计时圈和进站圈，可暂停、继续、重置。速度模式包括“自主竞速”，以及 120 km/h 和 60 km/h 两档限速。

**走线与速度规划。** 每圈在可用路宽内比较候选走线，连续弯按整段耗时评估；速度计划由曲率、抓地、制动与牵引能力反推。下一圈由 Web Worker 预先计算，避免主线程卡顿。

**计时与记忆。** 显示 S1/S2/S3、圈速、最佳圈、实时差值和逐圈历史。19 个弯道的成绩、最近 60 圈计时历史和侧滑点保存在浏览器 localStorage 中。

**弯段回放。** 计时结束后可回放 Bruxelles（T8–T9）、Pouhon（T10–T11）和 Bus Stop（T18–T19），保留最近两圈。

**遥测。** 最近 400 m 的驾驶、空力和底盘曲线，包括车速、油门、制动、翼面开度、前后轴下压力、阻力、离地间隙与四轮载荷。

**部件读数。** 点击车轮查看法向载荷、胎压、接地压力、平斑和锁死；点击车身查看侧倾、俯仰和升沉。

**空力与轮胎。** 直道/弯道模式、A1/A2 区间、前后轴下压力与阻力均为实时读数；胎面有温度和磨损着色。空力流场和主动翼展开预览可单独开启。

**观看与检视。** 支持跟随、车顶、赛道全景和自由相机，Spa 另有赛道转播和弯道定位。检视功能包括线框、环绕、部件标注、前轮转向、车轮分解与旋转，以及车底、侧面、顶部、车头、车尾视角；路面显示可切换柔焦、清晰、仅轮廓。

**赛道浏览。** 24 站目录可切换查看；Spa 加载完整赛道要素，其余 23 站显示静态三维路带与发车格。

## 目录结构

`src/main.tsx` 负责页面状态；`Inspector` 持有 Three.js 场景、赛车、赛道、镜头和 `Cruise`；`Cruise.tick()` 以 1/240 s 固定步长推进车辆，并把 `CruiseSnapshot` 推送给 React UI。`src/tracks/` 提供几何，`src/model/` 将状态映射到模型，`src/ui/` 负责界面与交互。

```text
.
├── index.html
├── src/
│   ├── main.tsx                 React 入口：赛道切换、圈数、比赛按钮、检视工具栏
│   ├── style.css                页面与转播界面样式
│   ├── motion/
│   │   ├── Cruise.ts            巡游状态机、走线选择、速度计划、计时与快照
│   │   ├── lap.worker.ts        下一圈规划的 Web Worker
│   │   ├── DriverMemory.ts      localStorage：弯道成绩、圈史与侧滑点
│   │   ├── Suspension.ts        四轮载荷、升沉/侧倾/俯仰
│   │   ├── LateralDynamics.ts   横向力、滑移与横摆
│   │   ├── AeroPlatform.ts      离地间隙、地面效应、翼面与阻力
│   │   ├── Tyre.ts              胎压、温度、磨损、锁死
│   │   ├── Gearbox.ts           八速传动、RPM 与驱动力
│   │   └── ActiveAero.ts        直道/弯道模式与翼面开度
│   ├── optimizer/RacingLine.ts  预计算行车线偏移与参考线网格
│   ├── tracks/
│   │   ├── SpaTrack.ts          Spa 路带、路肩、发车格、维修区装配
│   │   ├── StaticCircuit.ts     其余 23 站的静态路带
│   │   ├── PitLane.ts           维修区中心线、路面、围栏与车位
│   │   ├── BrakingBoards.ts     部分赛道的刹车距离牌
│   │   ├── SpaMarkers.ts        弯号牌与弯道站位
│   │   ├── catalog.json         24 站目录
│   │   ├── static-circuits.json 23 站路带点列
│   │   └── spa*.json            Spa 几何、路肩、维修区、参考线/速度/偏移
│   ├── model/
│   │   ├── Inspector.ts         Three.js 场景、赛车装配、镜头与检视
│   │   ├── ActiveWings.ts       前/后翼活动面拆分
│   │   ├── WheelEffects.ts      轮下接触阴影与运动残影
│   │   ├── TyreView.ts          胎面温度与磨损着色
│   │   ├── SuspensionLinks.ts   随车轮行程变形的悬架连杆
│   │   ├── SkidSparks.ts        底板火花
│   │   ├── MirrorGlare.ts       后视镜反光
│   │   ├── Airflow.ts           空力流场流线
│   │   └── *.json               轮轴、翼面和底板探针等生成数据
│   ├── camera/FreeCamera.ts     自由相机
│   └── ui/                      赛道目录、圈数、转播条、遥测、弯段回放、分段历史
├── public/models/               rb22.glb、灯光贴图、manifest.json
├── data/
│   ├── models/rb22/             原始 GLB、上游署名与元数据
│   ├── tracks/                  布局 GeoJSON、地形、Spa 遥测/高程/PDF
│   └── vehicle-dynamics/        公开动力学参考原件（未接入运行参数）
├── scripts/
│   ├── model/                   模型清理、轮轴、翼面、悬架探针
│   └── tracks/                  赛道/遥测/参考线/地形构建
├── tests/                       GLB 校验、Spa 整圈与 Bus Stop 回归
├── docs/                        素材来源、动力学资料
├── package.json
├── tsconfig.json
└── vite.config.ts
```

`src/tracks/` 和 `src/model/` 下的 JSON 多数由脚本生成或从数据源整理，修改前应先确认对应的构建脚本。

## 仿真实现

车辆从维修区车位出发，沿中心线并入主路，维修区限速 80 km/h。进弯前，规划器在可用路宽内比较候选线路，按曲率与轮胎剩余抓地力反推制动点，连续弯按整段耗时评估。弯中和出弯以 1/240 s 固定步长求解四轮接地力、悬架行程与车身横摆；驱动轮轮速和八速传动比决定 RPM。地面效应随离地间隙变化，主动翼改变下压力与阻力。冲线时记录 S1/S2/S3 和总用时，Web Worker 计算下一圈，`DriverMemory` 保存逐弯成绩与侧滑位置。各镜头共享同一套实时仪表，遥测图按距离对照最近 400 m，计时圈结束后可回看指定弯段。

关键代码在 [Cruise.ts](src/motion/Cruise.ts)、[lap.worker.ts](src/motion/lap.worker.ts)、[Suspension.ts](src/motion/Suspension.ts)、[AeroPlatform.ts](src/motion/AeroPlatform.ts) 和 [Inspector.ts](src/model/Inspector.ts)。

## 开发与验证

以下命令均在仓库根目录执行：

```sh
npm run typecheck                          # 检查 TypeScript 类型
npm run build                              # 类型检查并构建到 dist/
npm test                                   # 9 项 GLB 校验：结构、贴图、车轮轴心等
npm run test:spa                           # Spa 整圈回归，默认 1 圈
SPA_LAPS=5 npm run test:spa                # 多圈回归
npm run test:spa -- --bus-stop             # 只比较 Bus Stop 连续弯
npm run model:build && npm run rig:build   # 重建模型与轮轴
node scripts/model/build-suspension-rig.mjs  # 重建悬架探针
python3 scripts/model/build-wing-rig.py     # 重建翼面分片
npm run line:build                         # 重建 Spa 参考线
```

`npm test` 只运行 `tests/model.test.mjs` 的 9 项 GLB 校验；整圈和 Bus Stop 属于独立的 `test:spa`。

### 数据与构建管线

`npm run dev` 和 `npm run build` 只消费已提交的生成数据。需要重建数据时，先安装 Python 依赖：

```sh
python3 -m pip install -r scripts/requirements.txt
```

脚本与产物的对应关系如下：

```text
scripts/tracks/fetch-spa-elevation.py    → data/tracks/spa/eudem25m.json
scripts/tracks/build-spa.mjs             → src/tracks/spa.json、data/tracks/spa/elevation-anchors.json
scripts/tracks/fetch-circuit-terrain.py  → data/tracks/terrain/terrain.json
scripts/tracks/build-track-catalog.py    → src/tracks/catalog.json
scripts/tracks/build-static-circuits.py  → src/tracks/static-circuits.json
scripts/tracks/build-race-path.py        → src/tracks/spa-race-path.json、src/tracks/spa-flying-speed.json、data/tracks/spa/raidillon-profile.json
scripts/tracks/build-fast-line.py        → src/tracks/spa-fast-line.json
scripts/tracks/build-race-speed.py       → src/tracks/spa-race-speed.json
scripts/tracks/build-pace-benchmark.py   → data/tracks/spa/race-pace/benchmark.json
scripts/tracks/build-racing-line.mjs     → src/tracks/spa-racing-line.json（也可 npm run line:build）
scripts/model/prepare-model.mjs          → public/models/rb22.glb、public/models/manifest.json（也可 npm run model:build）
scripts/model/build-wheel-rig.mjs        → src/model/wheel-rig.json（也可 npm run rig:build）
scripts/model/build-suspension-rig.mjs   → src/model/suspension-rig.json（底板探针与悬架连杆）
scripts/model/build-wing-rig.py          → src/model/flap-ranges.json
```

除标注了 npm 命令的脚本外，其余脚本没有 npm 包装，需要按依赖顺序手动运行。其中 `build-race-path.py` 读取 `data/tracks/spa/flying/`，`build-pace-benchmark.py` 读取 `data/tracks/spa/race-pace/`。

更新原始赛车模型时，将新 GLB 放到 `data/models/rb22/rb22-community.glb`，再依次执行 `npm run model:build`、`npm run rig:build`、`node scripts/model/build-suspension-rig.mjs`（重建底板探针与悬架连杆）和 `python3 scripts/model/build-wing-rig.py`（重建翼面分片）。

模型处理使用 glTF Transform、meshoptimizer 和 glTF Validator；赛道处理使用 Node.js 与 Python。

---

## 作者

**Michael**：项目设计与驾驶体验　／　**OpenAI Codex**：开发协作
