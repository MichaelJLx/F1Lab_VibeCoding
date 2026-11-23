# 素材与赛道数据

| 素材 | 在 F1Lab 中的用途与修改 | 来源与许可说明 |
| --- | --- | --- |
| 2026 Redbull RB22 | Tyler_Dave 制作，经 AgentiLoop/F1 获取。上游修改了贴图中的金色紧固件；F1Lab 烘焙模型变换、统一比例、拆分四轮与活动翼面，保留原车涂装。 | [Sketchfab 原作](https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [AgentiLoop/F1](https://github.com/AgentiLoop/F1) · [上游署名记录](../data/models/rb22/UPSTREAM-CREDITS.md) |
| 24 站平面布局 | 将 Tomislav Bacinger 的经纬度中心线投影为米制坐标，用于赛道缩略图、路带和格线定位。 | [f1-circuits](https://github.com/bacinger/f1-circuits) · [MIT 许可全文](../data/tracks/layouts/LICENSE-layout.md) |
| 路宽、杆位与 Spa 高程 | FIA 清单提供参考宽度与杆位侧；Spa 官方地图提供离散高程点，赛事指南提供宽度范围。 | [FIA 2026 清单](https://www.fia.com/sites/default/files/circuits_fia20261104.pdf) · [2023 清单](https://www.fia.com/sites/default/files/circuits_fia20231022.pdf) · [Spa 官方地图](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf) · [赛事指南](https://press.fiawec.com/assets/fileuploads/66/12/66124edb6859e.pdf) |
| 其余 23 站高程 | 沿中心线采样 Mapzen 地形瓦片，经平滑生成纵坡。不同地区的原始数据提供方与使用条件见上游署名。 | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) · [数据提供方与署名](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| Spa 轨迹与计时 | OpenF1 比利时站历史正赛数据。2024 年佩雷兹第 44 圈用于路线参考，全场绿旗有效圈用于节奏对照。 | [OpenF1](https://openf1.org/) · [本地对照数据](../data/tracks/spa/race-pace/benchmark.json) |
| 主动翼区间 | 根据 FIA 比利时站赛事图，将正常抓地条件下的启用区间近似映射到本地里程。 | [FIA Spa 分站图](https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf) |


## 刹车距离牌

牌面距离取自赛事资料。模型位置由本地入弯里程回推，安装高度与横向偏距采用估值。

| 赛道 | 已定位弯道 | 资料 |
| --- | --- | --- |
| Spa | T18 | [FIA Spa 赛事说明，第 10.4 节](https://www.fia.com/system/files/decision-document/2025_spa_francorchamps_event_-_f3_spa-francorchamps_event_notes_2025_v1.pdf) |
| 蒙扎 | T1、T4、T8、T11 | [FIA 蒙扎赛事说明，第 10.4 和 12 节](https://www.fia.com/system/files/documents/doc_10_-_2026_monza_event_-_f3_monaco_competition_notes_2026_v2.pdf) |
| 吉达 | T27 双侧 100 m | [FIA 吉达赛事说明，第 19 节](https://www.fia.com/system/files/decision-document/2025_jeddah_event_-_f2_jeddah_event_notes_2025_v1.pdf) |
| 匈牙利 | T13 出弯至 T14 之间的 100 m | [FIA 布达佩斯赛事说明，第 19 节](https://www.fia.com/system/files/decision-document/2025_budapest_event_-_f2_budapest_event_notes_2025_v1.pdf) |
| 墨西哥城 | T12 的 150 m，牌侧暂按入弯外侧估算 | [FIA 墨西哥大奖赛说明，第 26 节](https://www.fia.com/system/files/decision-document/2025_mexico_city_grand_prix_-_race_directors_event_notes_v3.pdf) |
| 蒙特利尔 | T8 左侧 100 m，历史位置 | [Anthony Davidson 赛道讲解转载](https://www.overtake.gg/threads/anthony-davidsons-montreal-track-guide.52777/) |

## Spa 路面与维修区

Eau Rouge 至 Raidillon 的局部高程使用佩雷兹 2024 年比利时站第 44 圈的位置数据。处理脚本将高度对齐至赛道里程，以 30 米尺度平滑，再将局部高差约束到官方地图标高。Bruxelles 的局部 12 米路宽与 Bus Stop 路肩渐变断面采用工程估值。[原始位置样本](../data/tracks/spa/flying/location.json) · [配准高程](../data/tracks/spa/raidillon-profile.json)

轻量维修区路带参考赛事图的 Bus Stop 入口与 La Source 后方出口。中心线、6.4 米路宽、停车位、80 km/h 限速区域和模拟转播机位采用近似位置。[FIA 比利时站赛道及维修区图](https://www.fia.com/system/files/decision-document/2025_belgian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exits_quarantine_zone_and_red_zones.pdf)

维修区水平中心线采用 © OpenStreetMap contributors 的 [Pit Lane（way 323851541）](https://www.openstreetmap.org/way/323851541)，数据遵循 [ODbL 1.0](https://www.openstreetmap.org/copyright)。[本地坐标](../src/tracks/spa-pit-path.json) 每行依次为邻近主赛道里程、东向米数、北向米数，原点与 Spa 主路相同。里程用于挂接计时和路段状态；La Source 内侧捷径按维修区自身弧长插值。路宽、高程和两端过渡采用工程估值。

### 空力平台与悬架几何

底板前后测点和四轮连杆顶点取自当前 RB22 社区模型，可用 `node scripts/model/build-suspension-rig.mjs` 从项目 GLB 重建。静态车身相对轮心降低 3 mm。前后翼有效面积、底板离地效率曲线、偏航灵敏度与防倾杆刚度均为模拟估值。遥测中的离地间隙、下压力和轮载为模型输出。
