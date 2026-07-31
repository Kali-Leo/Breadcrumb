# 第三方开源声明 / Third-Party Notices

本项目（Breadcrumb，AGPL-3.0）采用或移植了以下开源项目的代码、算法与美术资产。
This project (Breadcrumb, AGPL-3.0) incorporates code, algorithms and art assets
from the following open-source projects.

| 项目 / Project | 许可证 / License | 采用方式 / Usage |
|---|---|---|
| [jeheydorn/nortantis](https://github.com/jeheydorn/nortantis) | AGPL-3.0 | 手绘地图图标资产（`apps/desktop/src/assets/map-art/`）；海岸晕影、海浪、纸张纹理、做旧边框算法移植 |
| [watabou/TownGeneratorOS](https://github.com/watabou/TownGeneratorOS) | GPL-3.0 | 村庄/城镇生成核心算法移植（Haxe → TypeScript，`packages/plugin-town/`） |
| [mewo2/terrain](https://github.com/mewo2/terrain) | MIT | 水力侵蚀/河流管线算法移植（`packages/plugin-map/src/erosion.ts` 等） |
| [Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator) | MIT | 高度图斑块算子算法移植（`packages/plugin-map/src/heightmap.ts`） |
| [lxgw/LxgwWenKai 霞鹜文楷](https://github.com/lxgw/LxgwWenKai) | SIL OFL 1.1 | 地图手写风格字体 |
| [rough-stuff/rough](https://github.com/rough-stuff/rough) | MIT | 手绘颤线渲染（npm 依赖 roughjs） |

依赖库（npm，见各 package.json）：pixi.js、pixi-viewport、d3-delaunay、simplex-noise、
poisson-disk-sampling、polygon-clipping、polygon-offset 等，均为 MIT/ISC 许可证。

注：watabou 的 CompassOS 与 RuneGeneratorOS 仓库无许可证文件，未采用其任何内容。
