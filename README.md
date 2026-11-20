# F1Lab

F1Lab 是面向个人非商业学习的浏览器端 F1 赛车模拟器。核心场景是 RB22 在斯帕－弗朗科尔尚（Spa-Francorchamps）的自主计时圈。模拟车手选择线路和制动点，车辆模型计算轮胎、悬架与传动响应，同一圈的驾驶输入和赛段成绩可在各个镜头下查看。另有 23 站支持发车格展示与自由浏览。

[快速开始](#快速开始) · [模拟设计](#模拟设计) · [项目结构](#项目结构) · [开发与验证](#开发与验证)

## 模型与数据来源

| 资产 | 来源与用途 |
| --- | --- |
| RB22 赛车 | 原模型由 Tyler_Dave 制作，经 AgentiLoop/F1 引入。项目保留原涂装，拆分四轮和活动翼面，并重建轮轴以驱动转向和滚动动画。[原始模型](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [上游署名](data/models/rb22/UPSTREAM-CREDITS.md) |
| 赛道几何 | 24 站路带依据 Tomislav Bacinger 的中心线数据生成。Spa 以官方地图标高为基准，并结合历史遥测重建 Raidillon 的局部高差。路宽与路肩断面采用工程估值。[f1-circuits](https://github.com/bacinger/f1-circuits) · [赛道资料](docs/sources.md) |
| 驾驶与动力学 | OpenF1 比利时站历史遥测用于构建 Spa 参考线和速度曲线。轮胎、传动和空气动力学参数结合公开赛车资料估算。[OpenF1](https://openf1.org/) · [动力学参考资料](docs/vehicle-dynamics.md) |
| 引擎音频 | 基于 domasx2 的 CC0 汽车循环录音，混合随转速与负载变化的合成声层。[音频来源与署名](docs/sources.md#引擎声) |

## 快速开始

本机运行需要 Node.js 22.12 或更高版本，以及支持 WebGL 2 的浏览器。

```sh
git clone https://github.com/MichaelJLx/F1Lab_VibeCoding.git
cd F1Lab_VibeCoding
npm ci
npm run dev
```

打开终端显示的本地地址，默认是 `http://127.0.0.1:5173`。在 Spa 选择 **1 个计时圈** 后开始比赛。赛车从维修区出发，依次完成出站圈、计时圈和进站圈。成绩表记录计时圈的 S1、S2、S3 和单圈用时。

## 模拟设计

**赛道与线路。** 模拟器用沿赛道的里程定位弯道、路肩、计时点和遥测样本。离线工具将平面布局、高程和历史遥测配准到同一条中心线。自主车手在可用路宽内比较候选线路，对连续弯按整组耗时评估，使前一个弯的走线选择计入后续出口的得失。[赛道几何](src/tracks/SpaTrack.ts) · [驾驶与线路规划](src/motion/Cruise.ts)

**车辆动力学。** 车辆以固定时间步长计算轮胎受力、悬架行程与横摆响应。后轮轮速和传动比决定发动机转速，前后翼开度影响下压力与阻力。下一圈的路线和速度规划在 Web Worker 中执行，浏览器本地存储保留逐弯表现和侧滑位置，供后续驾驶调整使用。[动力学模块](src/motion) · [圈间规划](src/motion/lap.worker.ts) · [驾驶记忆](src/motion/DriverMemory.ts)

**渲染与遥测。** Three.js 根据车辆状态驱动车轮、方向盘与翼面动画，React 读取同一状态更新仪表和分段计时。切换镜头可从不同角度观察同一次制动或转向。完成计时圈后，可按赛道里程对照车载回放、驾驶输入和车辆响应。[赛车渲染](src/model/Inspector.ts) · [转播仪表](src/ui/SpaBroadcast.tsx) · [弯段回放](src/ui/CornerReview.tsx)

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
├── public/
│   ├── models/                浏览器加载的 GLB、灯光贴图与模型清单
│   └── audio/                 引擎录音
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
