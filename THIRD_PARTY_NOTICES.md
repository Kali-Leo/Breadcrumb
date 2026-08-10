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

## 对比树正典层数据来源（spec 025，开发期内化、运行时零网络）

- **Wikidata**（www.wikidata.org）：正典概念的 QID 与中英标签/别名，
  数据以 **CC0 1.0 公有领域贡献** 发布，允许任何目的的复制与再分发。
- **MDN Curriculum**（developer.mozilla.org，Mozilla）：前端画像的细粒概念名与
  用于逐字校验的单句引文，文档内容为 **CC BY-SA** 许可；每条内化条目的
  source_ref 均附原页 URL 作为署名与出处。
- **《普通高中数学课程标准（2017年版2020年修订）》**（中华人民共和国教育部制定）：
  数学画像的知识点条目名与单句原文引用，逐条注明出处（单元/页码）；
  属规范性官方文件的署名引用。
- **O*NET 30.2 Database**（U.S. Department of Labor / O*NET Resource Center）：
  职业画像的职业名录、任务句、Technology Skills 与 Knowledge/Skills 描述符，
  **CC BY 4.0** 许可，开发期内化子集随包分发；每条 item 的 source_ref 注明
  SOC 码与数据表。时效补丁层的招聘帖聚合仅在开发期实验采集（限速），
  产物只保留"技能名+频次+单句引文"，不含任何完整帖文或个人信息。
- **ESCO v1.2.1**（European Union / European Commission，esco.ec.europa.eu）：
  职业画像「知识与技能」分支的概念名、别名与层级关系，以及 ESCO↔O*NET 官方
  职业对照表（ESCO Secretariat 与 U.S. Department of Labor 联合发布），
  **CC BY 4.0** 许可，开发期内化子集随包分发；每条 item 的 source_ref 注明
  ESCO 版本、经由的对照匹配类型与 ESCO 职业名。
