# NM Image Studio 桌面端检查更新实施方案

> 状态：方案已收敛，尚未实现  
> 适用范围：Windows x64 桌面安装版与桌面便携版  
> 不影响：现有网页端、网页 ZIP、`127.0.0.1:7861` 启动方式和网页端数据目录

## 结论

推荐采用“同一版本源、两种更新动作”的方案：

- **桌面安装版**使用 Tauri 2 官方 updater 插件，下载 Tauri 生成的 NSIS 更新包，强制校验 Tauri 签名，用户确认后安装并重启。
- **桌面便携版**检查同一版本，但下载完整便携 ZIP。第一阶段不在程序运行时覆盖自身，只打开下载位置并指导用户保留 `data\` 后替换程序文件。
- **网页端**不接入桌面更新器。网页 ZIP 继续独立发布，桌面更新不会扫描、停止、覆盖或迁移网页端目录。

这比给安装版和便携版强行共用一套自替换逻辑更适合当前项目。安装版可以复用 Tauri 已有的签名、下载和 NSIS 安装流程；便携版则避免 Windows 文件占用、sidecar 进程和 `data\` 误覆盖风险。

## 第一版范围

第一版应完成：

1. “关于”页手动检查更新。
2. 可关闭的自动检查，默认开启；应用启动稳定后延迟检查，同一设备最多每 24 小时一次。
3. 发现新版本后展示版本号、发布日期和更新说明。
4. 安装版显示下载进度，下载完成后由用户点击“安装并重启”。
5. 便携版下载或打开新版 ZIP，明确提示保留当前 `data\`。
6. Tauri 签名校验；公开 SHA256 作为人工核对和发布诊断信息。
7. 有排队或运行中的生成任务时允许检查更新，但禁止进入安装重启步骤。
8. 检查失败、下载失败、签名失败和安装失败都有可理解的中文/英文状态，不影响继续生图。
9. 记录上次检查时间、忽略到何时、已发现版本和失败摘要，不记录令牌、API Key 或本地后端地址。

第一版不包含：

- 静默安装或强制更新。
- 运行中的便携版原地自覆盖。
- 自动切换 Beta、Nightly 等多渠道。
- 首版同时接入 UNC 文件共享更新源。
- 没有外部引导程序时承诺“安装失败自动恢复到旧 EXE”。

## 用户流程

### 关于页

“关于”里的更新区域保持一个连续状态区，不再弹出第二层设置窗口：

| 状态 | 展示 | 主操作 |
| --- | --- | --- |
| 未检查 | 当前版本、自动检查开关 | 检查更新 |
| 检查中 | 简短进度状态 | 按钮禁用 |
| 已是最新 | 最新状态、检查时间 | 再次检查 |
| 有新版本 | 新版本、发布日期、更新说明摘要 | 下载更新 |
| 下载中 | 文件大小、百分比、已下载量 | 暂不提供安装按钮 |
| 等待安装 | 已验证、准备安装 | 安装并重启 |
| 任务阻止安装 | 活跃任务数量和原因 | 完成或取消任务后安装 |
| 失败 | 清晰错误和保留当前版本的说明 | 重试、打开发布页 |

启动自动检查不弹模态框。发现新版本时，在工作台顶部显示一条轻提示，可选择“查看更新”或“稍后提醒”。“稍后提醒”只隐藏当前版本 24 小时，“关于”页仍显示该更新。

### 安装版

1. 用户检查到新版本。
2. 点击“下载更新”，程序下载由 Tauri 生成的 NSIS 更新包并校验内置公钥签名。
3. 下载完成后显示“已验证”。
4. 若没有排队或运行任务，用户点击“安装并重启”。
5. 安装前刷新会话、配置和窗口状态；Windows 安装器接管后退出当前桌面壳，更新应用目录，再启动新版本。

安装版的数据继续保存在 Tauri per-user app-local data 目录，不随安装目录替换，网页端数据也不会参与。

### 便携版

1. 用户检查到新版本。
2. 程序读取便携更新清单，显示版本和更新说明。
3. 下载完整 `NM-Image-Studio-v<版本>-Portable-x64.zip`，验证签名和 SHA256。
4. 下载完成后打开文件位置，并展示三步说明：关闭应用、保留当前 `data\`、用新包中的程序文件替换旧程序文件。
5. 第一版不在应用运行时移动当前 EXE、`backend\` 或 `data\`。

后续若确实需要一键更新便携版，应增加独立 updater helper。helper 在主应用和 FastAPI sidecar 完全退出后替换白名单文件，明确跳过 `data\`，验证启动成功后再删除备份。这不应塞进第一版主进程。

## 技术结构

### Tauri/Rust

新增 `studio-web/src-tauri/src/updater.rs`，由 Rust 封装更新能力，不把完整 updater 权限直接暴露给 WebView。建议命令边界：

- `desktop_check_update`
- `desktop_download_update`
- `desktop_install_update`
- `desktop_open_release_page`
- `desktop_download_portable_update`

Rust 根据现有运行模式判断：

- `desktop-installed`：调用 `tauri-plugin-updater`。
- `desktop-portable`：只走便携清单和 ZIP 下载逻辑。
- `web`：前端不显示桌面更新区，也不会调用这些命令。

实现时同步修正 `studio-web/src/desktopRuntime.ts` 的 `RuntimeMode` 类型。Rust 当前实际返回 `desktop-installed` 或 `desktop-portable`，而 TypeScript 仍声明为 `web | desktop`；现有判断只比较 `web`，所以运行没有中断，但更新器需要准确的模式类型才能安全分流。

Tauri 配置需要：

- 引入 `tauri-plugin-updater`。
- `bundle.createUpdaterArtifacts: true`。
- 在 updater 配置中写入公开签名公钥和 HTTPS `latest.json` 地址。
- 使用 Windows `passive` 安装模式，保留可见的安装进度，不做无提示安装。
- 使用 `on_before_exit` 保存窗口状态并结束 sidecar；继续保留现有 Job Object 兜底。

安装版更新只使用普通联网 NSIS 更新产物。离线 WebView2 Setup 继续作为手动下载的完整安装包，不成为自动更新包，以免每次更新都下载约 240 MB。

### 前端

新增独立的更新状态模块，避免继续把网络和状态机逻辑堆入 `App.tsx`。建议拆分为：

- `studio-web/src/desktopUpdater.ts`：Tauri 命令封装、状态类型和本地偏好。
- `studio-web/src/DesktopUpdatePanel.tsx`：关于页更新区域。
- `studio-web/src/DesktopUpdateNotice.tsx`：工作台顶部轻提示。

前端状态至少包括：

```text
idle -> checking -> upToDate
                 -> available -> downloading -> readyToInstall -> installing
                 -> failed
```

`available` 和 `readyToInstall` 必须保留到应用关闭或用户明确忽略。下载进度不使用模糊无限加载动画；有总大小时显示百分比，没有总大小时显示已下载字节。

### 任务和数据安全

- 检查和下载不阻塞生成任务。
- `activeQueueCount > 0` 时禁止安装；按钮说明具体有多少个任务仍在运行或排队。
- 安装前显式完成会话持久化，并等待当前配置保存结束。
- 新版本的数据格式至少向后兼容一个桌面版本；不可在启动时执行不可逆的数据删除或覆盖迁移。
- 更新器不读取网页端目录，不使用网页端 7861 端口，不复用网页端 `config.local.json`、`outputs\` 或日志。
- 便携更新始终把 `data\` 视为用户数据，更新包和替换脚本都必须排除它。

## 更新源与发布清单

第一版只支持 **GitHub Releases 稳定渠道**：

```text
https://github.com/Cherofre/NM_web_imagen/releases/latest/download/latest.json
```

不要在第一版同时实现 GitHub、UNC、G 盘和自定义 URL 的自动回退。Tauri 正式环境会强制 HTTPS，而 UNC 还需要自行完成读取、签名校验、超时、凭据和错误回退，测试成本远高于收益。内部源可在稳定渠道跑通后作为第二阶段，以相同清单格式增加，不改变界面状态机。

每次桌面 Release 建议包含：

- 普通 NSIS Setup。
- NSIS updater 签名文件。
- `latest.json`，供安装版 Tauri updater 使用。
- 便携 ZIP。
- 便携 ZIP 签名和 SHA256。
- `portable-latest.json`，供便携版检查使用。
- 离线 WebView2 Setup，供手动下载。
- 网页 ZIP，继续独立使用，不进入桌面更新动作。

`latest.json` 使用 Tauri 官方静态清单结构。`portable-latest.json` 建议包含：

```json
{
  "schema": 1,
  "version": "1.1.1",
  "publishedAt": "2026-08-21T08:00:00Z",
  "notes": "本版本更新说明",
  "url": "https://github.com/Cherofre/NM_web_imagen/releases/download/v1.1.1/NM-Image-Studio-v1.1.1-Portable-x64.zip",
  "signature": "便携 ZIP 的签名内容",
  "sha256": "...",
  "size": 0,
  "releasePage": "https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.1"
}
```

增加 `scripts/generate_desktop_update_feed.ps1`，从根目录 `VERSION`、已生成包、签名和一份发布说明源生成两个 JSON。禁止手工分别维护两个版本号。`scripts/verify_v1_1_0_packages.ps1` 或后续版本化验证脚本应检查：

- 两个清单版本一致。
- URL 文件名与实际资产一致。
- 签名字段非空且能通过公钥验证。
- SHA256 与文件一致。
- 便携包仍包含 `portable.mode`，且不包含 `data\`。
- 网页包不包含 Tauri 更新器或桌面数据目录。

## 签名与密钥

Tauri updater 的签名不可关闭，这正适合本项目：

- 公钥提交到 Tauri 配置，可以公开。
- 私钥不进入 Git、ZIP、安装器、G 盘同步目录或日志。
- 本地发布时只通过 `TAURI_SIGNING_PRIVATE_KEY` 和可选密码环境变量注入。
- 若以后改为 GitHub Actions，私钥和密码放入仓库 Secrets。
- 私钥至少保留两份离线备份；丢失私钥意味着已发布客户端无法信任后续更新，只能手动安装新的桥接版本。

HTTPS 防止普通传输篡改，签名证明更新来自持有私钥的发布者，SHA256 主要用于发布核对和用户诊断。不能只依赖 GitHub HTTPS 或 SHA256 文本文件代替签名。

## 错误与恢复

| 失败点 | 行为 |
| --- | --- |
| 检查超时/无网络 | 保持当前版本可用，显示“稍后重试”和发布页入口 |
| 清单无效 | 不下载，记录脱敏错误 |
| 下载中断 | 删除不完整临时文件，允许重试 |
| 签名失败 | 删除下载文件，显示安全校验失败，不提供强制安装 |
| 安装启动失败 | 保持当前版本，不改用户数据，提供重试和手动下载 |
| 更新后首次启动失败 | 保留上一个 Release 和恢复说明，不自动修改用户数据 |

Tauri updater 本身不等于完整自动回滚系统。第一版采用“安装前不破坏数据、失败不继续替换、旧版本安装包可重新下载”的恢复策略，并写入 `desktop-update-state.json` 记录目标版本、尝试时间和首次成功启动标记。

真正的自动回滚需要独立 helper：缓存旧安装包或旧程序目录、等待所有进程退出、替换、启动健康检查、失败后恢复。该能力应在第一版更新流程稳定后单独实现和测试，不能在没有 helper 的情况下宣称已经支持。

## 实施顺序

### 阶段 A：发布基础

1. 生成 updater 密钥并安全备份。
2. 加入 Tauri updater 插件和签名配置。
3. 让安装器脚本产出 updater artifact、签名和 `latest.json`。
4. 让便携脚本产出签名和 `portable-latest.json`。
5. 添加清单、版本、签名和包内容验证。

### 阶段 B：检查与界面

1. 实现 Rust 检查命令和运行模式分流。
2. 实现关于页状态机、手动检查、自动检查开关和 24 小时节流。
3. 实现顶部轻提示、稍后提醒和中英文文案。
4. 使用本地假清单完成无更新、有更新、超时、无效清单和签名失败测试。

### 阶段 C：安装版更新

1. 实现下载进度和待安装状态。
2. 加入活跃任务阻止安装。
3. 安装前刷新会话、配置和窗口状态。
4. 从旧版安装包实测更新到新版，并检查 sidecar、数据目录和单实例行为。

### 阶段 D：便携版更新

1. 实现便携清单检查和 ZIP 下载。
2. 校验签名和 SHA256。
3. 打开下载位置并展示保留 `data\` 的替换步骤。
4. 在带现有配置、历史、日志和成图的副本上实测升级。

### 阶段 E：后续增强

1. 独立 updater helper 和自动回滚。
2. 内部 HTTPS/UNC 更新源适配。
3. 稳定/Beta 渠道。
4. Authenticode 代码签名和 SmartScreen 信誉积累。

## 验收矩阵

- 安装版：无更新、有更新、下载进度、签名失败、任务中禁止安装、安装并重启、数据保留。
- 便携版：无更新、有更新、下载失败、签名失败、保留 `data\`、新旧包替换后启动。
- 网络：断网、超时、GitHub 404、清单字段缺失、资产 URL 失效。
- 版本：相同版本、较旧远端版本、较新版本、非法版本号。
- 生命周期：更新时只有一个桌面壳和一个 sidecar，安装退出后无残留进程。
- 共存：网页端 1.1.0 与桌面端同时运行；桌面更新前后网页进程、7861 端口和网页目录都不变化。
- 安全：私钥不进入仓库和发布包；错误日志不包含桌面令牌、API Key 或本地后端 URL。
- 发布：从一个版本源生成 Setup、Updater、Portable、Web 四类资产和两个更新清单，版本与哈希一致。

## 首次发布注意

更新器必须先存在于旧版本客户端中，才能把它升级到下一版。因此若在正式发布前完成本方案，应让 v1.1.0 成为首个“具备更新能力”的桥接版本，再用一个仅供验证的 v1.1.1 Release 完成真实升级测试。

如果 v1.1.0 已经发布且不包含 updater，则现有 v1.1.0 用户仍需要手动安装一次带 updater 的版本，此后才能使用应用内更新。
