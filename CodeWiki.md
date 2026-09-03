# Knowledge Graph (agentic-graph) Code Wiki

Docs: see `docs/conflict-resolution.md` for the repo conflict-resolution and sync policy.

## 1. 项目整体架构 (Overall Architecture)

本项目实现了一个端到端的数据处理与可视化流水线（Pipeline），主要用于将结构化和半结构化的数据转换为可交互、可分析的知识图谱（Knowledge Graph）。

系统架构遵循 **INGEST → PRODUCE → REUSE**（摄入 → 生成 → 复用）的设计模式：
- **Ingest (数据摄入与解析)**：通过解析器从不同的数据源（CSV、JSON、JSON-LD、Markdown文档、网页、代码库、YouTube字幕等）中提取实体和关系。
- **Produce (标准化处理)**：将提取出的数据清洗并转换为规范的 `GraphData` 数据模型（由节点和边构成）。
- **Reuse (渲染与复用)**：前端通过 2D (SVG/D3) 或 3D (WebGL/Three.js/MapLibre Globe) 引擎将 `GraphData` 进行可视化渲染，支持用户交互式编辑、拖拽和格式导出。

代码仓库采用解耦的 Monorepo 风格组织，主要分为前端应用（React）、后端数据解析脚本（Python）、共享类型库以及 Cloudflare/MCP 运行面。

---

## 2. 主要模块职责 (Main Module Responsibilities)

| 模块目录 | 核心技术栈 | 职责描述 |
| :--- | :--- | :--- |
| `canvas/` | React, Vite, Three.js, D3, Zustand, RxDB | **前端可视化应用**。提供图谱的 2D 和 3D 渲染，包含富文本编辑（Monaco）、Markdown 预览、节点/边的实时交互操作，以及配置面板和侧边栏控制。 |
| `agentic_graph_parser/` | Python, NetworkX, PyYAML, yt-dlp | **后端数据解析与提取引擎**。处理数据源的加载和转化工作。支持从代码库中建立知识图谱索引、GraphRAG 流水线处理，以及将多模态数据转换为统一的 `GraphData` 格式。 |
| `grph-shared/` | TypeScript | **共享库**。提供图谱核心类型（如 `GraphNode`, `GraphEdge`, `GraphData`），以及在各前端模块之间共享的纯函数工具（哈希、缓存、数组处理、URL解析等）。 |
| `gympgrph/` | TypeScript, MapLibre | **地理空间与地图集成库**。负责提供 2D/3D 地理信息及相关可视化能力，用于包含地理坐标的数据集（GeoJSON等）。 |
| `data/config/` | YAML, JSON, JSON-LD | **配置输入库**。集中存储 GraphRAG、LLM chat、orchestrator 与 schema 配置，避免根目录重复配置源。 |
| `docs/` & `data/outputs/` | Markdown, JSON | **文档与生成制品**。`docs/documents/` 保存权威设计文档；本地生成预览与运行输出归入被忽略的 `data/outputs/`。 |
| `cloudflare/` & `mcp/` | Workers, Pages, Node.js | **发布与工具运行面**。包含 Cloudflare Workers/Pages 处理器、D1 迁移与本地 MCP 合约。 |

---

## 3. 关键类与函数说明 (Key Classes & Functions)

### 3.1 核心数据模型 (Core Data Models)
定义在 `grph-shared/src/graph/types.ts` 中：
- **`GraphData`**: 图谱标准数据载体，包含 `nodes` (节点列表) 和 `edges` (边列表)，以及图谱级别的 `context` 和 `metadata`。
- **`GraphNode`**: 图谱节点模型。核心属性包含 `id`, `label`, `type`, `properties` 以及布局位置相关的物理坐标 (`x`, `y`, `vx`, `vy`)。
- **`GraphEdge`**: 图谱边模型。核心属性包含 `id`, `source`, `target`, `label`, `type`, `properties`。

### 3.2 前端状态管理 (Frontend Zustand Stores)
前端状态使用 `Zustand` 按业务切片（Slices）进行管理，主要分布在 `canvas/src/hooks/store/`：
- **`graphDataSlice`**: 维护当前全局的 `GraphData` 数据实例，提供针对节点和边的增删改查（CRUD）方法。
- **`schemaSlice`**: 控制图谱呈现的 Schema 设置，包含视觉规则（Visual Rules）、行为约束（Behavior Constraints）以及物理布局参数。
- **`uiSlice` / `canvasSlice` / `panelLayoutUiSlice`**: 维护 UI 层面的状态，如面板的折叠/展开、当前选中的节点/边 (`selection`)，以及画布的缩放和视口参数。

### 3.3 前端核心组件 (Frontend Components)
位于 `canvas/src/components/` 和 `canvas/src/features/`：
- **`GraphCanvas` / `FlowCanvas` / `DesignCanvas`**: 负责将 `GraphData` 数据进行 SVG 或 WebGL 的渲染，处理物理力导向图（Force-directed graph）的迭代与用户拖拽交互。
- **底部表面 + 编辑器工作区**: 当前底部表面主要承载轻量统计/历史等底部标签；Markdown 编辑/预览、图表数据表格及较重的工作区交互已收敛到独立的编辑器工作区、Main Panel 与 Floating Panel 等规范化表面。
- **`Toolbar`**: 顶部工具栏，处理数据导入（Import）、导出（Export）以及全局视图模式切换。

### 3.4 后端解析引擎 (Python Parser Backend)
位于 `agentic_graph_parser/`：
- **`graph_builder.py`**: 提供 `GraphBuilder` 类，负责接收清洗后的数据点，实例化对应的 `GraphNode` 和 `GraphEdge`，并将其封装为规范的图数据输出。
- **`semantic_processor.py`**: 负责文本的语义分析与 Embedding 处理，为图谱 RAG（检索增强生成）流程提供向量化支持。
- **`codebase_index_*.py`**: AST 代码库解析脚本系列，支持解析 Python 等项目的代码抽象语法树，将其映射为函数、类与文件级别的依赖网络知识图谱。
- **`jsonld_universal.py`**: 负责处理 JSON-LD 语义化数据的提取及与其他图格式（如 CSV, 纯 JSON）的相互转换。

---

## 4. 依赖关系 (Dependencies)

### 4.1 前端依赖 (Frontend)
项目使用 `npm` 进行依赖管理，由 `Vite` 构建。
- **UI框架**: `React 18`, `react-dom`
- **可视化**: 
  - `three` & `@react-three/fiber` (3D 渲染)
  - `d3` (2D SVG 图谱及力导向布局)
  - `maplibre-gl` (地理空间可视化)
  - `mermaid` (Markdown 流程图支持)
- **状态管理与本地存储**: `zustand`, `rxdb`, `rxjs`
- **编辑器与解析**: `monaco-editor` (代码编辑), `markdown-it` / `unified` (文档解析)

### 4.2 后端依赖 (Backend)
通过 `pip` 及 `requirements.txt` 管理。
- **图处理**: `networkx` (复杂网络与图算法)
- **数据与语义化**: `pyyaml` (YAML 配置解析), built-in stopwords (关键词噪声过滤)
- **媒体抓取**: `yt-dlp` (获取 YouTube 视频字幕与元数据)

---

## 5. 项目运行方式 (How to Run)

### 5.1 环境要求
- Node.js (推荐 v18+ )
- Python 3.11+
- 现代浏览器 (支持 WebGL 和 ES6+)

### 5.2 前端开发服务器 (Canvas App)
提供交互式可视化界面以及热重载 (HMR) 能力。

```bash
# 1. 安装根项目依赖
npm install

# 2. 安装并准备前端与本地工作区依赖
npm run setup

# 3. 启动开发服务器 (默认端口 5173)
npm run dev -- --host 127.0.0.1
```

### 5.3 后端解析引擎 (Python Parsers)
用于数据转换、知识图谱提取和命令行测试。

```bash
# 1. 在项目根目录创建并激活 Python 虚拟环境
python3.11 -m venv .venv
source .venv/bin/activate

# 2. 安装后端依赖
pip install -r requirements.txt

# 3. 运行 Smoke 测试以验证解析器功能
python -m agentic_graph_parser smoke --timeout-seconds 20
```

### 5.4 生产构建与预览
```bash
# 根目录脚本会构建共享包并运行 Canvas 构建
npm run build

# 如需只预览 Canvas 构建产物
npm --prefix canvas run preview
```
