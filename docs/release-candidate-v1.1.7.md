# 1.1.7 候选包与覆盖升级验收

日期：2026-11-07。接续 `release-readiness-2026-11-07.md`；用户要求执行检查待办，并明确选择「备份后在本机测试（退出并覆盖当前安装）」，后续确认已正常退出。

## 已完成的准备

- 在现有兼容范围内执行依赖修复，无 `--force` 或主版本迁移；更新29个包，Vite7.3.7、PostCSS8.5.32、esbuild0.28.2。后续独立 `npm audit --json` 结果为0漏洞，证据 `.runtime/release117-npm-audit.json`。
- VERSION、Tauri、Cargo/Cargo.lock和前端显示回退值统一1.1.7。资源为 `index-4Rn5cwpJ.js`、`index-DX79-LSW.css`。没有增加接口调用或改变付费请求策略。
- 正式命名的Web、Portable、普通NSIS及离线WebView2 NSIS四包全部新建，保留原有版本包；本地预检及四包manifest/hash/当前资源校验通过。未正式发布、推送、创建标签或同步G。
- 用户更新说明已准备：`release-notes-v1.1.7.md`。

## 构建与功能证据

- 前端316项、Rust10项、尺寸规则及生产构建通过。Python全量最终串行345项全部通过（117.118秒，`.runtime/release117-python-serial.log`）；首次与编译并行跑345项时，有1项100ms计时断言耗时250ms，未修改或放宽测试，构建结束后串行复跑通过。
- Web包使用随包便携Python和离线依赖，实际解压/准备/随机端口启动成功，health版本1.1.7；无需系统Python。日志 `.runtime/release117-web-smoke.log`。
- 实际Portable冻结后端完成旧配置读取、鉴权、数量协商/补齐、异常usage、生成及编辑的部分结果、Responses少图、standard/compat局部编辑、背景真实Alpha成功/失败、GPT/Banana聊天、Banana生成及取消等回归。证据 `.runtime/release117-frozen-broad.log`。
- Portable、普通NSIS和离线NSIS提取出的实际EXE各自完成14项检查，均为独立临时数据目录和本机mock：三接口各自PNG/WebP透明度、多帧GIF、参数位置和multipart JSON类型、保存/下载字节、图片URL令牌授权、静态/不透明误返回保留、显式参数拒绝不重试、保护字段不调用上游、后端热切换保留来源并重定位历史。报告 `.runtime/release117-frozen-output-result.json`、`release117-online-mock.json`、`release117-offline-mock.json`。
- 两种NSIS各790后端文件与Portable逐一比对；仅PyInstaller base_library.zip的成员时间戳不同，逐成员内容相同。各自shell实际嵌入当前boot guard/JS/CSS，PE和后端版本1.1.7；离线包含大于100MB的WebView2运行时，普通版不包含。日志 `.runtime/release117-installer-payload.log`；各提取799文件，不含用户配置/历史/会话/输出或portable.mode。
- 新编译前端的真实浏览器透明提交、GIF/透明格式联动、四视口（1280/820/760/400）与200%缩放、Escape、数量边界/加减、默认内容不滚动均通过。GIF实际点击12帧/150ms提交，5次截图中心颜色交替蓝/橙，确认浏览器播放。证据 `.runtime/release117-ui-*.log`，截图 `output/playwright/release117-*.png`。桌面模式入口的实际JSX执行证据由本次316项测试覆盖；不将浏览器测试冒充原生UI。

## 数据保留与实际安装

1. 临时复制1.1.5、1.1.6便携包，分别加入测试图片、参考图、历史、会话、配置和自定义图库设置后覆盖1.1.7。每份10个测试数据文件SHA256原样保留，新后端版本正确。证据 `.runtime/release117-preservation-result.json`；与下面实际安装区分。
2. 用户正常退出后，对实际程序目录、AppData用户目录和D盘图库完整复制，共6,697文件、1,746,652,740字节，逐文件SHA256核对。备份位于 `.runtime/release117-native-backup`，清单 `.runtime/release117-native-backup-manifest.json`。保留此前原始图库备份，不执行数据删除/恢复覆盖。
3. 以用户明确授权执行普通1.1.7安装包静默覆盖，退出0，沿用 `I:/Program/NM Image Studio`。实际791个程序/后端文件与提取安装包逐字一致，PE版本1.1.7；原有5,840个用户或不属于程序替换范围的文件全部未变。证据 `.runtime/release117-native-install-result.json`。
4. 重新启动真实安装版，health版本1.1.7，仍使用原AppData及 `D:/Documents/NM Image Studio`。配置原始字节未变，所有原会话ID/轮次ID保留，共19会话127轮；162图片链接160有效，只剩此前已记录的两张9/10旧图404。新版实际返回的前端入口与本次构建逐字一致。报告 `.runtime/release117-native-runtime-result.json`。
5. 原生UI自动化控制器 `@oai/sky` 报 `failed to launch codex app-server: 系统找不到指定的路径。 (os error 3)`；按技能重试/重置后仍失败，备用cua接口也报同一错误。未通过注入或其他UI脚本绕过。用户手动正常退出，安装和运行检查通过合法进程/本地接口完成；用户随后明确确认「图片和生成设置均正常显示」，完成原生窗口的人工显示验收。不能将其写成原生自动化点击通过，保存对话框也未自动化测试。

目录拒绝/迁移保护沿用本轮通过的Rust回归：非空图库不移动、不覆盖；空目标独占新建、保留来源；同目录/父目录/Windows扩展路径别名不能绕过。没有在用户真实图库上人为切换目录制造测试数据。

## 四类候选包

| 包 | 字节数 | SHA256 |
| --- | ---: | --- |
| `_release/desktop/NM-Image-Studio-v1.1.7-Setup-x64.exe` | 34,148,392 | `3918a3881f79022e1ff16a9a359ef9aa95b5b4cdaad7a05b486531bd02d12ccf` |
| `_release/desktop/NM-Image-Studio-v1.1.7-Offline-WebView2-Setup-x64.exe` | 251,873,143 | `f1371d92f8b07730592c4046a4a6fb4cf4729308e512b01a8e15958426ba805e` |
| `_release/desktop/NM-Image-Studio-v1.1.7-Portable-x64.zip` | 48,429,465 | `25b7b8827dc59821b69eb8d1f1687c550d4175213d395635e97af885d1b1ef4e` |
| `_release/web/NM_web_imagen-v1.1.7-Web-x64.zip` | 29,452,543 | `54a973c0cff5bbcbe4f0ceb961d54fb2d039d2bdb01059dba2dde7dfe539ac2b` |

所有付费/真实上游测试次数为0。当前实际安装版保持运行，备份保留；正式发布与G同步是下一阶段，不能把本地候选包记成已发布。

后续：用户明确要求发布后，2026-11-07 15:46:24（Asia/Shanghai）已正式发布1.1.7并完成两处G同步。详见 `release-v1.1.7.md`，本候选验收内容作为发布依据保留。
