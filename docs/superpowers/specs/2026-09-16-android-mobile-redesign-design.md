# 小说袋手机端 UI 第一阶段设计

## 目标

在不改变现有小说业务含义、API、SQLite schema、Supabase schema 或数据源逻辑的前提下，为 React/Vite 小说袋提供手机优先的界面。375px、390px 与 430px 宽度下应形成完整的四标签手机体验；桌面版继续保留现有布局和详情弹窗。

## 范围与非目标

本阶段覆盖首页、书库、作者、我的、更多抽屉、独立小说详情页、移动端表单呈现、主题和本地封面临时预览 UI。它复用现有 CRUD、查重、导入导出、筛选和作者归档逻辑。

本阶段不安装 Capacitor、SQLite Android 插件或 React Router；不创建 Android 项目；不修改 `src/api/*`、服务端、schema、Supabase 数据或真实小说数据；不实现阅读器、章节、书源、下载或封面持久化。不会提交、推送或部署。

## 架构

`App.tsx` 继续是业务状态边界：它拥有 `novels`、加载与错误状态、搜索、筛选、作者选择、CRUD、查重调用、当前视图和详情选择。新建的 `src/components/mobile/` 只接收这些状态与回调并负责手机呈现，不访问 API、不创建平行小说状态，也不复制 CRUD。

移动端使用现有的 `activeView` 而不是 URL 路由。`View` 扩展为 `profile` 和 `detail`。进入详情时，根组件同时保存 `selectedNovel` 与详情来源视图；返回只恢复来源视图，因此现有搜索关键词、筛选条件、作者选择、数据列表和列表组件状态不被初始化。桌面仍只在非移动布局中将 `selectedNovel` 交给 `DetailModal`。

编辑详情中的小说时，根组件记录 `detail` 为编辑完成后的返回目标。保存完成后以 API 返回的最新小说更新 `selectedNovel` 并重新进入 `detail`；从书库新增仍保持原有列表去向。删除详情中的小说成功后先清除选择，再回到记录的来源视图。

## 移动信息架构

底部固定导航始终为：首页、书库、作者、我的。它使用 `env(safe-area-inset-bottom)` 和主内容底部留白，不能遮挡内容。

`MobileTopBar` 的更多按钮打开 `MobileMoreDrawer`。抽屉只将用户带往现有 `recent`、`finished`、`liked`、`abandoned`、`stats`、`cp-1v1`、`cp-none` 和 `cp-np` 视图，不改变过滤或业务逻辑。

首页只展示搜索、总数/看完/喜欢/荒废四项统计、随机一本和最多五本最近添加。随机卡的数据仅来自 `novels`：首次取得真实数据时为卡片选一本，普通重渲染不重新抽取，“换一本”才从排除上次 ID 的候选集重新选择，详情按钮进入移动独立详情页。

书库以纵向紧凑卡片展示当前 `visibleNovels`，含搜索、筛选、全部/看完/喜欢/荒废 Chips、更多抽屉入口和新增悬浮按钮。批量删除不默认显示复选框，而从书库更多操作进入；现有批量删除实现继续使用。

作者页继续按作品数降序、同数作者名排序。每张卡显示作者、作品数、可选喜欢数与最多三张 CSS 封面缩略图。作者作品列表保持 `selectedAuthor`，点击作品进入详情后返回仍恢复列表。

“我的”提供备份与数据管理入口、JSON/CSV 导入导出、主题选择、关于与既有云端退出入口。`BackupView` 继续承担导入导出处理，不重写数据功能。

## 详情、表单与封面

`MobileNovelDetail` 是 <=1080px 时的单列独立视图，包含返回、标题、更多、封面、书名作者、全部现有元数据、标签、备注、添加/更新时间、编辑和删除。它不增加阅读器字段。桌面宽度保留 `DetailModal`。

新增和编辑继续使用原始字段、主角多项编辑、主角属性、标签与重复检查。移动端 CSS 将现有表单改为单列且可完整滚动。表单可展示当前 `CoverArt`，以及隐藏 `input[type=file][accept=image/*]` 的“从本地图片选择”与“使用默认封面”入口。

被选择的图片只存于表单组件的临时预览 URL；UI 明示“仅当前页面预览，刷新后消失”。该值绝不能进入 `Novel.cover`、payload、CRUD、SQLite、Supabase 或任何持久化状态；提交继续发送原有 `CoverStyle`。

## 数据状态与错误边界

正常应用初始小说列表为空。读取成功后才显示 API 返回数据；读取失败显示明确错误状态及重试入口，空库显示空状态。`mockNovels` 可保留为开发示例/内部表单样例，但不能替代真实数据出现在任何正式书库、首页、统计、随机或错误界面。

## 主题和样式

主题 ID 为 `blue-red`、`mono`、`mist-wine`、`charcoal`，默认 `blue-red`。主题配置集中在 `src/theme/`，并以 `document.documentElement.dataset.theme` 与 `localStorage` 持久化。`index.css` 以语义 token `--bg`、`--surface`、`--surface-secondary`、`--text`、`--text-muted`、`--border`、`--accent`、`--accent-soft`、`--danger`、`--shadow` 定义基础色，同时映射旧变量，避免复制整套 CSS。

移动样式放在 `src/components/mobile/mobile.css`，仅在 <=1080px 启用新的壳层。它采用浅色干净背景、统一圆角、轻阴影、间距和清晰状态，去除移动端复杂的漂浮装饰和呼吸动画。桌面旧样式保持原状并接受相同主题 token。

## 测试与验收

抽出纯函数测试：随机选择不连续重复、详情来源返回、主题 ID 校验/恢复。用户交互在浏览器中实测 375px、390px、430px：无横向滚动，底部导航不遮挡内容，抽屉/详情/表单可滚动，文字和卡片不重叠；再以桌面宽度回归现有布局与 `DetailModal`。

最终运行 `npm.cmd run lint` 和 `npm.cmd run build`，并检查 `git branch --show-current`、`git status`、`git diff --stat` 与暂存文件，确认分支为 `android-mobile-redesign` 且没有敏感文件进入 Git。
