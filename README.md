# F1Lab

F1Lab 是面向个人非商业学习的浏览器端 F1 赛车模拟器。核心场景是 RB22 在斯帕－弗朗科尔尚（Spa-Francorchamps）的自主计时圈。模拟车手选择线路和制动点，车辆模型计算轮胎、悬架与传动响应，同一圈的驾驶输入和赛段成绩可在各个镜头下查看。另有 23 站支持发车格展示与自由浏览。

[快速开始](#快速开始) · [驾驶与遥测](#驾驶与遥测) · [项目结构](#项目结构) · [开发与验证](#开发与验证)

## 模型与数据来源

| 资产 | 来源与用途 |
| --- | --- |
| RB22 赛车 | 原模型由 Tyler_Dave 制作，经 AgentiLoop/F1 引入。项目保留原涂装，拆分四轮和活动翼面，并重建轮轴以驱动转向和滚动动画。[原始模型](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [上游署名](data/models/rb22/UPSTREAM-CREDITS.md) |
| 赛道几何 | 24 站路带依据 Tomislav Bacinger 的中心线数据生成。Spa 高程由官方地图标高插值得到，局部路宽与路肩断面采用估值。[f1-circuits](https://github.com/bacinger/f1-circuits) · [赛道资料](docs/sources.md) |
| 驾驶与动力学 | OpenF1 比利时站历史遥测用于构建 Spa 参考线和速度曲线。轮胎、传动和空气动力学参数结合公开赛车资料估算。[OpenF1](https://openf1.org/) · [动力学参考资料](docs/vehicle-dynamics.md) |

## 快速开始

本机运行需要 Node.js 22.12 或更高版本，以及支持 WebGL 2 的浏览器。

```sh
git clone https://github.com/MichaelJLx/F1Lab_VibeCoding.git
cd F1Lab_VibeCoding
npm ci
npm run dev
```

打开终端显示的地址（默认 `http://127.0.0.1:5173`）。选择 **Spa**，将计时圈数设为 **1**，开始比赛。赛车依次完成出站圈、计时圈和进站圈。通过第三个计时点后，即可在逐圈记录中查看完整计时圈的 S1、S2 和 S3 成绩。

## 驾驶与遥测

| 模块 | 当前实现 |
| --- | --- |
| 线路规划 | 结合参考轨迹、弯道曲率和轮胎抓地余量规划速度与走线。逐弯经验按赛道里程保存，后续圈接近已记录的侧滑位置时会提前调整目标速度。 |
| 传动与底盘 | 后轮转速与八速变速箱共同决定发动机转速。各轮独立计算受力与悬架行程，路肩接触影响车轮位移，制动锁死可产生平斑。 |
| 主动空力 | 前后翼开度参与前后轴下压力与阻力计算。发车格支持静态开合检视，行驶中可对照翼面动作和空力读数。 |
| 转播与计时 | 跟车、车顶与自由镜头共享挡位、转速、车速和踏板读数。赛段完成后标记成绩颜色，两个已完成的计时圈可比较弯段耗时与出口速度。 |

## 项目结构

```text
F1Lab/
├── index.html                 浏览器入口
├── src/
│   ├── main.tsx               React 入口、赛道选择与比赛状态
│   ├── style.css              页面布局与转播界面样式
│   ├── motion/                车手控制、动力学、驾驶记忆与圈间规划
│   ├── optimizer/             参考线采样与行车线网格
│   ├── tracks/                赛道几何、路肩、弯号及运行时数据
│   ├── model/                 赛车装配、车轮与翼面动画、灯光
│   ├── camera/                自由镜头控制
│   └── ui/                    赛道目录、圈数选择、转播仪表与分段记录
├── public/models/             浏览器加载的 GLB、灯光贴图与模型清单
├── data/
│   ├── models/                RB22 原始资产与署名
│   ├── tracks/                平面布局、高程样本与 Spa 遥测
│   └── vehicle-dynamics/      公开车辆参数、来源记录及上游许可
├── scripts/
│   ├── model/                 模型拆件、轮轴与翼面定位
│   └── tracks/                赛道重建、遥测配准与参考线生成
├── tests/                     模型校验、Spa 整圈与 Bus Stop 连续弯回归
├── docs/                      素材来源与动力学研究资料
├── package.json               npm 命令与依赖
├── tsconfig.json              TypeScript 配置
└── vite.config.ts             开发服务与生产构建配置
```

### 从源码跟踪一个计时圈

1. **准备赛道。** 离线脚本将平面布局、高程和遥测转换为随前端发布的赛道数据。加载 Spa 时，赛道模块根据里程与横向偏移计算路面位置，供线路采样和车轮接触计算使用。[赛道处理脚本](scripts/tracks) · [SpaTrack.ts](src/tracks/SpaTrack.ts)
2. **推演车辆运动。** 自主车手生成目标速度和驾驶输入，动力学按固定步长更新。Web Worker 提前计算下一圈的路线与速度方案，逐弯表现及侧滑位置通过浏览器本地存储跨会话保留。[Cruise.ts](src/motion/Cruise.ts) · [lap.worker.ts](src/motion/lap.worker.ts) · [DriverMemory.ts](src/motion/DriverMemory.ts)
3. **显示与比较。** Three.js 将车辆状态映射到车轮、方向盘和活动翼面。React 转播界面显示即时遥测，分段面板用于回看计时点成绩和逐圈差异。[Inspector.ts](src/model/Inspector.ts) · [SpaBroadcast.tsx](src/ui/SpaBroadcast.tsx) · [SectorHistory.tsx](src/ui/SectorHistory.tsx)

## 开发与验证

| 任务 | 仓库根目录命令 |
| --- | --- |
| 检查 TypeScript 类型 | `npm run typecheck` |
| 构建生产版本到 `dist/` | `npm run build` |
| 校验 GLB 结构、贴图与车轮轴心 | `npm test` |
| 运行 Spa 整圈回归 | `npm run test:spa` |
| 单独比较 Bus Stop 连续弯走线 | `npm run test:spa -- --bus-stop` |

更新原始赛车模型后，依次执行 `npm run model:build` 和 `npm run rig:build`。模型处理使用 glTF Transform，赛道数据处理使用 Node.js 和 Python。运行 Python 预处理脚本前，可在虚拟环境中执行 `python -m pip install -r scripts/requirements.txt`。

## 作者

**Michael** · 项目设计与驾驶体验

**OpenAI Codex** · 开发协作
