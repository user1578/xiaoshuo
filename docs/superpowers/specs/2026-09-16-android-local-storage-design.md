# 小说袋 Android 本地版第二阶段设计

## 目标

将现有 React/Vite 小说袋封装为可安装的 Android APK，并让 Android 原生运行时只使用手机本地 SQLite 和 App 私有文件目录。APK 首次启动不需要登录、网络、Vercel、Supabase 或电脑上的 Node API；在离线状态下仍可完成书库读取、搜索、筛选、统计、随机、增删改、批量删除、备份恢复和默认封面显示。

Web 版本继续保留两条既有路径：默认 `local` 路径使用 `127.0.0.1:3001` Node API，`VITE_DATA_SOURCE=supabase` 使用 Supabase。三条路径不得相互读取数据或改变彼此的行为。

## 已确认的约束与非目标

- 以 Capacitor 8 和与其 peer dependency 兼容的稳定 `@capacitor-community/sqlite` 版本实施。实施时由实际锁定的 npm 包、其 peer dependency 和官方/维护者兼容说明共同确定 Java、AGP 与 Android SDK 版本；版本号不写成脱离 lockfile 的永久规则。
- 不删除或改写现有 Node 本地 API、Supabase schema、Supabase 真实数据、现有 Web local/Supabase 功能或八套 `CoverArt` 默认封面。
- 不增加 Router、阅读器、章节、在线书源、下载、云同步、账号、广告、统计 SDK 或远程日志。
- 本阶段只导出 JSON 数据；不打包自定义封面为 ZIP，不向 JSON 写入私有绝对路径、`file://`、`content://`、base64、Blob URL 或 Object URL。
- 开发、自动测试和构建过程绝不读取、移动、修改、导入或删除根目录中的真实约 425 本 JSON、数据库、CSV 或封面文件。真实备份只能由用户在空的手机数据库中手动预览并确认导入。
- 不自动安装 Android Studio、JDK、Android SDK、emulator image 或签名密钥；目前的 Java 8、未发现 `adb`/Android SDK 状态是环境阻塞而不是代码失败。
- 不自动 commit、push、部署或生成发布签名 APK。Android 正常项目源码可以提交，但 `local.properties`、`.gradle`、`app/build`、keystore、数据库和真实资料不能提交。
- Android `appId` 固定为正式永久标识 `com.novelbag.app`。后续重构不得随意变更它；变更会创建新的 Android 应用沙箱，既有手机 SQLite 和 `covers/` 私有文件不会自动继承。

## 技术方案比较与选择

### 方案 A：Capacitor 8 + 社区 SQLite 插件（采用）

在 Vite 的 `dist` 产物外建立 Capacitor Android 项目。JavaScript 层经 `@capacitor-community/sqlite` 访问 App 私有 SQLite，经 `@capacitor/filesystem` 管理封面和备份文件，并用 `@capacitor/share` 调起系统分享。它满足原生 SQLite、私有持久目录、无网络 CRUD 与 APK 构建要求。

### 方案 B：Capacitor 7 + 旧版 SQLite 插件

这会降低原生依赖的主版本，但会偏离“当前稳定且匹配”的要求，并引入较早的 Android/Capacitor 兼容矩阵。当前项目没有必须留在旧版的原生依赖，因此不采用。

### 方案 C：WebView 内 IndexedDB 或浏览器 SQLite shim

它无法满足“手机 SQLite”以及 App 私有文件事务边界的要求，不采用。

## 总体架构

```text
React 页面 / App 状态
        │  只调用统一小说与备份 API
        ▼
src/api/novels.ts（数据访问门面）
        │
        ├─ native Capacitor  ─► src/data/mobile/* ─► SQLite + Filesystem + Share
        ├─ web + supabase    ─► src/api/supabaseNovels.ts ─► Supabase
        └─ web default       ─► 现有 HTTP API ─► Node + server/data/novels.db
```

`src/data/dataSource.ts` 是唯一的数据源决策点，并导出 `DataSource = 'mobile' | 'supabase' | 'local'`：

1. `Capacitor.isNativePlatform() === true` 时返回 `mobile`；此规则优先于所有 Vite 环境变量。
2. 非原生 Web 环境且 `VITE_DATA_SOURCE === 'supabase'` 时返回 `supabase`。
3. 其余情况返回 `local`。

`src/api/novels.ts` 依此选择 repository。只有解析结果为 `mobile` 后，门面才通过动态 `import()` 加载 mobile repository；mobile repository 再延迟加载 SQLite、Filesystem 和 Share adapter。React 组件、`App.tsx`、移动组件和表单不直接导入 Capacitor、SQLite、Filesystem、Supabase 或 `localhost` URL，也不各自写环境判断。Web local 与 Web Supabase 的启动路径不得初始化原生 SQLite/Filesystem，也不得因 mobile 文件被加入项目而改变 Web bundle 的运行行为。移动端不会进入 Supabase session 检查或登录视图，且不会发出任何 Node API 或 Supabase 请求。

现有 API 函数名和 `App.tsx` 的业务调用方式尽量保留：`fetchNovels`、`createNovel`、`updateNovel`、`deleteNovel`、`deleteNovels`、JSON 导入导出和 CSV API。为 JSON 的移动端预览增加统一 API；移动端 CSV 将明确显示为后续小步而不是调用 Node API。Web CSV 行为不变。

## 类型、封面与 API 边界

共享 `Novel` 保持既有业务字段，并增加一个可选的运行时内部字段 `coverImagePath?: string | null`。该字段只允许是经验证的 `covers/<uuid>.<jpg|jpeg|png|webp>` 相对路径；Web repository 不生成它，移动 repository 始终将它映射为相对路径或 `null`。

表单保存使用独立的封面变更意图，而不是把 `File`、临时 URL 或二进制混入 `NovelPayload`：

```text
keep      保留已有自定义封面
replace   传入本次选择的 File，保存为新私有文件
remove    取消自定义封面，回退 Novel.cover 的 CoverStyle
```

统一数据门面对移动 repository 传递该意图；对 Web local 与 Supabase repository 只传既有结构化小说 payload，因此不会把浏览器 `File` 序列化到 HTTP 或 Supabase。现有的规范化书名 + 作者查重继续由已有业务逻辑执行，新增和编辑时不改变重复提示与“继续保存”流程。

新增 `NovelCover` 显示组件作为 `CoverArt` 的小型统一入口。它只接收 `Novel`：有有效 `coverImagePath` 时，经封面存储服务解析为 Capacitor WebView 可访问 URI 并渲染 `img`；没有路径、路径无法读取或解析失败时，始终渲染既有 `CoverArt`。页面不直接调用 Filesystem，也不展示失效图片。

## Mobile SQLite 设计

`src/data/mobile/mobileDatabase.ts` 管理唯一的原生连接：初始化插件、创建/恢复连接、打开 `novelbag.db`、在每次打开后执行 `PRAGMA foreign_keys = ON`，并保证初始化并发时复用同一个 Promise。数据库和 schema 只在原生 `mobile` 数据源调用。

使用以下规范化 v1 schema；字段名保持蛇形，repository 在边界映射为现有 camelCase `Novel`：

```text
authors
  id INTEGER PRIMARY KEY AUTOINCREMENT
  name TEXT NOT NULL UNIQUE

novels
  id INTEGER PRIMARY KEY AUTOINCREMENT
  title TEXT NOT NULL
  author_id INTEGER NOT NULL REFERENCES authors(id)
  cp_category TEXT NOT NULL
  ending TEXT NOT NULL
  status TEXT NOT NULL
  rating TEXT NOT NULL
  read_count INTEGER NOT NULL DEFAULT 0
  notes TEXT NOT NULL DEFAULT ''
  cover TEXT NOT NULL DEFAULT 'book'
  cover_image_path TEXT NULL
  favorite INTEGER NOT NULL DEFAULT 0
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL

characters
  id INTEGER PRIMARY KEY AUTOINCREMENT
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE
  name TEXT NOT NULL
  attribute TEXT NOT NULL
  sort_order INTEGER NOT NULL DEFAULT 0

tags
  id INTEGER PRIMARY KEY AUTOINCREMENT
  name TEXT NOT NULL UNIQUE

novel_tags
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
  PRIMARY KEY (novel_id, tag_id)
```

Schema v1 还包含作者、主角和关系表索引，并以检查约束或 repository 严格校验限制 CP、状态、评价、主角属性、`read_count >= 0`、收藏布尔值和八种 `CoverStyle`。`cover_image_path` 不保存图片内容，也不保存 Android 相册 URI。

### 迁移机制

`src/data/mobile/mobileMigrations.ts` 定义目标版本和有序迁移函数。启动时读取 `PRAGMA user_version`：

- `0 -> 1`：在单个事务内创建 v1 表、索引和约束，最后设置 `PRAGMA user_version = 1`。
- 当前版本等于目标版本：不执行 DDL。
- 将来的 `1 -> 2` 等升级在同一迁移表中新增，绝不删除数据库或以 schema 差异为由重建。
- 任一 DDL、数据迁移或版本写入失败时回滚，`user_version` 不前进，初始化向 UI 抛出可读错误。

SQLite 插件命令被封装在异步数据库接口之后：DDL/PRAGMA 使用 `execute`，带绑定值的写入使用 `run`/`executeSet`，读取使用 `query`，显式使用插件的 transaction API。这个接口也允许测试接入隔离的内存 SQLite 实现；生产 bundle 不导入 Node 的 SQLite 模块。

## Repository CRUD 与性能

`src/data/mobile/mobileNovelRepository.ts` 是移动端唯一的 SQL 业务层，负责：

- 插入或获取唯一 author、tags；写入 novel、按 `sort_order` 写入 characters、写入 `novel_tags`。
- 查询时批量读取小说、主角和标签，并按 `novel_id` 组装为 `Novel`，避免每本小说各查一次关系表的明显 N+1。
- 更新时在单事务内更新作者/基础字段、替换 characters 和 tags，清理不再引用的 author/tag。
- 删除一条或多条记录时，在同一个数据库事务内删除关系与小说，并执行仅删除完全无引用 author/tag 的清理 SQL；批量删除也复用这一原子路径。数据库提交成功后，才交给封面服务检查原路径是否仍被引用并最佳努力删除文件。
- 所有 SQL 使用绑定参数；repository 自身不接受未经校验的枚举或任意文件路径。

首次成功初始化后查询小说数。若为零，正常打开 App（不使用 `mockNovels`），首页显示“还没有小说”及“导入现有书库”和“添加第一本”入口。若初始化失败，显示“本地书库初始化失败”与重新尝试；错误信息不引用 Supabase 或 `127.0.0.1`。

## JSON 备份、校验、预览与恢复

### 可移植备份格式

移动端 JSON 继续使用：

```json
{
  "exportedAt": "ISO-8601 timestamp",
  "count": 1,
  "novels": []
}
```

导出的一本小说包含恢复业务字段所需的 id、书名、作者、主角及属性、CP、结局、状态、评价、阅读次数、标签、备注、时间、`cover` 和收藏值。`coverImagePath` 永不导出。若该小说原先有自定义封面，导出可附加可移植元数据：

```json
"coverImage": { "kind": "local", "included": false }
```

这只是提示，不是可用路径。导入时允许并验证该元数据，但一律写入 `cover_image_path = NULL`，因此不论在同一手机或另一台手机恢复，都不会形成失效路径。UI 在导出前后、备份页面和恢复预览中清楚说明“自定义封面图片未包含在 JSON 数据备份中；恢复后将使用默认封面”。

### 严格解析和预览

`src/data/mobile/mobileBackup.ts` 提供可测试的纯解析/校验层。它先将文件文本 `JSON.parse`，再要求顶层有 `novels` 数组，并逐本生成预览而不写入数据库。每本至少校验：

- 若正式备份提供 `id`，它必须是备份内部唯一的正整数，恢复时在 `INSERT` 中原样写入；重复、零、负数、小数或非数字 id 都在 preview 阶段报出具体小说和字段。缺失 `id` 的兼容备份不补造 id，交由 SQLite 自动生成。
- `title`、`author` 为非空字符串；`characters` 是数组，所有 `name` 非空且 `attribute` 为 `1`、`0`、`0.5`、`其他`。
- `cpCategory` 为 `1v1`、`无CP`、`NP`；`status`、`rating`、`cover` 和 `favorite` 可转换性符合共享模型。
- `ending` 为正式值，或是项目已经明确兼容的旧值并经共享 normalizer 显式转换为正式值；未知值报错，不猜测。
- `readCount` 是非负整数；`tags` 是字符串数组；`notes` 是字符串；`createdAt` 和 `updatedAt` 允许既有 `YYYY-MM-DD` date-only 值或合法 ISO-8601 datetime。导入按原字符串保存，date-only 值绝不做时区转换；非法日期在 preview 中列出具体小说和字段。
- `count` 若存在，必须与数组长度一致。未知附加字段忽略。

预览结果包含源文件总数、合法数、逐本带序号和字段名的错误、备份内部的规范化书名+作者重复警告，以及目标数据库当前数量。只要有校验错误，确认导入按钮不可用。备份内部重复只报告、不自动去重、不偷偷合并，遵循恢复忠实性。

### 确认恢复和回滚

只有预览无错误、用户明确确认后才调用 `restoreMobileBackup`。空库显示“导入现有书库”；非空库显示“这将替换手机当前书库”的不可歧义确认文案。恢复按以下顺序执行：

```text
文件文本 → 解析 → 完整校验 → 预览 → 用户确认
  → BEGIN TRANSACTION
  → 清除 novel_tags / characters / novels / tags / authors
  → 依次写入经校验的 author / novel / character / tag / relation
  → COMMIT
```

所有删除和插入属于同一 SQLite 事务。任何 relation 或 insert 失败时执行 `ROLLBACK`，恢复前书库保持不变。校验在事务前完成，绝不“先删旧库再验证文件”。事务提交后检查恢复后的最大 `id`；测试随后新增一本小说，断言 SQLite 分配的 id 大于已有最大 id。事务提交后才执行封面孤儿清理；该清理失败不会伪造数据库失败，而会保留无引用私有文件供后续安全清理，且不会损坏已提交的书库。

导出时 repository 先读取完整数据库模型，再生成 JSON；它把 JSON 写入 Capacitor Filesystem 的 Cache/私有临时位置，调用 `Share.share` 打开系统分享面板，并且不申请广泛存储权限。浏览器继续使用现有 Blob 下载路径。

## 私有封面存储与一致性

`src/data/mobile/mobileCoverStorage.ts` 是唯一访问 `@capacitor/filesystem` 的模块。它使用 App 私有 `Directory.Data` 下的 `covers/`：

1. 仅接受 JPEG、PNG、WebP（可选接受安全、已验证的同类 MIME），且单文件不超过 10 MB。
2. 根据受信任 MIME 选择扩展名，生成 UUID 文件名，不使用用户原始文件名。
3. 读取 `File` 的内容只是为了传给 Filesystem 写入；编码数据仅在内存中短暂存在，绝不进入 SQLite、`Novel`、备份 JSON 或长期状态。
4. 写入成功后只返回 `covers/<uuid>.<ext>` 相对路径；渲染时由 `Filesystem.getUri` 和 Capacitor URI 转换生成当前 WebView 可用的显示 URI。
5. 删除前验证路径严格位于 `covers/` 且匹配生成规则；路径非法、缺失或已不存在均不扩大删除范围。

数据库与文件的边界按以下顺序保持尽可能的一致：

- **新增：** 先写新封面文件，再在事务内插入带相对路径的小说；数据库失败则最佳努力删除刚写入且未引用的文件。
- **替换：** 先保存新文件，再成功更新数据库路径，最后检查旧路径已无引用才删除旧文件。绝不先删旧文件。
- **移除自定义封面：** 先将数据库路径改为 `NULL` 并提交，再安全删除旧文件。
- **删除小说/批量删除：** 数据库删除成功并提交后，检查原路径是否仍被引用，再删除文件。
- **恢复备份：** 导入的路径一律为 `NULL`；提交后清理不再被任何记录引用的历史私有封面，不用 JSON 中的名称构造路径。

如果选择或写入图片失败，表单保留未保存的业务数据和默认封面状态，显示“封面保存失败，请重新选择图片”，而不是部分提交未知状态。

## UI 调整范围

`App.tsx` 继续拥有小说集合、加载状态、筛选、随机、编辑/详情来源、查重提示和导航状态。它只通过统一 API 重新加载数据，不会直接操作 SQL 或 Filesystem。

- 移动首页空书库提供导入和新增入口，随机与最近添加对空集合展示准确空状态。
- 移动“我的/数据管理”展示当前小说/作者数量、SQLite 初始化状态、JSON 导入、JSON 导出、主题和关于；原生模式不展示云同步或 Supabase 登录/退出概念。数据管理页以明确、不夸大的文案说明：卸载 App 或清除应用数据会删除手机 SQLite 与 App 私有 `covers/`；当前 JSON 备份可恢复小说结构化数据，但不包含自定义封面图片；恢复后缺失的自定义封面自动回退既有默认 `CoverArt`。
- `BackupView` 的移动 JSON 入口先显示预览统计、错误和重复警告，再启用确认恢复。它说明封面未随 JSON 打包。移动端 CSV 不调用 Node 后端，并标明该能力延后；桌面现有 CSV import/export 不改动。
- 新增/编辑表单继续支持默认 CoverStyle。选择图片后显示临时预览；成功保存并重新读取 mobile repository 后通过 `NovelCover` 显示私有持久封面。取消、清空或 Web 模式不会把临时预览当作持久数据。
- 书库、首页、作者、详情、随机等所有现有封面位置统一使用 `NovelCover`，从而在无自定义封面时保留现有八套 `CoverArt`。

## Capacitor 与 Android 工程

实施阶段会新增 Capacitor config，使用 `appName: 小说袋`、正式永久 `appId: com.novelbag.app`、`webDir: dist`，并添加 `@capacitor/core`、`@capacitor/cli`、`@capacitor/android`、`@capacitor-community/sqlite`、`@capacitor/filesystem`、`@capacitor/share` 的相互兼容版本。`appId` 不得被日常重构修改，以免产生新的 Android 私有数据沙箱。

`package.json` 在保留 `dev`、`test`、`lint`、`build` 的前提下增加：

```text
android:sync   build 后执行 cap sync android
android:open   打开 Android 工程
android:build  构建 debug APK
```

`npx cap add android` 创建 `android/`。`.gitignore` 将加入 `android/local.properties`、`android/.gradle/`、`android/app/build/`、keystore 和数据库构建/运行产物规则，同时保留可审查的 Android 项目源码。不会主动添加危险存储权限、`MANAGE_EXTERNAL_STORAGE`、永久相册读取权限、广告/统计权限或服务。标准 HTML `input[type=file]` 先调用 Android 系统文件选择器；只有真实 Android 验证失败才讨论额外 picker。

当前环境尚未满足这一步的构建验证：检测到 Java 8，且未发现 `adb` 或常见 Android SDK 位置。代码和单元测试可先完成；到 `cap sync`、Gradle、APK 或设备验证时，将再次只读检查实际 lockfile 兼容矩阵、Java、SDK、adb 和设备，再报告具体缺失项，不自动下载大型工具链。

## 自动测试策略

新增的纯逻辑、repository 和 schema 测试使用自动生成的模拟小说，绝不使用真实备份。生产 mobile adapter 通过接口隔离；测试 adapter 使用 Node 内存 SQLite，以真实 SQL schema 验证迁移和 repository 行为。

至少覆盖：

1. 数据源解析：native 优先 `mobile`、Web Supabase 为 `supabase`、Web 默认 `local`。
2. v1 空库初始化、`PRAGMA foreign_keys`、迁移幂等和 user version。
3. `Novel -> SQLite -> Novel` round trip，含 author/tag 去重、characters 的顺序、可选 `coverImagePath` 和默认 CoverStyle。
4. 新增、编辑、单删与批量删除，并维持既有书名+作者查重规则。
5. 自动生成的 425-like 批量备份成功导入和导出后再导入 round trip。
6. 非法枚举、缺失关键字段、错误日期、非法 tags/characters 在预览中报告，并且完全不改数据库。
7. 事务中途注入 insert/relation 失败后 rollback，断言原有书库完整保留。
8. 恢复预览中的重复记录被报告而不自动合并。
9. 正式备份的 id 原样恢复、重复/非法 id 被 preview 拒绝、兼容备份缺失 id 时由 SQLite 生成，以及恢复后下一次新增 id 大于现存最大 id。
10. `YYYY-MM-DD` 和 ISO-8601 datetime 的日期兼容、date-only 原样保留与非法日期的逐本逐字段错误。
11. 备份 JSON 不含私有路径，带未打包的本地封面元数据恢复后为 `coverImagePath = null`。
12. 封面 MIME、大小、相对路径验证以及新增/替换/删除的清理顺序；Filesystem 调用用 mock 验证，不把 base64 写入持久模型。

完成移动数据层后运行现有 `npm.cmd run test`、`npm.cmd run lint`、`npm.cmd run build`，并回归 Web local 与 Supabase 的 API 分流。Android 工具链可用时，再运行 `npx cap sync android`、Gradle debug build，验证 APK 路径、文件存在和设备/模拟器的离线 CRUD、重启持久化、空库导入、搜索、筛选、作者、统计、随机、详情、主题、封面与无登录/无 localhost 错误。

## 实施顺序与交付检查

1. 在 `android-local-storage` 分支完成 Capacitor 配置和 Android 项目骨架，不触碰真实数据。
2. 建立数据源 resolver、移动数据库接口、v1 migration 和单元测试基础。
3. 实现 mobile repository CRUD、批量删除和高效关系组装，通过 SQLite round-trip 测试。
4. 接入统一 API 门面，确保 native 走 mobile、Web 两路径不回归。
5. 实现 JSON validator、preview、replace restore、rollback 和移动端 export/share。
6. 实现封面存储、表单封面变更意图、统一显示与安全清理。
7. 调整移动端空库/数据管理 UI，并执行 Web 测试、lint、build。
8. 在工具链完整时执行 Cap sync、Gradle APK 和设备/模拟器验证；若仍缺环境，只报告缺失项并保留已通过的代码验证证据。

最终报告必须区分已实际运行的测试、静态验证、环境阻塞的 Android 步骤和未做的真机验证；报告当前分支、Git 状态、diff 检查、依赖、schema/migration、数据源分流、导入 rollback、封面位置/清理、JSON 封面策略、APK 路径（如有）以及真实 425 本数据“未访问/未修改”的事实。
