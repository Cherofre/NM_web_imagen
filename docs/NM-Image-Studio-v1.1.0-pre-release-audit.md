# NM Image Studio v1.1.0 预发布测试与审查

- 日期：2026-08-21
- 分支：`codex/desktop-v1.1.0`
- 范围：桌面安装版、离线 WebView2 安装版、桌面便携版、网页 ZIP、更新器、网页/桌面共存、旧配置与数据边界、发布包清洁度。
- 结论（预发布阶段）：运行时与本机发布烟测通过；公开发布前仍有发布流程和外部环境门槛。

## 已通过的测试矩阵

| 区域 | 测试 | 结果 |
| --- | --- | --- |
| 前端 | Node 测试 171/171 | PASS |
| 后端 | Python `unittest` 251/251 | PASS |
| 构建 | Python 编译、`pip check`、Vite/TypeScript、Rust fmt/check | PASS |
| 桌面后端 | sidecar 启动、健康检查、版本/实例 ID、认证边界 | PASS |
| 桌面生命周期 | 单实例、重复启动激活、Job Object 关闭时回收 sidecar | PASS（已有运行证据） |
| 便携版 | 解压、EXE/backend/`portable.mode`、首次启动创建 `data\` | PASS |
| 普通安装器 | NSIS 解包、EXE/backend 存在、卸载清理 | PASS |
| 离线安装器 | 含离线 WebView2 的 NSIS 解包、EXE/backend 存在、卸载清理 | PASS |
| 网页包 | 解压后使用自带 Python runtime 启动，健康检查与静态资源探测 | PASS |
| 共存 | 网页 ZIP 与桌面便携 ZIP 同时运行，端口、数据根目录、版本互不冲突 | PASS |
| 更新签名 | 真实 updater 私钥签名、便携 ZIP 签名、feed 生成、SHA256/无 BOM | PASS |
| 包版本 | 普通 Setup、离线 Setup、Portable、Web manifest 与 1.1.0 对齐 | PASS |
| 旧网页发布流程 | `release_preflight.ps1 -LocalOnly -ExpectedVersion 1.1.0` | PASS（使用其当前仍要求的上级目录旧式 ZIP 输入） |

## 当前发布物

| 产物 | 大小 | SHA256 |
| --- | ---: | --- |
| `NM-Image-Studio-v1.1.0-Setup-x64.exe` | 26,302,945 | `6b4c1f940c7a8e8802cd8bad85ba7353fff785cb2a194c95dce8b24b50418ac9` |
| `NM-Image-Studio-v1.1.0-Offline-WebView2-Setup-x64.exe` | 242,019,331 | `a8a148261f87b0e39bbe31ddcde58ee06199ec7cdc65d623c590026c9daf6e33` |
| `NM-Image-Studio-v1.1.0-Portable-x64.zip` | 36,409,186 | `3d492857861b9a8e297296b1325308c0acc2b04cc65629c3d94f0b2684d97112` |
| `NM-Image-Studio-v1.1.0-Updater-x64.exe` | 26,303,088 | `4b3c6eca3db857128fae94bf62c8b62ddc561fff0618394aaf24a0da0db78a1e` |
| `NM_web_imagen-v1.1.0-Web-x64.zip` | 29,244,573 | 见同目录 `.sha256` |

当前 `latest.json` 与 `portable-latest.json` 均为无 BOM、版本 1.1.0，URL、大小、SHA256 与当前 updater/Portable 文件一致；签名字段存在。

## 兼容性审查

已覆盖或静态确认：

- 目标为 Windows x64；便携包 README 明确要求 Windows 10/11 x64 和 Evergreen WebView2。
- 普通安装版使用系统 Evergreen WebView2；离线安装版嵌入 WebView2 安装器，适合无网络或首次安装环境。
- 启动前检查 HKCU、HKLM 及 WOW6432Node 的 WebView2 注册信息；缺失时显示明确的中文安装提示。
- 安装版数据与网页端目录隔离；便携版把配置、历史、日志和生成图放到 EXE 旁的 `data\`，升级时必须保留该目录。
- 旧配置迁移、DPAPI 保护、历史/会话兼容由现有 Python/Node 回归套件覆盖；没有发现需要删除旧字段的迁移。
- sidecar 默认隐藏控制台，调试窗口通过设置显式打开；单实例使用命名 Mutex，sidecar 由 Job Object 兜底回收。
- 网页端继续使用 7861 及自身 `outputs\` / `config.local.json`；桌面端不读取、停止或替换网页端目录。

当前机器实际为 Windows 11 x64，且已安装 WebView2。因此“无 WebView2 的真实机器启动失败提示”和不同 Windows 版本、不同权限账户尚未做真实硬件矩阵验证。

## 需要在公开发布前处理或明确接受的风险

### P0/P1：发布闸门

1. **尚未做真实 1.1.0 → 1.1.1 GitHub Release 端到端升级。** 当前 feed 只做了本地真实私钥和结构烟测；安装版 updater 下载、验签、替换、重启，以及便携版下载后保留 `data\`，都需要在后续测试 Release 上完成一次。
2. **EXE/安装器没有 Authenticode 签名。** `Get-AuthenticodeSignature` 对 Setup、Updater、离线 Setup 均为 `NotSigned`。这不会阻止本机运行，但会影响 SmartScreen、企业环境信任和首次安装体验；公开分发前建议使用受信任代码签名证书。
3. **`package_desktop_updater.ps1` 的元数据顺序曾存在缺陷。** 已修正为保留普通 Setup 的独立 manifest/SHA256，签名 NSIS 文件只输出为 Updater；正式重建时仍需用全新 staging 验证。
4. **发布 staging 仍留有旧的 `v1.1.0-alpha.1` 三个文件。** 它们不在当前四类包内，但会污染人工挑选或上传资产的目录；正式发布前应使用全新空 staging，或明确只上传当前版本文件。

### P2：非阻断但应排期

- `release_preflight.ps1` 现在优先检查 `_release/web/`，并保留旧式上级 ZIP 回退兼容。
- 当前 `studio-web/package-lock.json` 的构建链仍有 3 个 High、2 个 Low 的 `npm audit` 报告（Vite/PostCSS/nanoid/esbuild/Babel 相关）。现有 `node_modules` 是修复版本，最终运行包不携带构建工具，但干净 `npm ci` 仍会复现旧锁文件风险；应在后续版本更新锁文件并重跑完整构建。
- 便携版更新只下载并验签 ZIP，仍需用户手动替换应用目录；自动回滚 helper 尚未实现。
- 单实例已有窗口激活仍依赖唯一窗口标题 `NM Image Studio`；若未来允许多窗口或本地化标题，应改为更稳健的窗口标识。

## 未能在本机完成的验证

- 没有第二台干净 Windows 10/11 机器可验证安装权限、杀毒软件、代理、无 WebView2、无 VC 运行库等差异。
- 本文档创建时尚未执行真实 GitHub Release 上传、签名资产下载和旧版本升级/回滚；正式发布完成后应在发布记录中补充 Release URL 和资产校验结果。
- 没有使用真实代码签名证书做 SmartScreen/企业策略验证。
- 没有对 1.0.x 的真实用户目录做破坏性升级演练；当前只做了代码级兼容测试和隔离检查。

## 发布建议

当前版本可以进入正式发布收尾阶段；更新链路仍按后续测试 Release 单独验收。发布收尾顺序是：

1. 在全新 staging 目录重建四类包。
2. 清除旧 alpha 资产，只保留当前版本文件。
3. 用测试 GitHub Release 完成一次 1.1.0 → 1.1.1 安装版升级和便携版下载校验。
4. 若面向普通用户分发，给 Setup/Updater/离线 Setup 做 Authenticode 签名。
5. 再跑 `verify_v1_1_0_packages.ps1`、四个 smoke 脚本和 `release_preflight.ps1`，最后才考虑 Release。
