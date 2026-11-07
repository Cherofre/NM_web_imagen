# 2026-11-07 发布前检查

## 结论

当前源码及 storage-fix 普通试用安装包的功能自动化检查通过，未发现新的业务逻辑缺陷；依赖审计发现8项已知问题，正式发布门禁也因旧包未通过，当前不建议正式发布。

检查基线：`codex/gif-output-parameters`，产品提交 `33c8bd1`；对照本地 `v1.1.6` 标签审查 GIF、透明通道、扩展参数、背景拒绝诊断和存图目录迁移。此次未改产品代码、版本号、用户配置或图库，未安装、发布、推送或同步 G，全部上游验证仅使用本机 mock。

## 发布前尚需完成

1. **构建依赖修复（优先）**：`npm audit --json` 退出1，报告8个受影响包（5高、1中、2低，0严重），均有修复可用。当前锁定 Vite7.3.3、PostCSS8.5.14、esbuild0.27.7、@babel/core7.29.0、browserslist4.28.2、baseline-browser-mapping2.10.29、nanoid3.3.12、source-map-js1.2.1。应按现有主版本约束升级补丁依赖、复验audit/前端测试/构建，然后重建全部包；不建议无差别执行强制主版本升级。证据 `.runtime/preflight-npm-audit-20261107.json` 与 `preflight-npm-tree-20261107.json`。
2. **新版本号**：VERSION、Tauri 和 Cargo 当前一致为 `1.1.6`，属于试用构建，已有同名正式版本。建议下一版使用 `1.1.7`，同步版本与显示回退值后重建；不能用本次同版本试用包替换既有发布资产。
3. **正式产物重建**：本地 `_release/desktop`、`_release/web` 中的1.1.6正式四包仍为10/14产物，不包含本次改动。实跑 `release_preflight.ps1 -LocalOnly` 被正确拦截，报 `Package is missing expected Studio JS: index-CFgZvKnd.js`。后续需重建 Web、Portable、普通安装版、离线 WebView2 安装版，并逐包验证版本、资源及冻结后端行为。试用目录中的 storage-fix Setup 已通过下面的独立核验，不能据此代替整个正式产物矩阵。
4. **原生升级复测**：未对当前用户已安装程序执行覆盖安装、卸载或关闭，也未宣称原生窗口/保存对话框已验证。现有 `smoke_desktop_installer.ps1` 明确拒绝干扰已有安装，应在隔离 Windows 用户或测试机上检查旧版升级、保留配置/会话/图片、刷新历史、非空目录拒绝及空目录迁移。此前实际JSX测试已覆盖 desktopMode=true/false，但不等同原生全过程验收。

依赖风险的适用范围：这些包虽然在package.json中列为dependencies，但本项目发行包携带的是构建后的静态JS/CSS，未携带Vite开发服务器或PostCSS服务。Vite开发服务器编辑器入口与处理不可信CSS的构建链风险应处理，不能把审计的high数量直接当作用户安装包已能被远程利用的结论。[Vite/launch-editor公告](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm)说明Windows路径检查绕过及相关命令注入前提；[PostCSS官方公告](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849)说明处理不可信CSS时sourceMappingURL路径穿越。具体修复版本须同时满足本轮audit的全部公告，不能只按单个公告的最低修复版本处理。

准备正式发布时，以上产物验证完成后再按 `docs/g-share-layout.md` 同步 G；本轮检查没有改动既有分发目录。

## 本轮新鲜验证

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Python全量 | 345通过，106.882秒 | `.runtime/preflight-python-20261107.log` |
| 前端全量 | 316通过 | `.runtime/preflight-node-20261107.log`；从studio-web工作目录执行 |
| Rust桌面 | 10通过 | `.runtime/preflight-rust-20261107.log` |
| 生产构建/尺寸规则 | 通过，资源仍为index-CFgZvKnd.js与index-DX79-LSW.css | `.runtime/preflight-build-20261107.log`、`preflight-size-20261107.log` |
| Python编译 | app.py、image_safety.py、storage.py、upstream.py通过 | 根目录执行py_compile，退出0 |
| Windows PowerShell5.1语法 | 22份脚本，0解析错误 | PowerShell5.1 Parser.ParseFile；不是把脚本实际全部执行一遍 |
| 安装包身份与资源 | 790后端文件逐字匹配，主程序相同，实际嵌入当前boot-guard/JS/CSS | `.runtime/verify_alpha_installer.py .runtime/storage-installer-extracted` |
| 安装包数据排除 | 解出799文件，无配置/历史/会话/便携标记或用户数据目录 | 实际提取目录检查 |
| 安装包冻结后端 | 14项检查通过，12次本机上游调用，0付费 | `.runtime/preflight-frozen-result-20261107.json` |
| 正式发布门禁 | 未通过：本地旧Web包缺少本次JS | `.runtime/preflight-release-gate-20261107.log` |
| npm依赖审计 | 未通过：8受影响包，5高/1中/2低 | `.runtime/preflight-npm-audit-20261107.json` |
| 工作区 | 构建后跟踪文件无额外变化；diff检查通过 | 原有.impeccable/、PRODUCT.md、config.local.json.bak保持不动 |

冻结后端测试使用从实际 NSIS 解出的 EXE，在独立临时数据目录启动，覆盖三个接口（generations、edits、responses）各自 PNG/WebP Alpha 与多帧 GIF，检查扩展对象和multipart类型、GIF帧数/时长、保存下载字节及图片查询令牌授权；另覆盖静态冒充GIF、不透明误返回的失败产物保留、显式参数拒绝仅一次调用、保护字段不发请求、后端热切换目录。热切换允许重写目标历史的saved_path，验证源文件字节不变、所有图片字节不变、历史ID顺序保留及目标路径重定位正确。测试进程均已退出。

## 数据保护复核与边界

- Rust回归覆盖新空会话不能替换已有图库、迁移到空目录时源文件保留、父目录和Windows扩展路径别名的同目录/嵌套判断。普通更换目录使用独占新建，非空目标在修改前拒绝；显式确认的旧数据导入仍是独立流程。
- 安装模板的PageReinstall直接Abort，跳过旧版卸载步骤，安装节复制程序资源；本轮静态复核未发现新增删除图库的操作。该源码审查不替代真实覆盖安装测试。
- 前一任务恢复的167文件/17旧会话及原备份本轮未再修改。两张9/10旧图原始文件仍缺失，属于已有数据恢复遗留，不能宣称所有旧图已找回，详见 `gallery-recovery-2026-11-07.md`。
- UI的实际浏览器播放、四视口/200%缩放证据沿用当天对应源码验收；此次未重复冒充原生GUI验收。真实渠道GIF/透明能力和模型质量不由本机mock证明。
- 构建有既有大于500kB主JS提示和非module的boot-guard提示；构建成功且嵌入资源核对通过。Python重复ZIP成员告警来自专门测试坏包的fixture，全量结果通过。

本次验证的试用包：`_release/storage-fix-preview/NM-Image-Studio-Storage-fix-preview-Setup-x64.exe`，34,157,786字节，SHA256 `0d2d491cba3d9eda87086dece57e67e9034e13db892b6226be7909b42c7654ca`。
