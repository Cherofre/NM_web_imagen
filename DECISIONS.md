# Decisions

## Active Decisions

## 2026-09-10 - v1.1.2 白屏缺陷修复与同版本重发
- Status: active
- Decision: 已发布的 `v1.1.2` 桌面端（安装版 + 便携版）打开是纯白窗口，用户验收时发现。经确认根因是构建产物问题后，用户明确选择**不改版本号**：仍以 `1.1.2` 覆盖替换 GitHub Release 资产与两处 G 盘分发，不新开 1.1.3。
- Reason: 版本号保持不变可以让 G 盘目录名、文件名、发布说明与同事的工作目录都不用改；代价是已经下载过旧 1.1.2 的人无法从版本号上察觉自己手里是坏包，因此发布说明里明确写了「已装过 1.1.2 的机器请用本次重新打包的包覆盖升级」。
- Decision: 修复方式是把 Studio 产物变回「单个经典脚本」：`vite.config.ts` 打开 `build.rollupOptions.output.inlineDynamicImports`（不再拆 chunk），新增 `nm-classic-script-compat` 插件把 `import.meta.url` 改写为 `document.baseURI`、并对残留的 `import.meta` / 动态 `import(` 直接构建失败；`keep-asset-fallbacks.mjs` 增加同样的 `import.meta` 断言。`static/studio/index.html` 继续使用非 module 的 `defer` 脚本（保持「直接双击打开」的既有约定）。
- Reason: 保留 `type="module"` 改写的既有决策，避免破坏 `test_studio_index_does_not_require_module_script_for_file_open` 所保护的行为；单文件产物既满足该约定，也不会再引入 module-only 语法。
- Decision: 兼容性加固三件：`build.target` 固定为 `chrome105`（其他机器上的 WebView2 版本可能更旧）；新增 `static/studio/boot-guard.js`（在 bundle 之前加载，脚本解析失败或若干秒后 `#root` 仍为空时显示可截图反馈的提示，正常启动时完全静默），并把该文件加入三份发行脚本的必需清单；`scripts/smoke_desktop_portable.ps1` 改为**验证窗口真的渲染**（CDP 断言 `#root` 有内容 + 用 `vm.Script` 校验脚本可按经典脚本解析），已有实例占用时直接报错而不是给出误导性失败。
- Reason: 旧烟测只等待 `data` 目录出现，白窗照样 PASS；「进程活着 + 后端 200 + 前端零请求」正是白屏的特征，必须直接检查渲染结果。用户要求「不要在别人电脑上安装后出现类似问题」。
- Decision: 安装器语言改为按系统 `InstallLanguage` 预选，并注释掉 `MUI_LANGDLL_REGISTRY_*` 三个 `!define`（MUI 一旦读到已存语言值就会跳过语言选择页并一直沿用）。
- Consequences: 语言选择页现在每次交互安装都会出现（默认简体中文）；安装器不再写入 `Installer Language` 注册表值。首次使用设置的「存图位置」选项改为显示真实路径与真实选中态。`tauri.conf.json` 的 `csp` 补上 `http://ipc.localhost`，Tauri IPC 不再退化成 postMessage。

## 2026-09-10 - v1.1.2 打包放行与发行清单白名单
- Status: active
- Decision: 用户明确授权在本轮最终检查通过后直接同步两处 G 盘目录并发布 GitHub Release `v1.1.2`。发行方式沿用安装器/便携包手动升级，自动更新签名链路不参与本次发布。
- Decision: 发行清单白名单新增 `static/studio/assets/<name>-<8位hash>.(js|css)`，用于接受 1.1.2 新增的 Studio 代码分块（桌面缩放用的 `webview-*.js`）。规则放在 `index-*.js`/`index-*.css` 计数规则之后，保证「至少一个 index 资源」的断言仍然成立；三份校验脚本（`package_web_tool.ps1`、`release_preflight.ps1`、`sync_release_to_g.ps1`）同步修改。
- Reason: 实测 `npm run web:package` 直接失败——`Release manifest contains an unknown file: static/studio/assets/webview-BciZp75t.js`。白名单只认 `index-*`，而新增能力会让 Vite 产出额外分块；这属于打包脚本的回归，不是产品缺陷。
- Consequences: 以后新增任何代码分块都不再需要改脚本；但仍然只允许 `static/studio/assets/` 下的哈希资源，其他未知路径继续硬失败。`tests/test_release_cache_busting.py` 增加断言，确保三份脚本都保留该规则且顺序正确。
- Decision: 本机已安装 1.1.1，`scripts/smoke_desktop_installer.ps1` 按设计拒绝运行；真实覆盖升级不在本轮自动化范围内，作为已知未验证项写入发布台账，交由用户按 `docs/v1.1.2-acceptance-checklist.md` 验收。
- Reason: 直接在本机跑安装器会干扰用户正在使用的 1.1.1 安装和数据目录。

## 2026-09-10 - v1.1.2 配置审查修复
- Status: active
- Decision: 用 `credential_pair_id` 明确连接配对；缺少标识的旧候选配置按独立连接加载，不猜测另一侧档案。新导入档案清除外部配对关系；匹配同地址本机档案时保留其已有配对。
- Decision: 导入时按完整地址核对 Key 归属，同 ID 异地址另建无 Key 档案；保持 URL 路径大小写。保存完整活动表单，由后端连接字段白名单统一过滤。
- Decision: 模型请求绑定档案 ID、地址和 Key 的快照，切换或修改后抛弃旧响应；双引擎快照均清除缺失的档案私有字段。
- Consequences: F1–F5 已修复并加入行为回归；仍需重启开发实例以重建包含新配置字段的后端，再做桌面/打包验收。本轮不执行 G 盘同步或 Release。

## 2026-09-10 - v1.1.2 审查暂不放行
- Status: superseded（缺陷已修复，发行包与人工验收仍待完成）
- Decision: 本轮审查不执行 G 盘同步或 GitHub Release；先修复 `docs/v1.1.2-pre-release-review.md` 的 5 项已复现问题，再重新构建和验收四类发行包。
- Reason: 存在本机 Key 跨地址绑定、保存字段遗漏和多档案状态串写；217 Node / 280 Python 测试通过不能覆盖这些缺口，且目前缺少 1.1.2 发行包。
- Consequences: 保留运行中的开发实例和 G 盘 1.1.1 分发。审查复现器只证明错误存在，不能当作修复后的绿色回归。

## 2026-09-10 - v1.1.2 单配置内切换生图模型 + 中文覆盖安装
- Status: active
- Decision: 在同一个 `gpt-image-2` 配置档案内支持切换生图模型：新增 `POST /api/models`（按档案的 base_url/API Key 读取上游 `/v1/models`），档案表单新增 `model_options` 字段（换行分隔、去重、上限 120 项），配置抽屉用下拉 + 自定义输入 + 「读取模型列表」，输入框工具条增加快速切换器；所有写入仍走原有 `/api/config/local-file`。
- Decision: 安装包改为简体中文 + English 双语，并始终覆盖安装：`studio-web/src-tauri/nsis/installer.nsi` 从 `@tauri-apps/cli` 2.9.2 内嵌模板复制后仅打两处补丁（跳过重装选择页；passive 模式跳过多语言选择框），三份 installer 配置统一 `languages`/`displayLanguageSelector`/`customLanguageFiles`/`template`。
- Reason: 用户要求"单个配置中可切换生图模型"，而一个中转地址常同时提供多个图片模型（如 `「YS」gpt-image-2.5-flare` 与 `sunburst`），逐模型建配置冗余且容易漏改 Key；安装器先卸载再安装会让桌面数据目录的清理路径变复杂，且上游 Tauri 模板默认把"先卸载"设为默认项。
- Consequences: `model_options` 只是缓存的上游模型清单，缺失时仍可手填模型名，不影响生图；`/api/models` 与既有 `/api/diagnostics` 一样会按客户端给的 base_url 出站请求，保持由 origin 校验保护。自定义 NSIS 模板在升级 Tauri CLI 后必须重新抽取值并重打补丁；`nsis/SimpChinese.nsh` 必须定义模板引用的全部 27 个 LangString 键，否则 makensis 直接失败；该 `.nsh` 不能自带 BOM（Tauri 打包时会自己写一个，双 BOM 会让 makensis 在第 1 行报 `Invalid command: ";"`）。
- Decision（用户验收反馈后调整）: 模型列表在弹层里竖排一行一个（模型 id 很长，两列会截断成 `...sunbur`）；「读取模型列表」在配置弹窗里贴到输入框右侧同一行、在主界面弹层里放到标题行右侧，不再作为列表下方的独立动作行；「已读取 N 个模型，保存配置后一并写入」只在配置弹窗显示（它讲的是保存要求），主界面弹层只在失败时提示、成功走顶部 toast；内置预设 `gpt-image-2` 只在该配置从未读取过列表时作为起点出现，一旦有真实清单就不再出现；工具条「生图模型」图标先试 `Cpu`，用户验收反馈"不够简约也不够贴合生图"后改为 `WandSparkles`（魔杖+星火，一眼是"生成"且比芯片图形简单；`Image` 会和相邻「参考图」的 `ImagePlus` 撞脸，`Sparkles` 已被空状态/助手头像/从上下文生成复用）。
- Reason: 用户验收时反馈"读取到两个模型为什么还有这个原本的 img2"（内置预设混进真实清单）、"这里应该是竖状显示比较好，读取放右边"、"这个位置就不需要已读取 xxx 了"、"图标不符合主题"。
- Decision: 桌面端新增整界面缩放（`Ctrl` + `+`/`-`/`0` 与 `Ctrl` + 滚轮），实现走 WebView2 原生 zoom（`getCurrentWebview().setZoom`），为此在 `capabilities/default.json` 里加 `core:webview:allow-set-webview-zoom`；范围钳制在 80%–160%（`src/uiZoom.ts` 的阶梯 0.8/0.9/1/1.1/1.25/1.4/1.6），级别存 localStorage 并在启动时重新应用，成功后用现有 toast 反馈；网页端不接管这些按键，浏览器原生缩放即可。
- Reason: 用户要求"整个界面像网页那样 Ctrl +/- 缩放"；只有原生 zoom 才能让 `vh`、固定定位元素和滚动条一起缩放（CSS `zoom` 作用在根元素上会让 `100vh` 溢出），而固定范围能避免这个固定宽度侧栏/工具条的界面在极端缩放下散架。
- Consequences: 缩放命令需要 ACL 权限，缺失时 `applyUiZoom()` 会回退到根元素 CSS `zoom`；缩放级别写在 webview 的 localStorage 里，因此开发实例（5175 端口）与正式安装版（`tauri.localhost`）各自记住自己的值。
- Decision（用户验收反馈后调整）: 桌面端隐藏「打开」（`target="_blank"` 新标签打开）动作，两处都改为只在网页端渲染——大图预览工具条上的图标按钮和图片「更多」菜单里的菜单项；桌面端该工具条保留编辑遮罩 / 用作参考图 / 下载 / 存为…（原生保存对话框）/ 关闭。同时把预览窗从「1100×900 的卡片」放大为「几乎铺满窗口」（`width: min(1760px, calc(100vw - 24px))`、`height: min(1100px, calc(100vh - 24px))`），不再新增任何按钮：工具条仍在右上、缩放按钮与百分比仍浮在舞台右下，点聊天里的图片即可打开、双击切换缩放。
- Reason: 用户验收时指着大图预览工具条说"这个打开按钮在桌面端没有了用处"，随后补充"我希望有用……也可以不是按那个按钮去放大，因为右上按钮太多了，反正我希望的是有一个大窗预览的效果"；桌面 shell 里对本地地址开新标签既打不开系统看图程序，也没有可用浏览器上下文，真正的诉求是预览要够大。
- Decision: 遮罩编辑器窗口与大图预览统一尺寸（同样 `min(1760px, 100vw-24px) × min(1100px, 100vh-24px)`），不再保留自成一档的 `1240×920`；窄屏下仍走既有的全窗规则。
- Reason: 用户指出"编辑遮罩窗口没有相应放大"——前一次只改了预览卡片，遮罩编辑器有自己的尺寸上限。
- Decision: 聊天模型可停用并按档案记忆：`gpt-image-2-form` 新增 `chat_enabled`（"1"/"0"，缺省视为启用）与 `chat_model_options`（与 `model_options` 复用同一个规范化器）。停用后工具栏整块模式切换替换为静态的「生成」标签并强制回到生成模式；聊天模型字段保留可编辑（便于先配好再启用）。`chat_enabled` 与 `chat_model_options` 都进 `PROFILE_SCOPED_FORM_KEYS`，切换配置不串味。
- Reason: 用户的渠道对 `chat_model` 返回 403（`This token has no access to model`），聊天入口成了点了必然失败的入口；用户要求"聊天模型可以设置不启用以及获取模型，并且不启用时不会在对话框中显示聊天入口"。
- Consequences: 开关字段的规范化器对"未设置"必须返回空字符串而不是默认值——`normalize_config_form` 丢弃空值，而 `build_config_profiles` 把"顶层表单非空"当作覆盖当前档案的依据；一个永远返回 "1" 的开关会让空表单看起来有数据，从而在保存时清空档案字段（已由既有测试逮到，并补了回归测试）。后端未硬拦截聊天请求：入口隐藏后只有老页面/手工调用可能触发，服务端拦截会改变 `/classic` 的行为，留待 1.1.3 决定。
- Decision: 配置可直接导出/导入（`src/configTransfer.ts` + 抽屉底部两个按钮）：导出的 JSON 带 `kind: nm-image-studio-config`、版本、导出时间、两个引擎的全部档案与表单字段，**但不含任何 API Key**（`api_key` 一律剥离）；导入为**非破坏性合并**——同 id 或同地址（忽略大小写与末尾斜杠）的档案就地更新、其余追加、本机已有的 Key 始终保留，导入文件里的 Key 被忽略，导入后自动经 `/api/config/local-file` 落盘并回报"新增/更新/待补 Key"数量。
- Reason: 用户要求"这个配置可以直接导入和导出，除了 key 以外的全包含"；分享中转站配置时不应连带泄露密钥。
- Decision: 配置抽屉里新增引擎分页（`.drawer-engine-tabs`，复用工作区的 `mode-tabs` 样式，标签为 `GPT Image` / `Banana Gemini`），抽屉内切引擎只切换视图（`selectEngineInDrawer`），不再弹"请先补全配置"的提示——人已经在抽屉里了。
- Reason: 用户拿着抽屉截图说"配置页上直接也有 gpt 和 gemini 的分页吧，方便管理"；此前引擎切换只存在于工作区顶栏，管理另一套配置要退出抽屉。
- Decision: 共用凭据时**配置名称也一并同步**：共用状态下的两个活动档案共用一个名字，改名会同时改另一边（`updateActiveProfileName` 在 `isSharedCredential` 为真时一并更新另一引擎的活动档案），勾选共用的瞬间也会统一名称，规则是"手写名优先于自动生成名（默认配置 / Default / 新配置 N / New profile N），两边都是自动名时以当前所在的一侧为准"（`sharedProfileName` / `isGeneratedProfileName`）。
- Reason: 用户指出"共用后，配置名称也应该同步一下呀"——同一套连接在 GPT 页叫 SillyDream、在 Gemini 页叫默认配置，管理时会分不清是不是同一个渠道。
- Decision: 模型清单按引擎家族过滤，并且把"当前模型不在已读取列表里"这件事显式标出：读取与显示两处都过滤（`filterImageModelsForEngine`，`gemini / nano-banana / imagen` 归 Gemini，其余归 GPT Image，全部不匹配时原样返回以免出现空清单）；作曲家切换器仍然显示当前配置的模型，但不在已读取集合中的条目用虚线边框标记并给出说明（`activeModelUnlisted`）。
- Reason: 用户先指出"gpt 这里还是能读取到 gemini 模型""gemini 页没有选择生图模型的地方"，随后指着一个未被读取到的 `gemini-3-pro-image-preview` 问"这个在获取模型列表里没有，为什么会显示"——它是应用自带的默认模型名，出现在列表里会让人误以为该渠道真的提供它。
- Decision: 配置抽屉的引擎分页与工作区引擎**解耦**：抽屉用本地 `drawerEngineState`（仅在打开抽屉时从 `activeEngine` 同步一次），改名/新增档案/测试连接都显式带引擎参数；工作区的引擎切换、作曲家、`active_engine` 仍用 `activeEngine`。
- Reason: 用户明确要求「配置切换分页时不要切换外面整体的分页」——在抽屉里翻看另一套配置不应该改变当前要用来生图的引擎。
- Decision: 抽屉顶部只留一行——「多配置管理」标题与引擎分页同一行（`.connection-drawer-head`），删除 `config.drawerHint` 提示行；导入拖拽提示缩短为一行小字放在标题下方。
- Reason: 用户指出"这个分页太丑了，上方的文字太多了"，并点名要去掉"配置 Profile + API 请求地址 + Key + 模型"那一行。
- Decision: 导出文件名带上当前档案名：`nm-image-studio-config-<档案名>-<版本>-<日期>.json`（档案名里的 `\/:*?"<>|` 与空白转 `-`，去首尾符号，截断 40 字符；档案名为空则省略该段）。
- Reason: 用户要求"导出配置的文件名应该带有配置名"，这样一堆导出文件不用逐个打开就能分辨是哪套配置。
- Decision: 「启用聊天」**默认关闭**，判定统一成 `chatSwitchOn = gptForm.chat_enabled === "1"`（`""` = 关，`"1"` = 开）：`defaultGptForm.chat_enabled` 由 `"1"` 改为 `"0"`，`coerceSwitchFlag(value, "0")`，作曲家是否显示「聊天」入口、抽屉里开关是否勾选、以及依赖聊天字段是否展开，全部用同一个 `chatSwitchOn`。
- Reason: 用户要求"默认不启用聊天"。原实现写的是 `gptForm.chat_enabled !== "0"`，而后端 `encode_switch_flag` 产生的"关"是空字符串，导致从没配置过的档案被判成"开"，新装的默认值也是 `"1"`。
- Decision: 配置抽屉里的开关改成贴合内容的胶囊（`.connection-fields .toggle { width: fit-content; justify-self: start; height: auto; min-height: 42px; }`），`.chat-config-section` 只作为分隔线（`border-top`，去掉 12px 内边距），并且只在聊天开启、真正出现聊天字段时才渲染。
- Reason: 用户反馈这两个开关"感觉不居中且高度有点异常"。实测各行都是 42px，与输入框一致，问题在通栏盒子里的内容左对齐留下大片空白，以及开关上方额外的分隔线 + 内边距。
- Decision: 打开共用时**不覆盖**对方引擎的既有配置：先在对方引擎里找"明显属于这一对"的档案（`findSharedPartner`：该引擎当前选中的档案本身已是共用，或名字与这边相同），找到就并入（补上 Key/地址，不会动它的模型），找不到就**新建一个档案**（同名、携带共享的 Key 与地址、模型沿用该引擎当前值，并设为该引擎的活动档案），原有档案一律保留；关闭共用只解除这一对（`unlinkOtherActive`），另一对共用关系不受影响。
- Reason: 用户反馈"我新建一个配置再同步到 gemini，它会覆盖原本的，我觉得应该是同步创建一个新配置啊"——共用是"同一套连接"，不是"改写对方正在用的那份配置"。
- Decision: 跨引擎共用凭据（配置层共用）：两个表单各新增 `credential_ref`（值为 `"shared"` 表示与另一引擎共用连接配置，空表示各自独立；旧文件里写成来源引擎名的值一并折成 `"shared"`），抽屉里 API Key 下方新增「与 <另一引擎> 共用同一套连接配置」开关。**共用的是凭据层——API Key 与请求地址**，两边始终一致：在任意一边修改都会立刻镜像到另一边，切换配置档案时地址也跟着走（`mirroredCredentialPatch()` / `sharedCredentialPatch()`，勾选时会从有真实值的一侧拉取，占位地址（`example.com`）永远不会覆盖真实地址，也不会把值清空）。**模型不共用**：GPT 侧只认生图模型与聊天模型，Gemini 侧只认 Gemini 模型名。
- Reason: 用户问"有的 key 可以同时用 gpt 和 gemini，有办法互相公用配置吗"，随后明确了设计意图——"应该为配置层的共用，但模型是 gpt 只识别 gpt，gemini 只识别 gemini"。第一版实现把开关做成"单向跟随另一个引擎的 Key"且把 Key 输入框设为只读，用户随即反馈"为什么 key 那里无法编辑了""勾了共用，为什么切到 gemini 页还是没有配置"：方向反了（在 GPT 侧勾选却以空 Key 的 Gemini 侧为来源），而且只读输入框不符合"共用"的心智模型。
- Consequences: 共用的值会以实体形式写进两侧表单，因此配置文件对老页面/网页版等其它客户端仍然是完整的；导入导出时 `credential_ref` 随表单走，换机器后填一次 Key 两边都通。共用地址意味着 Gemini 侧不再单独维护路径——若某渠道的 Gemini 路径与 OpenAI 路径不同，需要关掉共用；这一点已记入 1.1.3 候选（把凭据抽成可命名条目，并允许为两套接口分别记录路径）。

## 2026-08-29 - v1.1.1 发布边界
- Status: active
- Decision: 发布 v1.1.1 的网页包、普通安装器、离线 WebView2 安装器和便携包，并同步两处 G: 分发目录；不上传旧版 updater 或伪造新的 updater 签名 feed。
- Reason: 本次环境没有可用的 Tauri updater 私钥，使用旧版签名二进制会造成版本/签名语义错误；手动安装包仍可完整交付桌面和网页功能。
- Consequences: 已安装的 v1.1.0 客户端暂不能通过内置检查更新自动跳到 v1.1.1，需要手动安装 v1.1.1。恢复同一签名私钥后，应单独生成并发布新的 updater/feed，再验证升级流程。

## 2026-08-28 - v1.1.1 候选版本边界
- Status: active
- Decision: 将当前桌面可用性修复分支的候选版本统一提升为 `1.1.1`，同步 VERSION、Tauri/Cargo 元数据、版本化烟测默认值和发布断言；先生成并验证本地产物，暂不复用 `v1.1.0` 标签或执行 GitHub/G 盘发布。
- Reason: `v1.1.0` 已是正式发布版本，继续使用相同版本号会让安装器、更新器和缓存版本判断产生歧义。
- Consequences: `1.1.1` 的本地包可供人工验收；正式发布仍需用户明确授权，并应在发布前完成桌面人工验收及可行的升级/签名检查。

## 2026-08-27 - 发布包构建顺序
- Status: active
- Decision: 所有会触发 Vite 构建的桌面安装器构建完成后，最后再生成网页 ZIP；预检以最终 `static/studio/index.html` 引用的哈希资源为准。
- Reason: Tauri 安装器构建会重新生成 Studio 静态资源哈希。网页包若在安装器之前生成，可能保留上一轮 `index-*.js`，从而被发布预检拒绝。
- Consequences: 发布流程必须按“桌面构建/安装器 → 网页包 → release preflight → G 盘同步”执行；不能把网页包生成放在桌面构建之前。

## 2026-08-27 - 多种图片保存动作
- Status: active
- Decision: 桌面端将“下载”作为结果图片的主操作，执行快速保存到系统 Downloads；“另存为…”使用原生保存对话框；下载成功后的提示提供独立的“打开文件夹”操作。现有“打开存图夹”继续指向原始输出目录，不与下载副本混淆。网页端沿用浏览器下载能力，另存为不承诺自定义原生对话框。
- Reason: 快速下载、指定位置保存和查看源文件是三种不同意图；明确区分目录和结果，能减少用户找不到文件或误以为移动了原图的问题。将次要动作收进更多菜单可保持图片预览区紧凑。
- Consequences: 需要新增桌面原生 Save File 命令、下载副本路径反馈和文件夹跳转；应覆盖重复文件名、取消保存、不可写目录、旧历史图片与网页/桌面共存。文件夹跳转只在下载成功后的 toast 出现，避免用户在尚未下载时误以为存在对应副本。

## 2026-08-27 - Modern Explorer-Style Folder Picker
- Status: active
- Decision: Use the Windows Vista+ `IFileDialog` with `FOS_PICKFOLDERS` for desktop directory selection, with a localized title and `选择此文件夹` confirmation label, instead of the legacy WinForms `FolderBrowserDialog` tree.
- Reason: The legacy picker opened as a small tree-only window that made browsing large or external directory trees difficult. The modern system dialog keeps native Windows behavior while providing Explorer navigation, address-bar access and a resizable window.
- Consequences: The Windows desktop build now links the cached `windows` crate for COM/Shell APIs. Web mode and non-Windows builds keep their existing boundaries; manual Windows acceptance should confirm cancel, drive navigation, network locations and folder creation.

## 2026-08-26 - Sanitize Folder Picker Output
- Status: active
- Decision: Treat the Windows folder dialog stdout as untrusted text and select the longest existing directory prefix when diagnostics are appended without a newline. Keep direct existing paths and cancel behavior unchanged.
- Reason: The user's environment returned repeated `SharedMemory read faild` text concatenated directly to a valid selected path, which made `canonicalize` reject an otherwise valid migration directory.
- Consequences: The desktop EXE must be rebuilt for the guard to take effect; the sanitizer is covered by a Rust unit test and prevents this host-specific output issue from reaching migration/storage path handling.

## 2026-08-26 - Skippable First-Launch Preference Wizard
- Status: active
- Decision: Show a three-step desktop-only onboarding dialog only when the new data root has no existing desktop configuration/output data and no completion marker. Let users choose language, output location, notifications, and close behavior, with an explicit skip action. Persist completion in `desktop-onboarding.json`; existing users and upgrades remain uninterrupted.
- Reason: New users should not need to discover storage and behavior settings after launch, while showing a wizard to existing users could feel like an upgrade regression.
- Alternatives considered: Always show the settings dialog; infer all preferences from Windows; add a separate installer wizard. Always showing interrupts upgrades, inference is not explicit enough for storage, and installer choices do not cover portable launches.
- Consequences: The first-run flow needs one manual acceptance in a fresh portable or clean data root. Changing output location still uses the existing copy-and-hot-switch path and remains blocked while generation jobs are active.

## 2026-08-26 - Hot-Switch Desktop Output Root
- Status: active
- Decision: Keep the existing safe copy-and-backup operation, then update both the Tauri runtime path and the running FastAPI output-root globals through a desktop-only authenticated endpoint. The desktop window stays open and new generations, history, session references, output URLs, and open-folder actions use the new directory immediately.
- Reason: Requiring a full desktop restart after a directory change is unnecessarily disruptive, while the current queue guard already prevents switching during active generation jobs.
- Alternatives considered: Keep restart-required behavior; restart only the sidecar; merge directories in place. Restarting leaves stale UI state, and in-place merge makes conflict and rollback behavior less clear.
- Consequences: A real desktop smoke test must confirm a post-switch generation and history/reference read. Web mode remains environment-driven and has no storage-root switch route.

## 2026-08-26 - Native Desktop Notifications And Tray Close Behavior
- Status: active
- Decision: Keep web mode unchanged. In the Windows Tauri shell, send generation success/failure notifications only when the window is not focused, expose a user-controlled notification toggle, add a tray menu for open/tasks/outputs/update/quit, and intercept the window close button with ask/minimize-to-tray/exit choices. Store these preferences in browser-local desktop settings because they are per-user shell preferences rather than backend data.
- Reason: The desktop app needs background-friendly behavior without duplicating alerts while the user is looking at the result, and closing during queued work must be explicit.
- Alternatives considered: Always notify; put tray actions in the main UI; silently cancel work on close; force tray-only close behavior. These either create noise, hide native actions, or risk losing active work without a decision.
- Consequences / follow-up: Manual Windows acceptance is still required for notification permission, tray icon rendering, menu click-through, and close behavior. No release or G: synchronization is authorized until that pass is complete.

## 2026-08-26 - Taskbar Attention For Background Results
- Status: active
- Decision: When a background generation completes or fails, request Windows informational user attention so the taskbar button flashes until the user focuses the app. Clear the attention request on the main window focus event. Keep the notification title prefixed with `NM Image Studio` so the content is unambiguous even when an uninstalled test executable is attributed by Windows to PowerShell.
- Reason: A minimized desktop app needs a visible completion cue without forcing a second modal or changing the web client.
- Alternatives considered: Permanently change the window title, use a custom in-app badge only, or use the critical attention mode that also flashes the window. These are either ineffective for a minimized app or more disruptive than needed.
- Consequences / follow-up: Direct uninstalled EXE notification attribution remains a Windows AppUserModel identity limitation; packaged installed builds must be checked separately.

## 2026-08-26 - Taskbar Attention Is Independent Of Toast Permission
- Status: active
- Decision: Keep taskbar attention flashing enabled for background results even when the user disables Windows toast notifications. The notification toggle controls only the OS toast, not the taskbar completion cue.
- Reason: A user may want a quiet system notification area while still needing a visible signal that a minimized generation finished.
- Consequences / follow-up: Focus still clears the attention request; no new setting is needed for the taskbar cue in this slice.

## 2026-08-26 - Notification Delivery Must Not Depend On Taskbar Attention
- Status: active
- Decision: Treat taskbar attention and Windows toast as independent best-effort operations. A failure from `requestUserAttention` must never prevent permission checking or toast delivery. Add a visible test-notification action in desktop settings for diagnosis.
- Reason: The initial combined error boundary caused a regression where no toast appeared when the taskbar API or capability was unavailable.
- Consequences / follow-up: The desktop capability now explicitly grants `core:window:allow-request-user-attention`; the final installed release still needs manual verification after rebuilding with the running test instance closed.
- 2026-08-25 — Status: active: Desktop storage migration replaces the current output root only after scanning a user-selected old directory, and first renames the current target to a timestamped `.backup-*` sibling. It accepts a direct `outputs` folder, a web project root containing `outputs`, or a portable desktop root containing `data\outputs`.
- Reason: Users need a practical web-to-desktop recovery path, but silent merges can duplicate sessions and overwrites are difficult to undo. A scan preview plus an automatic backup makes the operation understandable and recoverable without scanning the whole disk.
- Consequences / follow-up: The current release does not merge conflicting records at the JSON identity level; it replaces the current output root after confirmation. A future migration wizard can add selective conflict policies if needed.
- 2026-08-25 — Status: active: Desktop output storage is configurable through a persisted absolute `desktop-storage.json` setting. The backend receives `IMAGE_TOOL_OUTPUTS_ROOT`, while configuration, logs and window state remain under the desktop data root. The setting takes effect after a restart, and the UI offers `文档\\NM Image Studio` as a shortcut.
- Reason: Generated images and their history/session metadata should be movable to a user-visible location without moving the application runtime or API configuration. Keeping the sidecar data root separate preserves installed/portable lifecycle behavior and web/desktop coexistence.
- Consequences / follow-up: Portable users who move the whole ZIP should keep the default package-local `data\\outputs`; an external absolute output path is not bundled into a copied ZIP and must be moved separately.
- 2026-08-25 — Status: active: Keep canonical ASCII release asset names for updater/feed compatibility, while publishing a separate Chinese-named desktop distribution layer on G: with the portable ZIP already extracted and a one-click launcher.
- Reason: The updater feed and signed URLs are machine-facing; renaming those assets in place would add unnecessary Unicode URL and signature compatibility risk. Users primarily need clear install choices and a directly runnable local folder.
- Consequences / follow-up: The G: desktop folder exposes `安装版`, `离线安装版`, `便携版` and `说明-如何选择版本.txt`; the updater is not presented as a manual launch target.
- 2026-08-25 — Status: active: Publish v1.1.0 from `main` with separate web, normal installer, offline WebView2 installer, portable desktop, updater and feed assets; synchronize the clean web package and a `NM Image Studio Desktop` asset folder to both approved G: roots.
- Reason: The user explicitly authorized the formal release and requested both distribution locations. Keeping web and desktop assets in separate directories preserves coexistence and the established web package layout.
- Consequences / follow-up: GitHub Release is live at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.0`; a real 1.1.0 → 1.1.1 upgrade and Authenticode verification remain v1.1.1 follow-ups.
- 2026-08-21 — Status: active: Treat the v1.1.0 desktop candidate as internally verified but not publicly releasable until clean-staging metadata, a real 1.1.0 → 1.1.1 upgrade, and (for ordinary Windows distribution) Authenticode signing are closed. The complete evidence lives in `docs/NM-Image-Studio-v1.1.0-pre-release-audit.md`.
- Reason: Local smoke proves the application and package contents work on this Windows 11 x64 machine, but it cannot prove SmartScreen trust, no-WebView2 behavior, another-machine permissions, or a real Release upgrade. Separating “internal candidate” from “public release” prevents overstating those guarantees.
- Consequences / follow-up: Keep all artifacts local, do not push/tag/release/sync G:, and require a fresh clean staging rebuild after the updater metadata-order fix. Legacy web preflight path differences and old alpha files must be resolved or explicitly excluded before upload.
- 2026-08-21 — Status: active: The first updater implementation is locally complete but remains unpublished. Tauri 2.9's actual signed NSIS updater artifact is `*-setup.exe` plus `*.sig`, so the packaging script copies that signed executable to the updater feed rather than assuming a `*.nsis.zip` file.
- Reason: The build output is the authoritative contract for this pinned Tauri version; rejecting the actual artifact shape would block valid signed updates. The feed still keeps separate Setup and Updater filenames for release clarity, while both are byte-identical copies of the signed Setup artifact.
- Consequences / follow-up: Feed smoke has verified no-BOM JSON, signature presence, URL/version alignment and SHA256. A real GitHub/test Release is still required to exercise client-side update discovery and installation from an older build. No publication, merge, tag or G: sync is authorized.
- 2026-08-21 — Status: active: Implement desktop updating as two mode-specific actions backed by one release version. Installed desktop builds use the official Tauri 2 updater with mandatory signed NSIS artifacts; portable builds check the same stable version but download a full signed ZIP and instruct the user to preserve `data\`, without runtime self-replacement. Web packages remain entirely outside the desktop updater boundary. The detailed design is `docs/NM-Image-Studio-desktop-updater-plan.md`.
- Reason: Tauri already provides a secure Windows installer update path, while a running portable EXE and its FastAPI sidecar cannot safely replace their own folder without an external helper. Keeping web, installed and portable modes separate preserves the already verified port and data isolation.
- Consequences / follow-up: The first implementation uses GitHub Releases stable only, adds opt-out 24-hour checks and a manual About-page action, blocks install while queue jobs are active, and requires updater signatures. UNC/custom channels and true automatic rollback are later phases. A first updater-enabled release can only update subsequent releases; any already-published client without updater support needs one manual bridge install.
- 2026-08-21 — Status: active: Desktop-global shortcuts are user-configurable and persisted in browser storage scoped to the Studio frontend. The six actions are new session, add reference, open outputs, toggle sidebar, open settings, and open shortcut help. Each binding requires Ctrl, Alt, or Meta, duplicate bindings are rejected, individual bindings can be cleared, and all bindings can be restored to defaults. Enter and Shift+Enter remain fixed composer semantics.
- Reason: Different users have different keyboard habits, and some users want global shortcuts disabled entirely. Requiring a modifier avoids hijacking ordinary prompt typing while keeping capture predictable.
- Consequences / follow-up: The web runtime keeps its existing keyboard behavior. A future settings migration can version the local shortcut map through `desktop-shortcuts-v1`.
- 2026-08-21 — Status: superseded: Add update checking to the desktop roadmap as a signed, user-visible flow: manual check, release notes, download progress, signature verification, install/restart, failure rollback, and a portable-package policy. The current About page labels this capability `规划中` and does not expose a fake check button.
- Reason: An updater must be trustworthy for both installed and portable desktop variants. A superficial version label or unsigned replacement would create more risk than value.
- Consequences / follow-up: Before implementation, choose the release manifest/source, signing key handling, package channel policy, in-use/queued-job behavior, and rollback strategy. Web mode remains outside the updater boundary.
- 2026-08-21 — Status: active: Desktop settings are an in-app modal dialog rather than a full-window route or separate native OS window. The dialog keeps the existing four-section layout, uses a backdrop, closes on backdrop click or `Esc`, and restores focus to the gear trigger. On narrow windows it expands to nearly the full viewport.
- Reason: Settings are temporary maintenance work, and returning to the workbench should be one click or one key away. A modal preserves the complete storage/debug/shortcut content without adding another taskbar window or lifecycle boundary.
- Consequences / follow-up: Do not add unsaved-change dismissal yet because current settings actions are immediate and there is no draft form state in this surface. If future settings become editable drafts, add a dirty-state confirmation before allowing backdrop dismissal.
- 2026-08-21 — Status: active: Desktop settings use one compact gear-only action placed immediately after the 中/EN language switcher. It keeps the `Ctrl+,` shortcut and the original overflow entry as fallback.
- Reason: The previous labeled button consumed too much header attention for a utility action. The icon is discoverable through its tooltip and keyboard shortcut while preserving a clean control cluster.
- Consequences / follow-up: The action opens the same full-window settings surface at the `general` section. Backend debug-console access remains inside `存储与日志`.
- 2026-08-21 — Status: active: Reuse the web Studio's established black-and-white triangle mark for the desktop app icon instead of inventing a new window/star symbol. Generate the Windows icon resources from that SVG and keep Tauri's normal bundle icon configuration.
- Reason: The existing mark already has product recognition and remains visually distinct at taskbar scale; the previous icon collapsed into an eye-like shape and was rejected by the user.
- Consequences / follow-up: Do not add runtime PNG decoding dependencies merely to set the icon again. The release EXE and installer should consume the generated Tauri icon resources, while the source remains the single SVG of record.
- 2026-08-19 — Status: active: v1.1.0 ships four separate local artifacts: normal NSIS Setup with WebView2 download bootstrapper, offline-WebView2 NSIS Setup with the official standalone installer embedded, portable desktop ZIP, and the existing web portable ZIP. The web package remains a Python/browser launcher with default port 7861; the desktop package uses a Tauri shell, random sidecar port, and its own installed or package-local data root.
- Reason: The user explicitly requires all package forms and web/desktop coexistence. Keeping web and desktop artifacts separate avoids port, data, updater, and launcher collisions while preserving the existing web workflow.
- Alternatives considered: A single hybrid launcher, making desktop reuse the web package's `outputs\`, or forcing both modes onto port 7861. Those choices would create data races, confuse lifecycle ownership, or break existing web users.
- Consequences / follow-up: A dedicated coexistence smoke starts the web ZIP on a temporary fixed port and the desktop ZIP on its random port, confirms both stay healthy, and verifies separate web `outputs\` and desktop `data\` roots. Publishing remains a separate authorization gate.
- 2026-08-19 — Status: active: The release source of truth is now 1.1.0 across `VERSION`, Tauri config, Cargo package, web package, manifests, and cache-busting tests. Installer scripts use Tauri's native NSIS WebView2 modes rather than a custom bootstrapper.
- Reason: Native Tauri bundler support correctly handles online bootstrapper versus embedded offline installer and keeps the installer behavior aligned with the shell runtime prerequisite check.
- Consequences / follow-up: Normal Setup is approximately 25 MB; offline-WebView2 Setup is approximately 241 MB. No code signing certificate is configured, so SmartScreen/AuthentiCode trust remains a later release task.
- 2026-08-18 — Status: active: The first distributable desktop artifact is a portable ZIP, not a single runtime EXE. `package_desktop_portable.ps1` stages the release shell plus the complete PyInstaller `onedir` backend, adds `portable.mode`, writes a portable README, and emits a manifest and SHA256 sidecars. The package-local `data\` directory is selected only when the marker sits beside the EXE; installed builds continue using Tauri's per-user app-local data directory.
- Reason: The runtime has hundreds of backend files and must remain diagnosable and updateable. A marker-based data root makes the ZIP genuinely movable without changing web mode or the installed layout.
- Alternatives considered: PyInstaller `onefile`, a ZIP containing only the shell, or always using `%LOCALAPPDATA%`. These either reintroduce the previously rejected extraction/lifecycle behavior, omit required runtime files, or make a portable copy unexpectedly write outside itself.
- Consequences / follow-up: Keep `data\` when upgrading a portable package. Installer configuration can later reuse the same release root but must not copy `data\`, local logs or secrets into a clean install package.
- 2026-08-18 — Status: active: Check for the WebView2 Evergreen Runtime before creating the Tauri window by querying the standard EdgeUpdate client registry locations. If no `pv` value is found, show a native Chinese error dialog with the official WebView2 installation URL and exit cleanly.
- Reason: Tauri otherwise fails before the workbench can explain a missing runtime, which appears to users as an unexplained white/blank launch.
- Alternatives considered: Bundle a fixed WebView2 runtime into every ZIP, rely on Tauri's generic startup failure, or show a web-based error page. The fixed runtime is hundreds of MiB, the generic failure is not actionable, and a web page cannot render when WebView2 is missing.
- Consequences / follow-up: The current package requires system Evergreen WebView2. A later offline bootstrap package may carry the standalone installer, but must be a separate explicitly named artifact.
- 2026-08-18 — Status: active: Desktop configuration API keys are protected with Windows DPAPI at rest. The backend keeps the existing JSON shape for the frontend, decrypts `dpapi:v1:` values only in memory, migrates plaintext desktop config files on first read, and writes encrypted `.bak` content without leaving a plaintext backup. Web mode remains unchanged for compatibility.
- Reason: The desktop sidecar owns a stable per-user data directory, so Windows user-scope DPAPI provides a native protection boundary without adding a service, password prompt, or third-party crypto dependency.
- Alternatives considered: Store a machine-wide secret, add a custom password vault, encrypt the whole config with a bundled key, or change the frontend/API contract to return only key handles. These either weaken portability/security, add user friction, create a recoverable embedded secret, or expand the change beyond the current desktop slice.
- Consequences / follow-up: Moving the data directory to another Windows user or computer requires entering the API Key again if DPAPI cannot decrypt it. A later installer/migration flow should explain that behavior and should never copy plaintext `.bak` files into a package.
- 2026-08-18 — Status: active: Expose backend diagnostics from the existing desktop EXE only through `桌面设置 → 存储与日志 → 打开调试窗口`. The Tauri command starts a separate PowerShell console that follows the fixed `desktop-backend.log`; it receives the path only from managed Rust state through a child-process environment variable, uses no frontend path argument, and joins the existing Job Object. The FastAPI sidecar runs with `PYTHONUNBUFFERED=1` so newly written requests appear without waiting for process exit.
- Reason: The user wanted to inspect the backend when needed without putting a console on the main workbench or restarting the current backend.
- Alternatives considered: Always show the backend console, restart the sidecar in debug mode, expose raw stdout through the web UI, or accept an arbitrary frontend log path. These either pollute normal use, change the runtime port/token, add lifecycle risk, or weaken the local path boundary.
- Consequences / follow-up: Closing the debug console does not stop the app or backend; closing the desktop shell closes Job Object children, including debug consoles. A future structured diagnostics panel can build on the same log boundary without changing the current user-facing entry point.
- 2026-08-17 — Status: active: Windows single-instance behavior uses a session-local named mutex rather than a Tauri plugin or fixed backend port. A duplicate process searches for the unique visible `NM Image Studio` title, restores and foregrounds that window, then exits before starting a second sidecar. This keeps the implementation local and avoids another plugin lifecycle.
- 2026-08-17 — Status: active: The desktop shell owns a Windows Job Object configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and assigns the FastAPI sidecar immediately after spawn. Normal exit still performs explicit child cleanup; forced termination relies on Windows closing the job handle. The raw job handle is stored as an integer handle value in Tauri state so the state remains `Send + Sync` without unsafe trait overrides.
- 2026-08-17 — Status: active: Release desktop builds use the Windows GUI subsystem, so opening the normal EXE never creates a shell console. The FastAPI sidecar still runs without a window and writes `desktop-backend.log`. Developers can explicitly set `NM_IMAGE_STUDIO_BACKEND_CONSOLE=1` to spawn the backend in a separate console for live diagnostics; this is not a normal-user setting.
- 2026-08-17 — Status: active: Remove `gpt-5.6` from the chat model menu because the configured gateway cannot test the alias successfully. New defaults use `gpt-5.6-sol`; frontend profile normalization and backend request normalization map legacy stored `gpt-5.6` values to Sol so old configurations remain usable.
- 2026-08-17 — Status: active: The first formal desktop UX slice keeps the existing Studio information architecture and adds native affordances around it: a full-window settings surface, header quick actions, keyboard shortcuts, allowlisted path opening, and remembered window geometry. Settings are not a blocking modal, and the web runtime keeps its existing card shell and browser behavior.
- 2026-08-17 — Status: active: Desktop path commands accept only fixed semantic kinds (`outputs`, `data`, `backend-log`) from the frontend. Rust resolves the paths from the desktop runtime context and opens them with Windows Explorer, preventing arbitrary path injection while keeping the common maintenance actions one click away.
- 2026-08-17 — Status: active: Window geometry is persisted as `desktop-window.json` with x/y/width/height/maximized. On restore, off-screen geometry is centered instead of blindly applied. Reset remains available from desktop settings; this is a local shell preference and does not alter Studio session data.
- 2026-08-17 — Status: active: The release gate's frontend test inventory is filesystem-discovered, but its regression test also tracks the expected count and explicitly injects newly added gate modules. Adding `desktopExperience.test.mjs` therefore requires updating that contract to 20 tests so new desktop behavior cannot silently fall outside the release gate.
- 2026-08-17 — Status: active: The Windows desktop direction is Tauri 2 with the existing React/Vite frontend and a FastAPI PyInstaller `onedir` backend. The verified spike rendered the real app, enforced a random loopback port plus per-run token, isolated data, and cleaned up shell/backend/port on normal exit. Electron, .NET, pywebview, Qt and smaller niche shells do not offer enough benefit to justify their extra runtime or rewrite cost for this codebase.
- 2026-08-17 — Status: active: Desktop distribution is not a true runtime single EXE. Ship one Setup EXE that installs an internal application directory, plus a portable ZIP containing the whole directory. The measured payload is about 8.14 MiB for the Tauri shell and 58 MiB / 708 files for the Python backend. PyInstaller `onefile` is rejected because the spike showed slow self-extraction and unreliable parent/child cleanup; `onedir` is the stable baseline.
- 2026-08-17 — Status: active: Default desktop packages should use the common WebView2 Evergreen Runtime and detect/report a missing runtime. Offer a separate full offline installer or fixed-runtime portable package only for closed-network machines; do not add hundreds of MiB to every normal download by default.
- 2026-08-17 — Status: active: The technical spike deliberately stops before Job Object crash cleanup, single-instance, tray, updater, DPAPI, migration, formal storage paths, installers and the full DPI/drag/clipboard/mask manual matrix. Those belong on a separate formal `codex/desktop-v1.1.0` branch after explicit authorization. The five current Node build-chain audit findings also require a controlled Vite major upgrade before release.
- 2026-07-27 — Status: active: v1.0.9 is the published baseline. `main` and annotated tag `v1.0.9` are pushed; the formal Chinese Release is live at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.0.9` with `NM_web_imagen-v1.0.9.zip`. Both approved G: roots contain the matching clean folder and versioned ZIP, verified against SHA256 `dbee126d89e9919a5310981af0f3f66f2d26b6839625f703997e3fca0955e9d7`.
- 2026-07-27 — Status: active: Release hardening raises the narrow-screen composer stacking context above the fixed header so size/generation popovers remain clickable, and excludes `.playwright-cli/` plus `output/playwright/` from source control. Package, preflight and sync validators also reject `.playwright-cli/` as defense in depth because browser accessibility snapshots may contain the current value of password fields such as local API keys.
- 2026-07-24 — Status: active: `复制参考图` must restore a turn's reusable mask whenever the original Alpha is available. Use the same page-local/persisted payload loader as masked regeneration, make the copied base reference 1, preserve current composer references behind the copied set, switch to GPT Image 2 generation mode, and expose the action as `复制参考图和遮罩 / Copy references and mask`. Respect the 16-image limit and report partial copies. Old records without a recoverable Alpha or base copy only usable images and explicitly require a redraw; never silently claim mask restoration. This changes only Studio reuse behavior and adds no backend route, schema or upstream request.
- 2026-07-24 — Status: active: Mask guidance must follow the control it explains instead of occupying a reference-file slot. Keep the reference strip file-only; expose persistent state through the bilingual applied-mask badge and its tooltip, use a mask-specific textarea placeholder, and show broad-prompt guidance as one unboxed line inside the textarea only when needed. Hide that line at widths up to 560px so the stacked prompt actions retain usable editing height. No modal, toast, extra confirmation or additional API call is introduced.
- 2026-07-24 — Status: active: The two manual prompts `选区部分换成另外一个物品` and `遮罩部分换成另外一个物品` did not previously trigger the narrow object-replacement expansion because the local pattern covered `另一个` but missed `另外一个`. The successful second image therefore cannot be attributed solely to the word `遮罩`. Extend the single-request matcher and frontend advisory classifier to cover `另外一个`, verify both scope words produce identical guidance, and preserve negation and non-object safeguards.
- 2026-07-23 — Status: active: The user authorized fast-forwarding the verified mask-prompt follow-up into local `main` so they can test the real effect. This authorization covers the local merge and restarting `14261` only; it does not authorize pushing, packaging, synchronizing either G: destination, tagging, or publishing a Release. Keep `codex/soft-mask-prompt-guidance` retained until manual acceptance.
- 2026-07-23 — Status: active: Mask intent handling must remain a single upstream image-edit request. Do not add a preliminary chat, Responses, vision, or other intent-parsing API call before `/v1/images/edits`; the user explicitly rejected the extra complexity, latency, cost, failure mode and gateway-compatibility burden. Keep the original user prompt, red-selection visual input, Alpha mask and narrowly strengthened model instruction in the same edit request. If a broad model-chosen replacement remains nondeterministic, explain the single-call limitation and recommend naming the replacement object instead of silently introducing a second request.
- 2026-07-23 — Status: active: Soft submission alone is insufficient for a model-chosen object replacement. When the prompt asks to `换一个物品/换个东西/改成另一个物品` or an equivalent English action without naming the new object, keep submission non-blocking but append a narrow replacement instruction: identify and completely remove the original selected object, choose a scene-appropriate object whose category and silhouette are visibly different, do not restore or merely redraw the original, and keep grasping/occlusion/light/contact natural. Do not apply this object-removal instruction to color, material, brightness or style edits. The 2026-07-23 windmill result proved the previous generic `合理、明显且自然的变化` fallback was too weak even though mask routing was correct.
- 2026-07-22 — Status: active: Mask prompt specificity is advisory, not a submission gate. When a valid mask is attached, any non-empty natural-language prompt is allowed without requiring the words `遮罩`, `涂红区域` or a locally recognized `换成` grammar. The Studio shows a compact neutral hint and mask-specific placeholder; broad wording explains that the model will choose unspecified details but never opens a toast/modal or requires confirmation. FastAPI blocks only real request errors and wraps broad prompts with a model-side contextual fallback. This follows OpenAI's documented select-area-plus-description workflow and avoids brittle duplicate natural-language parsers deciding whether a paid request is legitimate.
- 2026-07-21 — Status: active: v1.0.8 is the published baseline. `main` and annotated tag `v1.0.8` are pushed to `origin`; the formal Chinese Release is live at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.0.8` with `NM_web_imagen-v1.0.8.zip`. Both approved G: roots contain the matching clean folder and versioned ZIP. Future work should branch from this published state and rerun the release matrix before any new synchronization.
- 2026-07-21 — Status: active: The user explicitly authorized publishing v1.0.8 and synchronizing both `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具` and `G:\doc\Tools\网页生图站`. The clean release folder and versioned ZIP are synchronized to both roots only after the complete release matrix and destination preflights pass. GitHub publication uses `main`, an annotated `v1.0.8` tag and a formal Chinese Release with the verified ZIP attached. Automated browser acceptance remains unclaimed because enterprise loopback policy blocks it; the user accepted this residual risk for publication.
- 2026-07-21 — Status: active: Whole-session deletion requires a confirmation dialog that distinguishes conversation data from generated assets: deleting the session removes its conversation content, while generated images remain in persistent history and the saved-image area. This closes an irreversible-action discoverability gap without changing backend history/output deletion semantics. Commit: `33fce1c`.
- 2026-07-21 — Status: active: Expanding a multi-image result must move the newly revealed image grid into view after React layout settles. Use two animation frames, `scrollIntoView({ block: "start", inline: "nearest" })`, a small `scroll-margin-top`, and instant scrolling under reduced-motion preference. This fixes the case where expansion occurred above the current viewport and appeared to do nothing. Commit: `cd9fad9`.
- 2026-07-21 — Status: superseded: The user authorized local integration after the full v1.0.8 review. Fast-forward `codex/history-window-refactor-v1.0.8` into local `main` through `cd3b1bd`, then keep the screenshot-driven Advanced Parameters deduplication as the small follow-up commit `fd3c83b`. This authorization covered local merge and local service restart only; its publication restriction is superseded by the later explicit v1.0.8 Release and two-root synchronization authorization. Branch/worktree deletion remains outside scope.
- 2026-07-21 — Status: active: Common generation controls have one visible home. GPT size/custom size/quality/count and Banana count/aspect/resolution stay in the composer popovers and are removed from Advanced Parameters. Advanced Parameters keeps low-frequency controls such as seed, style, endpoint/format, Top-P, timeouts and compatibility toggles. The underlying form fields, localStorage persistence, submission payloads, history reuse and legacy `forms` config compatibility remain unchanged; this is information-architecture deduplication, not a schema or behavior removal.
- 2026-07-21 — Status: active: Before merging v1.0.8, update `VERSION`, the README cache-busting example and the exact release gate from 1.0.7 to 1.0.8. Leaving the old version would allow an already-running 1.0.7 backend to pass startup version reuse while new static assets are read from disk, silently losing additive backend behavior such as `maskFileSnapshot`. A version identity change is therefore a merge-safety requirement, not a release-only cosmetic bump.
- 2026-07-21 — Status: active: Persist the exact Alpha PNG separately from the red review composite. `maskSnapshot` remains the compact, user-visible review image; hidden `maskFileSnapshot` stores the lossless mask through the existing `/api/studio/sessions` reference normalization, capacity accounting, canonical URL adoption and `outputs/session_refs/` pruning path. Regenerate prefers the current-page runtime payload, otherwise reloads `maskFileSnapshot`, restores its saved encoding/coverage, binds it to the reloaded first base reference and explicitly submits that attachment. Old records without `maskFileSnapshot`, missing Alpha files and missing bases stop with a redraw message rather than silently generating without a mask. This is additive to the session schema and does not change `/api/history`, generated outputs or Classic.
- 2026-07-21 — Status: active: A per-turn delete removes only the selected conversation turn, its completed queue row, expanded UI state and runtime mask payload. Queued/running turns are blocked until canceled or complete, and deletion requires confirmation that generated images remain in persistent history and the outputs folder. The subsequent Studio session save prunes that turn's base, review and Alpha files only from `outputs/session_refs/`; it never deletes generated output images. Whole-session deletion remains the existing sidebar action and is not duplicated.
- 2026-07-21 — Status: superseded: Masked turn regeneration was initially page-local. The detached runtime payload and explicit attachment isolation remain the fast path, but the claim that refresh must always require a redraw is superseded by lossless `maskFileSnapshot` persistence. Only pre-feature records or missing/corrupt attachments now require redraw.
- 2026-07-21 — Status: active: Mask editor fit is derived from the actual stage, not `100vh` subtraction. Keep intrinsic canvas pixels unchanged, compute a base scale from `stage.clientWidth/clientHeight` with a 12px edge gap, render the stacked canvases at that fitted size, and keep user zoom as a separate 0.5–4 multiplier. `ResizeObserver` handles viewport and footer/toolbar reflow; `0`/适配 resets zoom and pan to the current full-image fit. Do not upscale images above native size.
- 2026-07-21 — Status: active: In the session-switch reference confirmation, Cancel is a pure dismissal rather than a session-switch resolution. Backdrop, top-right X and bottom Cancel must call the same `cancelPendingSessionSwitch` handler, leaving both the active session and reference files unchanged. `switchToSession` also closes defensively before any `keepActiveSession` early return so a future programmatic cancel cannot recreate the stuck modal. No backend, persistence or reference-lifetime behavior changes.
- 2026-07-21 — Status: active: Masking is a model-guidance workflow, not a local cut-and-paste guarantee. For every accepted mask request, keep model-side prompt hardening and disable `enhance_prompt`; construct the first upstream edit image by tinting the user's actual editable selection red at 58%, send the real Alpha mask alongside it, and prompt for a complete final image where red disappears and only an immediate boundary band may change for natural light/texture/mist/perspective continuity. Save the upstream output directly with `mask_guidance=visual-alpha`; never restore, clip, feather or paste result pixels locally. Keep the 8,294,400-pixel ceiling. This favors a truthful natural edit over false pixel-exact preservation, so small protected-area drift remains an explicit limitation. Commit: `8ff25c9`. Its former concrete-target validation clause is superseded by the 2026-07-22 soft-guidance decision; the visual-guidance, blending and no-local-composite parts remain active.
- 2026-07-21 — Status: superseded: Mask containment was temporarily enforced locally through `ccc6fdc`: require a concrete target, disable prompt enhancement, and composite the first base image back over every unpainted pixel before saving/history/response. The 14:07 real result proved that this exposes the hand-painted contour as a hard cut through hair, clothing, fog and lighting. The user rejected it as a fake modification; `8ff25c9` removes all result-stage compositing and supersedes the exact-preservation claim.
- 2026-07-21 — Status: superseded: Keep official transparent-selected Alpha as the default `标准` mask encoding, and expose `兼容网关` as an explicit per-mask reverse-Alpha diagnostic/workaround. The 10:48 real comparison also failed and changed the protected person about 2.3 times more than the painted background, so Alpha switching remains available only as diagnosis and no longer owns containment. `8ff25c9` adds the same visible red-selection meaning to either encoding while avoiding any claim of exact containment.
- 2026-07-20 — Status: superseded: Do not claim that the current mask editor guarantees edits inside the painted shape. The frontend's alpha direction and backend multipart forwarding match the official GPT Image contract, but the first reviewed real request through `ai-gateway.local` changed the protected character much more than the selected background. Official GPT Image 2 documentation states that masks are prompt-based guidance and may not follow exact shapes; `input_fidelity` is already fixed high for this model and cannot be tuned. Its proposed immediate prompt-hardening step is replaced by the 2026-07-21 two-encoding gateway diagnostic; its no-guarantee and possible post-composite boundaries remain valid.
- 2026-07-20 — Status: superseded: Persist only a lightweight mask-review composite and keep the editable full-resolution mask in memory. The compact `maskSnapshot` review thumbnail and its non-editable preview behavior remain active, but the no-full-mask rule is superseded by the user's explicit need for refresh-safe regeneration. The exact Alpha now lives in a separate hidden `maskFileSnapshot`; records created before that additive field still cannot be reconstructed.
- 2026-07-20 — Status: active: History detail state records its entry origin (`sidebar`, `quick`, or `browser`) and Escape follows visible-layer order. The foreground preview actively takes focus, its local handler stops propagation, and the background history handler independently checks for a visible preview before changing history state. Preview therefore closes before history changes; sidebar detail closes directly; quick-origin detail returns to the compact popover; browser-origin detail returns to the grid with scroll restoration. A history-backed preview may open its record through a visible `查看详情` action, and its toolbar order is `查看详情 / 编辑遮罩 / 作为参考图 / 下载 / 关闭`. The compact history's capture-phase scroll listener exempts events originating inside `.history-quick-popover`, while page scroll and viewport resize still dismiss it. Explicit Back still enters the full browser, and explicit Close still closes the entire history surface.
- 2026-07-20 — Status: active: Session cards keep a real button as the primary switch target, but its invisible hit surface extends through the surrounding card padding and the gap before delete. Title/metadata text uses `user-select: none` and `pointer-events: none` so slight movement cannot enter text-selection targeting; the delete button has a higher stacking level and remains independent. The current session uses `aria-current="page"`. This fixes intermittent swallowed clicks without turning the article wrapper into an inaccessible or nested-button click target.
- 2026-07-20 — Status: active: Narrow Studio headers use stable semantic ownership rather than leftover-width placement. Below 920px, the session title and language/more utilities occupy the first grid row, with engine and configuration on the second; below 560px, engine and configuration become full-width rows in the same order. Composer height is a browser/device preference, not session data: store the preferred 118–360px value locally, clamp only the rendered height to 44% of the current viewport, persist after pointer or keyboard adjustment, and clear the preference on reset. Because this resizes the entire bottom composer, the drag target belongs on its actual top boundary, not between toolbar and textarea. Persistent icon/text reset controls on that divider were manually rejected as visually unnatural; use double-click or `Home` with a hover hint instead. No backend or Classic behavior changes.
- 2026-07-20 — Status: active: Keep `gpt-image-2` as the image model and expose `gpt-5.6` as the new-chat-model default/preset, while preserving existing saved chat model values. Official docs define `gpt-5.6` as an alias currently routed to `gpt-5.6-sol`; the selector therefore also lists explicit `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` choices with short workload labels. Reasoning defaults to `auto`, which omits the parameter; `max` remains available. Do not auto-probe `/models` at startup because shared/relay endpoints do not consistently implement that route; explicit diagnostics remains the compatibility check.
- 2026-07-20 — Status: superseded: At tablet/narrow-desktop widths, use a two-column header grid with engine tabs and configuration on the first control row and language/more utilities aligned compactly to the right below it. At phone widths, engine spans the row and configuration shares the next row with utilities; below 380px, all three groups stack. User feedback at 589px showed that utilities still lacked stable ownership; `ac3926c` replaces this with title/utilities then engine/configuration rows.
- 2026-07-20 — Status: superseded: On narrow screens, the engine switcher is content-width and left-aligned while header actions remain full-width and wrappable. This removed the stretched capsule but left a large unused area beside the model switcher; `2d8a263` replaces it with the responsive grid above.
- 2026-07-20 — Status: active: The v1.0.8 implementation uses one `closed / quick / browser(detailId?)` history state. After manual feedback, the compact popover shows the latest 12 image-bearing records, and the persistent left history list mirrors batch structure with up to four thumbnail cells plus a total-count badge. The full window remains grid-only with four-cell batch collages, and history context replaces the grid inside the same modal. Existing history APIs, schemas, record-level favorites and delete semantics remain unchanged.
- 2026-07-20 — Status: active: The user authorized a local fast-forward of the verified `codex/studio-ui-polish-v1.0.7` branch into `main`, despite the still-pending manual browser gate. Do not package, sync G:, push, tag, publish or claim browser acceptance. After the merge, create `codex/history-window-refactor-v1.0.8` for the history-surface work.
- 2026-07-20 — Status: active: History refactor should reuse the existing `/api/history` entry/image schema. Treat the left-side `历史窗` trigger as one surface with compact recent-batch, full-browser and in-window-detail states; do not add a separate image-shelf persistence model or a per-image favorite migration in this slice.
- 2026-07-18 — Status: active: Product commit `16b960c` is the current manually-reviewable Studio candidate. Native page-image drag remains available, but `dragstart` is accepted only after an approximately 180ms pointer hold; fast movement is canceled before it can enter the global reference-file drop workflow. Browser-native movement threshold, desktop file drops, reference sorting and lightbox panning remain unchanged.
- 2026-07-18 — Status: superseded: Product commit `976595c` blocked native page-image dragging entirely. The user corrected that scope because deliberate drag-to-reference is useful; `16b960c` replaces the ban with a short hold guard while retaining all other result/history refinements.
- 2026-07-18 — Status: active: Favorites are fixed state controls at the history card or preview corner, not overflow-menu actions. Empty hearts remain neutral outlines and selected hearts use the existing ink/panel palette rather than red, reserving red for deletion and warnings. The history-browser heart is anchored inside the preview wrapper so list actions cannot overlap it.
- 2026-07-18 — Status: active: Single-result framing keeps `contain` and truthful aspect ratio. The visible 1px edge uses an inset outline instead of a box-model border so it does not create thin top/bottom bars. `cover` remains rejected because it would crop generated content.
- 2026-07-18 — Status: superseded: Implement all five approved UI critique groups on `codex/studio-ui-polish-v1.0.7` without changing backend or Studio architecture. The original no-merge boundary pending manual acceptance was superseded by the user's explicit local-merge authorization on 2026-07-20; browser acceptance is still not claimed.
- 2026-07-18 — Status: superseded: Product commit `4d22573` was the first locally verified UI implementation. It was replaced by `976595c` after screenshot-driven refinements to result density, action placement, history favorites/cards, metadata, menu behavior and accidental dragging. No package/G:/push/merge/release occurred for the superseded candidate.
- 2026-07-17 — Status: active: Result previews expose a visible `编辑遮罩` action. It may deliberately switch Banana/chat to GPT generation because mask submission is truthful only there, promotes the displayed image to reference position one, preserves remaining references up to the 16-image GPT limit, and invalidates an old mask unless the preview is already the exact current first `File`. Same-origin output fetches use a request token so closing or changing the preview cannot later open a stale mask editor.
- 2026-07-17 — Status: active: The mask brush footprint is drawn on a third, pointer-transparent Canvas that shares the base image dimensions and transform but is never included in mask export. A black/white ring plus center point stays readable over light or dark images and follows brush size, zoom and pan; move mode hides it. The former three-line guidance is condensed to one sentence, while the full shortcut list moves behind a compact hover/focus hint and remains on individual tool titles.
- 2026-07-17 — Status: active: Result preview dragging uses one Pointer Events path only. Any target inside a button, link or the lower-right zoom toolbar is excluded from pointer capture and double-click reset; the duplicate mouse listener was removed. The toolbar mirrors the mask editor with subtle hover/press/focus feedback and a live zoom percentage. Mask shortcuts are B/E/H for tools, `[ ]` for brush size, `- +` for zoom and `0` for fit.
- 2026-07-17 — Status: active: Mask status labels and the edit entry are shown only when the current surface is GPT Image 2 generation. The attachment must match both the exact in-memory first `File` object and its fingerprint; replacing it with a different file that happens to share name, size, timestamp and MIME still invalidates the old mask. This prevents Banana/chat from implying mask use and closes metadata-collision reuse.
- 2026-07-17 — Status: active: `b72a6f8` is the locally verified v1.0.7 product commit, not a release artifact. Automated loopback browser navigation is policy-blocked, so the user must manually accept `http://127.0.0.1:14260/` before packaging or any G: write. No paid upstream, package, push, merge, tag, PR or release is authorized by the local PASS matrix.
- 2026-07-17 — Status: active: v1.0.7 mask editing is implemented on `codex/mask-editor-v1.0.7`, based on the hardened v1.0.6 branch. The first reference is the edit base; native Canvas produces matching PNG base/mask files; the backend sends masks only to `/v1/images/edits`. Mask binaries stay in memory and queue snapshots for the first version, not localStorage or session JSON. No Pillow or large canvas library is added.
- 2026-07-17 — Status: active: The user no longer needs Classic in the current manual acceptance scope. Studio is the required browser gate. `/classic` is not yet deleted because the user asked about its status rather than explicitly authorizing removal; full removal would require coordinated route, static-file, package-manifest, test, and documentation changes.
- 2026-07-15 — Status: active: The current local candidate is SHA256 `d9ceb67249c4e3e9360b7cd8eb2fcfb32936213e6cfe3c1900a23e2c287a5b11`, with 52 files plus one directory entry, assets `index-B7h4N0fo.js` / `index-Gv_GDUKl.css`, and package smoke instance ID `e92ba34f914ee9b2d630`. It is locally verified but not final or synced because the available in-app browser is policy-blocked from loopback URLs. Do not use another browser surface to circumvent that policy; require a permitted/manual real-browser PASS before any G: write.
- 2026-07-15 — Status: active: Startup deletion markers are trusted only when the server revision advanced beyond the marker or the same-revision server marker snapshot exactly matches it. Older or divergent same-revision server state is treated as a reset/corruption signal and falls back to a loss-avoiding union. Studio requests above `STUDIO_MAX_SESSIONS` return 413 before compaction/reference work; the supported frontend already sends at most 80.
- 2026-07-15 — Status: active: Public URL surfaces now expose only lowercase hostname plus non-default port, with IPv6 brackets. Userinfo, path, every query parameter, and fragment are discarded rather than selectively redacted. Sanitized error text may retain `http(s)://host[:port]`; diagnostics/history/session metadata retain only `host[:port]`. Full URLs remain only in configuration and actual upstream requests.
- 2026-07-15 — Status: active: Studio startup stores a compact versioned server-baseline marker containing only revision, session ID/updatedAt pairs, and the server-confirmed active ID. Startup performs marker/local/server three-way reconciliation, falling back to an updatedAt union when the marker is absent or damaged. Save success adopts server `src`, MIME, size, and dimensions only when current and sent reference sources still match; canonical-only state updates receive one skip token, while concurrent local edits continue through normal saving.
- 2026-07-15 — Status: active: New Studio data URL references use deterministic `ref-{32 hex}.{ext}` filenames. The SHA-256 prefix includes safe session ID, turn ID, reference ID, raw-byte length, and raw bytes. Atomic `xb` creation reuses byte-identical existing files, returns 409 for occupied mismatched content without overwrite, preserves old UUID `/outputs` URLs unchanged, and keeps created-file compensation for failed session writes.
- 2026-07-15 — Status: active: Every unsafe `/api` write receives a pre-parser encoded-body limit: generation keeps 152 MiB, Studio sessions receive 208 MiB for Base64 expansion, and all other writes receive 2 MiB. Studio write normalization truncates prompt/reply/draft text to 200,000 characters, errors to 8,000, generated-image strings to 8,192, metadata to depth 4 / 50 items / 8,192-character strings / 64 KiB, and rejects normalized session JSON above 32 MiB before atomic replacement while compensating new reference files. Legacy GET remains read-only.
- 2026-07-15 — Status: active: Upstream image result accounting separates checked bytes from accepted image count. Base64 estimates reserve bytes before decode; remote chunks charge before entering the in-memory payload; invalid candidates do not refund work. Existing read-only budget property names remain as compatibility aliases.
- 2026-07-15 — Status: active: Execute `docs/superpowers/plans/2026-07-15-final-review-remediation.md` sequentially in six tasks. Each product change requires observed RED evidence first, then minimal GREEN, targeted regression, and a small commit. No G: write occurs before the complete local matrix and final whole-branch review pass.
- 2026-07-15 — Status: active: The user approved the complete conservative remediation in `docs/superpowers/specs/2026-07-15-final-review-remediation-design.md`: checked-byte upstream accounting, limits for every unsafe API body plus bounded session persistence, compact persisted baseline markers with startup three-way merge, conditional canonical reference adoption plus deterministic content-hash paths, and host/port-only public URL hints. Full raster decode remains a deferred Minor to avoid new offline Pillow dependencies.
- 2026-07-15 — Status: superseded: Code HEAD `99d8d91` had five unresolved Important final-review findings. Those five plus two later review findings are now fixed with RED/GREEN evidence and the current whole-branch review has zero unresolved Critical/Important; the remaining release block is real-browser verification, not code review.
- 2026-07-15 — Status: superseded: SHA256 `56aef66b45c9fec40f3d9b97355c7e2bf59de7615f49d0800b49c08294a23216` passed the full local/package/G verification matrix but was rejected by the subsequent whole-branch review. It remains on disk only as a superseded artifact; v1.0.5 remains the rollback package.
- 2026-07-11 — Status: superseded: The verified v1.0.6 candidate SHA256 `28479e4d98c2afc68e2f1205da4fc904d8c59604291fdcd300db6a646cf766a4` was replaced by later packaged-file fixes and is not a final artifact.
- 2026-07-11 — Status: superseded: SHA256 `51f75e9d001cbee5529905dcc106568bdc4142f87416dbe8fdda08061e2dc9a7` was a verified content-identical candidate. The fresh build/package pass changed only 11 ZIP entry timestamps; all 53 entries retained identical names, order, content hashes, lengths, and compressed lengths. It was replaced and resynced as the active `28479e…` artifact without a user-visible code/content change.
- 2026-07-11 — Status: superseded: The first synced v1.0.6 candidate (`958334899120e934b82ce786c803616562ad87e45b37b8f4b6d5d966ce6e019d`) was rejected by final whole-branch review. Its five reproduced Important gaps were fixed and its package was replaced by the active `51f75e…` candidate.
- 2026-07-11 — Status: superseded: The original v1.0.6 synchronization evidence described the 52-file `958334…` package. Later packaged-file fixes invalidated that evidence; the G: folder and ZIP were rebuilt, overwritten, and reverified as `51f75e…`. The v1.0.5 ZIP remains as rollback.
- 2026-07-11: Branch completion does not imply publication. Do not merge, push, tag, create a pull request/GitHub Release, or delete the worktree/branch until the user chooses an integration option through the finishing-a-development-branch workflow.
- 2026-07-10: Windows release packages use an exact manifest rather than whole-tree copies. Allowed content is limited to required root files, Classic's three static files, Studio `index.html` plus hashed `index-*.js/css` assets, the fixed portable Python ZIP, and top-level wheel files. Source, staged directory, final ZIP, preflight, and sync validation reject unknown/missing/ambiguous paths; adding a legitimate release file now requires an intentional manifest change.
- 2026-07-10: Every native command in `release_one_click.ps1` runs through a helper that checks its exit code immediately. A failed compile/test/build/package/smoke/preflight/sync step cannot be hidden by a later successful command or reach the next release gate.
- 2026-07-10: Portable runtime reuse is keyed by hashes of the bundled Python ZIP, requirements, and wheels, and backend reuse is tied to a SHA-256 instance ID derived from the resolved case-folded project root. Runtime input changes rebuild `.runtime`; extraction failures remove only the incomplete runtime and preserve the vendor ZIP.
- 2026-07-10: Task 3 concurrency limits track the lifetime of the real blocking thread, not merely the awaiting coroutine. Every job-aware upstream call rechecks cancellation after acquiring its permit; save/history disk work runs off the event loop so a separate cancel request can arrive and trigger compensation.
- 2026-07-10: Atomic JSON replacement retries only transient `PermissionError` failures with a short bounded delay. Non-permission disk errors and locks that outlast the retry budget still fail visibly; the old JSON remains intact and UUID temp files are cleaned best-effort.
- 2026-07-10: Studio session conflict handling uses a server baseline atomically bound to its revision. Three-way merge preserves true concurrent edits, respects deletion of unchanged sessions, rejects stale success/GET/409 responses, and never sends more than one automatic retry per save operation.
- 2026-07-10: v1.0.6 release work must pass local tests, build, allowlist packaging, extracted-package smoke, browser smoke, and local preflight before any G: write. Older ledger notes that say to sync after every update are superseded for this hardening branch.
- 2026-07-10: Browser persistence strips `api_key` recursively, but backend `config.local.json` remains the deliberate secret store. Chat reference intake is guarded in the UI and again against the latest submit mode before and after asynchronous image loads, so text-only chat cannot accidentally accept a late reference result.
- 2026-07-10: Public `/outputs` access requires an allowed raster extension that matches the detected magic bytes. Session references apply both the 25 MiB per-image limit and the 150 MiB request budget before any session-reference write; generated WebP uses a deterministic `.webp` suffix.
- 2026-07-10: Execute the approved v1.0.6 implementation plan with fresh task implementers plus spec and code-quality review in the same isolated worktree. The execution skill requires this workflow when subagent support is available; tasks remain sequential on one branch to avoid shared-file conflicts.
- 2026-07-10: Implement all confirmed P1 fixes on one isolated branch, `codex/p1-hardening-v1.0.6`, using four staged implementation slices and TDD. Preserve the FastAPI + React/Vite architecture, old config/history/session schemas, `/classic`, and offline Windows packaging.
- 2026-07-10: v1.0.6 will disable unsupported or misleading behavior instead of inventing provider contracts: chat reference images are disabled until true multimodal payloads exist; GPT edit mode and reference strength are hidden until an upstream adapter uses them.
- 2026-07-10: v1.0.6 uses strict raster validation, controlled outputs routing, production same-origin access, bounded threaded `requests`, in-memory job cancellation state, file locks/atomic JSON/revision conflict handling, and a release whitelist. SQLite, remote/LAN mode, and full multimodal chat remain separate future projects.
- 2026-06-26: v1.0.5 is a result/history UI polish release. Before merge/tag/publish, run compatibility review for colleague PCs, G: clean package behavior, stale backend/cache reuse, Windows PowerShell 5.1 launchers, Firefox/Chromium layout behavior, and history/output deletion safety.
- 2026-06-26: v1.0.5 startup reuse must validate `/api/health.version` against local `VERSION` before reusing an existing service, and Studio builds must keep the previous v1.0.4 hashed JS/CSS as fallback files. Legacy output deletion must be scoped to the exact generated legacy file id / `legacy_path` pair instead of scanning every file with the same stem.
- 2026-05-26: Queue jobs own a live `sessionId/turnId` reference only while that target exists. Running/queued jobs block deleting or clearing their session, refresh-interrupted jobs reconcile their matching turn to an error state, and queue actions guard missing targets instead of silently switching to deleted sessions.
- 2026-05-26: Diagnostics may show endpoints for troubleshooting, but endpoints must be sanitized for URL userinfo and sensitive query parameters before returning to the UI.
- 2026-05-26: Startup stale-process cleanup must only stop processes whose command line includes this repository's resolved `app.py`; loose `app.py` matching is too risky on shared Windows machines.
- 2026-05-26: v1.0.3 sync uses the clean package as the source of truth: mirror the extracted package folder to G:, exclude runtime/config/output artifacts, and sync only versioned zips such as `NM_web_imagen-v1.0.3.zip`; leave unversioned `NM_web_imagen.zip` untouched for manual deletion.
- 2026-05-26: Release should be one-click for this tool: `一键发布.bat` runs frontend tests, build, backend checks, clean package sync, and release preflight before reporting success.
- 2026-05-26: Generation queue execution is serialized in the frontend: new jobs enter `queued`, only one `/api/generate` request runs at a time, and queued/running jobs are canceled on refresh.
- 2026-05-27: GPT multi-image requests should be result-count tolerant: when an upstream gateway accepts `n` but returns fewer images, the backend follows up for the missing count instead of silently saving only one.
- 2026-05-26: v1.0.3 config profile migration must remain backward-compatible: legacy `forms` load as default profiles, new saves keep legacy `forms`, and default profile names derive from URL short names when custom names are absent.
- 2026-05-26: Profile deletion in the multi-config drawer is guarded: show a compact row-level delete icon, require confirmation, keep at least one same-engine profile, and switch to another profile when deleting the active one.
- 2026-05-26: Diagnostics should call generation and chat checks separately, report partial failures clearly, and redact API keys from returned errors. Startup reuse must also probe required API routes, not only static assets.
- 2026-05-26: Queue rows should keep controls compact and row-local: cancel for running work, retry for completed/failed/canceled work, apply prompt for any task, and remove for any task.
- 2026-05-26: Queue metadata persistence is browser-local for v1.0.3. Finished/error/canceled jobs survive refresh, while queued/running jobs restore as canceled with an explicit interruption message because old HTTP requests cannot survive a page reload.
- 2026-05-26: v1.0.3 queue UI starts as a floating chat-area capsule with an overlay list, not a fixed right sidebar, so it does not squeeze or offset the main conversation/composer layout.
- 2026-05-26: Completed queue jobs should expose their first generated image as a compact clickable thumbnail, with a direct download action. Image preview lightboxes should keep top-right for file actions only, and put zoom/fit controls inside the canvas bottom corner with wheel zoom and drag pan.
- 2026-05-26: Multi-config management needs an explicit add-profile entry in the profile list, and queue rows need a text click target that jumps back to the matching conversation turn.
- 2026-05-22: Startup reuse must validate Studio assets before trusting an existing backend; `/api/health` alone is insufficient after files are overwritten while an old Python process is still running.
- 2026-05-18: v1.0.3 theme is workflow robustness: multi-config profiles, queued image generation, non-blocking chat/session use while jobs run, separate generation/chat diagnostics, and a later light UI polish pass.
- 2026-05-15: Defer the latest v1.0.2 review findings to the next version. Do not republish v1.0.2 solely for: history apply preserving session prompt drafts, chat-mode helper wording, or broader `.svnignore` cleanup.
- 2026-05-14: Prompt-like draft text is session-scoped. In this slice GPT keeps `prompt / negative_prompt / poster_text` per session, Banana keeps `prompt` per session, while non-text generation parameters remain global form settings.
- 2026-05-14: GPT `负面提示词` and `画面文字` belong near the main composer as an expandable `文本约束` strip instead of living only inside `高级参数`.
- 2026-05-14: Unsubmitted composer reference images still remain global for now, so switching sessions must confirm whether to preserve or clear them, and deleting the active session should clear them.
- 2026-05-13: Build v1.0.2 on `codex/v1.0.2` first; merge to `main` only after verification and user approval.
- 2026-05-13: After every update, sync a clean package copy to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`, excluding local artifacts and internal ledger files.
- 2026-05-13: For GPT Image 2 upstream 524 responses, show a specific Chinese gateway-timeout explanation instead of surfacing only raw HTML or generic upstream text.
- 2026-05-12: For GPT Image 2 edits multipart uploads, keep original reference image names for local display/metadata but send ASCII-safe request filenames to avoid `requests/urllib3` header encoding failures on non-English Windows filenames.
- 2026-05-11: Keep new and old share packages side by side; update only `NM_web_imagen/` and `NM_web_imagen.zip`, leaving `web_imagen_tool/` and `web_imagen_tool.zip` intact.
- 2026-05-11: Always start the Studio UI on GPT Image 2 and defer Banana/Gemini config validation until the user selects Banana/Gemini.
- 2026-05-10: Keep the Studio-inspired conversation stream browser-local only and do not write it into `outputs/history.json`.
- 2026-05-10: Use `7861` as this Studio branch's default port so it can coexist with the main/simple branch on `7860`.
- 2026-05-10: Save only connection fields in `config.local.json`; generation parameters should come from frontend defaults unless changed per request.
- 2026-05-10: Keep header connection configuration as a compact API Key / URL / model modal, while full generation controls stay behind the composer `高级参数` modal.
- 2026-05-10: Keep GPT composer size presets as 1K/2K/4K plus aspect ratios, with custom width/height as an explicit correction/apply path.
- 2026-05-10: Trial a small React/Vite Studio frontend while preserving the existing FastAPI backend and URL + Key + model workflow.
- 2026-05-10: Make the left sidebar default to browser-local conversations and keep old card-style generation records under a separate history素材 tab.
- 2026-05-10: Keep left history as generation-context records, not full backend conversations; open them in a detail modal showing prompt, images, parameters, and meta.
- 2026-05-03: Use Project Ledger Loop from this point forward for this repo.
- 2026-05-03: Keep distribution as a Win64 offline zip/folder package rather than a Go single exe or PyInstaller one-file exe.
- 2026-05-03: Treat the right panel as result-first; queue, history, and details are secondary controls.
- 2026-05-03: Use a dedicated GPT Image 2 `poster_text` field for exact required image text.

## 2026-05-18 - v1.0.3 Workflow Robustness Scope
- Status: active
- Decision: Plan v1.0.3 around four core workflow capabilities: saved multi-config profiles, real generation queue, non-blocking chat/generation/session switching, and separate minimal diagnostics for image and chat endpoints. Keep UI polish as a follow-up pass after those foundations are stable.
- Reason: The user wants the tool to behave like a real workbench: generation should not freeze the whole interface, multiple API setups should be reusable, and another computer should be able to quickly tell whether image and chat endpoints both work.
- Alternatives considered: Only add UI polish first; only add queue without config profiles; keep config as a single global form.
- Consequences / follow-up: Start v1.0.3 with data model design for config profiles, queue jobs, session/job ownership, and diagnostics results. Avoid building the UI first because the queue/session boundary is the main correctness risk.

## 2026-05-26 - v1.0.3 Profile Compatibility And Queue Placement
- Status: active
- Decision: Save v1.0.3 multi-config data as `profiles` plus `active_profile_ids`, while also writing the v1.0.2-compatible `forms` object. When reading old configs that only have `forms`, create one default profile per engine and use a URL-derived short name unless a custom name exists. The queue entry should be a small floating capsule in the chat area that expands into an overlay, not a permanent right-side panel.
- Reason: The user explicitly required old v1.0.2 configs and other computers to keep opening without config loss or white screens. The existing workbench also treats the conversation/composer as the main surface, so a right queue panel would fight the layout.
- Alternatives considered: Replace `forms` with only `profiles`; display the model name as the config entry; add a fixed right queue sidebar; keep the redundant `配置已完成` chip.
- Consequences / follow-up: Future profile edits must keep the legacy `forms` compatibility layer until a migration/release policy says otherwise. Queue hardening should add controls and persistence inside the overlay/drawer pattern rather than making a new right panel.

## 2026-05-26 - Queue Completion Preview Actions
- Status: active
- Decision: Completed queue rows should use the first generated image as a 44px thumbnail button that opens the same image preview lightbox used elsewhere, and should expose a direct download action. The lightbox should keep download/reference/close in the header, while zoom in/out, fit, and 100% live as a canvas-corner toolbar. The canvas also supports mouse wheel zoom, drag panning while zoomed, and double-click reset.
- Reason: The user clarified that completed tasks need an obvious clickable area to view and download outputs, and all previews should support download plus canvas-scale style controls similar to the older web tool.
- Alternatives considered: Keep only a green completion icon; use a large right-side queue drawer; keep preview controls only on the image cards.
- Consequences / follow-up: Future queue controls should build on the compact overlay row pattern and avoid increasing the main chat surface height or using oversized controls. Future preview actions should preserve the distinction between header file actions and in-canvas view controls.

## 2026-05-26 - Config Add Entry And Queue Jump
- Status: active
- Decision: Put `新增配置` inside the left profile list of the multi-config drawer, below existing profiles. Queue job rows should expose the job title/config text as a click target that closes the queue popover and scrolls to the matching conversation turn.
- Reason: The user could not discover where to add another config, and completed/running queue tasks need a clear way to return to the related conversation context.
- Alternatives considered: Put add config only in the footer; make only the thumbnail clickable; add a separate small jump icon.
- Consequences / follow-up: Future profile controls should remain near the profile list. Future queue row actions should avoid making the download thumbnail/jump targets compete.

## 2026-05-26 - Guarded Config Profile Deletion
- Status: active
- Decision: Add profile deletion as a compact icon button inside each same-engine profile row. Deletion asks for confirmation, is disabled when only one profile remains for that engine, and deleting the active profile immediately switches the form to another same-engine profile before the user saves.
- Reason: The user caught that multi-config management was incomplete without deletion, but deleting the last config would create an empty profile state and risk confusing or broken saves.
- Alternatives considered: Hide deletion entirely; allow deleting all profiles and recreate defaults on save; make deletion a large text action. These either leave management incomplete, increase migration risk, or make the drawer visually heavier than requested.
- Consequences / follow-up: Profile rows now use a main selection button plus a secondary delete icon. Persisted deletion still follows the existing explicit `保存配置` flow, which keeps profile edits consistent with the rest of the drawer.

## 2026-05-26 - Separate Diagnostics And Required Route Probe
- Status: active
- Decision: Add `/api/diagnostics` as a structured check endpoint that runs generation and chat checks independently for the active engine. The config drawer exposes `测试连接` and renders separate cards for 生图 and 聊天, including endpoint/model/latency/status and redacted errors. `start_web.ps1` now probes `/api/diagnostics` with a no-key chat check before reusing a running backend.
- Reason: Another computer needs to see whether image generation or chat is the broken side. During local smoke, an old backend could serve new static assets while lacking new API routes, so static asset probing alone was insufficient.
- Alternatives considered: Reuse only `/api/health`; test only chat because it is cheaper; show raw upstream errors. Those would miss partial failures, stale route mismatches, or leak sensitive config details.
- Consequences / follow-up: The generation diagnostic may call a real image endpoint when users click it. Keep this as an explicit button, not an automatic startup check.

## 2026-05-26 - Compact Queue Row Controls
- Status: active
- Decision: Add compact row-local queue controls: cancel for running/queued jobs, retry for completed/failed/canceled jobs, apply prompt for any job, and remove for any job. Keep clear-completed in the queue header.
- Reason: The user asked completed tasks to have usable click targets and the planning checklist required cancel/retry/apply/delete controls without turning the queue into a large right-side panel.
- Alternatives considered: Put all controls in the queue header; open a larger job detail drawer; make only completed jobs actionable. These reduce directness or make the compact queue feel too heavy.
- Consequences / follow-up: Retry currently resubmits the stored prompt into the job's session with the current active configuration for that engine. Queue metadata persistence and deeper parameter snapshotting remain a separate decision.

## 2026-05-26 - Browser-Local Queue Persistence
- Status: active
- Decision: Persist only compact queue metadata in browser `localStorage`. On refresh, preserve `success`, `error`, and `canceled` jobs, but convert stored `queued` or `running` jobs to `canceled` with `页面刷新，任务已中断`.
- Reason: v1.0.3 has browser-owned queue UI state and normal HTTP generation requests; after a full page refresh there is no reliable client-side controller left for the old request, so restoring it as still running would be misleading.
- Alternatives considered: Store queue metadata under `outputs/`; attempt to resume running jobs after refresh; do not persist queue rows at all.
- Consequences / follow-up: Generated images remain durable through existing saved output URLs/history, while the queue list is a convenience surface for the current browser. A future backend job runner could replace this with durable server-side queue state.

## 2026-05-22 - Startup Asset Probe Before Backend Reuse
- Status: active
- Decision: `start_web.ps1` must probe the current Studio page JS/CSS assets before reusing an already-running backend. If health succeeds but assets fail, the script may stop a recognizable stale `app.py` process and start the current code.
- Reason: A stale in-memory backend can still pass `/api/health` and read the updated `static/studio/index.html`, while lacking the new `/assets` mount required by `./assets/...` from the root page. That mismatch produces a white screen.
- Alternatives considered: Only tell users to run `stop_web.bat`; rely on version query cache-busting; keep absolute `/static/studio/assets` URLs. These do not handle the real stale-process mismatch reliably.
- Consequences / follow-up: Release checks should include root HTML asset probing from an actual server, plus extracted-zip smoke checks. The G: folder may still contain ignored local runtime/config/output artifacts, so zip packages remain the cleaner distribution source.

## 2026-05-10 - Browser-Local Workbench Conversation
- Status: active
- Decision: Store the new conversation stream in browser `localStorage` only, while continuing to use `/api/history` and `outputs/history.json` for long-term generation history.
- Reason: The user wanted continuous editing-style workspace behavior without adding CPA, accounts, Redis, remote sync, or backend history schema changes.
- Alternatives considered: Persist turns into `outputs/history.json`; add a backend session endpoint; copy the external Studio architecture.
- Consequences / follow-up: Clearing results clears the current local conversation; history remains the durable backend record. Future export/import can be added separately if needed.

## 2026-05-11 - New/Old Package Coexistence
- Status: active
- Decision: Preserve the old `web_imagen_tool/` folder and `web_imagen_tool.zip` in the share directory, while applying current fixes only to `NM_web_imagen/` and `NM_web_imagen.zip`.
- Reason: The user clarified that new and old should coexist, and the old zip should not be updated.
- Alternatives considered: Replace the old folder/zip with the renamed package; delete the old artifacts during cleanup.
- Consequences / follow-up: Future sync and cleanup commands must target the new `NM_web_imagen` path explicitly and avoid broad deletion in the share root.

## 2026-05-11 - GPT Image 2 Startup Default
- Status: active
- Decision: Initialize the frontend on GPT Image 2 and ignore `active_engine` from backend defaults during startup. Validate Banana/Gemini config only when the user selects the Banana/Gemini tab.
- Reason: Starting on Banana/Gemini caused an immediate missing-config prompt even when the desired default workflow is GPT.
- Alternatives considered: Preserve the last selected engine from browser storage; keep backend `active_engine` authoritative; delay all startup validation.
- Consequences / follow-up: Browser storage still records user selections after startup, but a fresh reload returns to GPT Image 2 by design.

## 2026-05-12 - Multipart Reference Filename Encoding
- Status: active
- Decision: Preserve uploaded reference image names in local metadata, but use an ASCII-safe `request_filename` when constructing GPT Image 2 `/v1/images/edits` multipart requests.
- Reason: Some machines upload Chinese or otherwise non-latin filenames, and `requests/urllib3` can raise `UnicodeEncodeError` while encoding the multipart `Content-Disposition` header before the upstream service receives the request.
- Alternatives considered: Ask users to rename files manually; percent-encode the filename; strip filenames entirely.
- Consequences / follow-up: The upstream receives stable names such as `reference-01.png`, while UI/history display can still keep the user's original filename.

## 2026-05-10 - Header Config vs Advanced Parameters
- Status: active
- Decision: The top header model/config button opens only API Key, URL, and model fields. Full generation controls remain in the composer `高级参数` modal.
## 2026-05-26 - Serialized Image Generation Queue
- Status: active
- Decision: Treat the v1.0.3 generation queue as a real single-flight queue: new image-generation submissions enter `queued`, only the oldest queued job starts when no generation job is `running`, and refresh still cancels queued/running jobs because browser fetches cannot survive reload.
- Reason: Parallel upstream image requests made later queue entries appear to be “一直在请求”; users expect a queue to wait behind the active generation job.
- Alternatives considered: Keep concurrent generation and only improve labels; add a backend worker queue immediately.
- Consequences / follow-up: The frontend now snapshots payloads for runtime queued jobs and starts them serially. A future backend queue could preserve jobs across refresh, but browser-local v1.0.3 intentionally marks interrupted jobs canceled.

- Reason: The user wants the visible header configuration to behave like simple connection setup, not a duplicate advanced-parameter entry.
- Alternatives considered: Reuse the full advanced-parameter modal from every config button; keep engine/model duplicated above the composer.
- Consequences / follow-up: Connection setup has one compact header entry point, while reference image, size, count, and advanced generation controls stay near the prompt composer.

## 2026-05-10 - Composer Size Preset Structure
- Status: active
- Decision: Present GPT Image 2 size selection as tier buttons (`自动`, `1K`, `2K`, `4K`) plus aspect buttons (`1:1`, `16:9`, `21:9`, etc.), then show the resolved custom pixel size.
- Reason: This matches the Studio-style mental model better than a long pixel preset list, while still sending the existing URL + Key + model backend a concrete official-valid size.
- Alternatives considered: Keep only raw pixel presets; use a separate large size modal; import the external project's size UI directly.
- Consequences / follow-up: The size popover now uses shared tested preset rules. The custom width/height button is labeled `应用` because typing already switches to custom and the button only forces immediate normalization.

## 2026-05-10 - React/Vite Studio Frontend Trial
- Status: active
- Decision: Add a small `studio-web` React/Vite frontend that builds into `static/studio`, serve it at `/`, and keep the previous static UI at `/classic`.
- Reason: The static skinning attempt did not reach the Studio-like quality bar; React makes the workbench layout, local session state, and interaction polish easier to iterate without adopting the external project's backend.
- Alternatives considered: Fork and strip ChatGpt-Image-Studio; keep improving the old static page; rewrite the FastAPI backend around conversations.
- Consequences / follow-up: The project now has a lightweight build step for the experimental Studio UI. Existing backend APIs and URL + Key + model setup stay intact, and `/classic` remains a rollback path.

## 2026-05-10 - History Context Detail Modal
- Status: active
- Decision: Treat persistent left history entries as per-generation context records and show their prompt, images, form_state, and meta in a centered detail modal.
- Reason: The existing backend history format stores generation records, while the continuous conversation stream remains browser-local.
- Alternatives considered: Add backend conversation sessions; write local turns into `outputs/history.json`.
- Consequences / follow-up: Clicking old history can inspect and reuse the concrete generation context, but it does not reconstruct a full multi-turn chat unless that data exists in the browser-local current session.

## 2026-05-10 - Sidebar Conversation Mode
- Status: active
- Decision: Default the left sidebar to browser-local conversation sessions, with old `outputs/history.json` entries moved into a separate `历史`素材 tab.
- Reason: New workbench interactions should feel like an AI web chat, while the old generation records remain useful as a素材库 rather than conversation state.
- Alternatives considered: Keep only card-style history; write conversations into backend history; add a backend session API immediately.
- Consequences / follow-up: Conversations persist in browser `localStorage` and are not portable across browsers yet. Old history remains durable on disk and can still be applied or used as reference images.

## 2026-05-03 - Enable Project Ledger Loop
- Status: active
- Decision: Maintain `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, and `DECISIONS.md` alongside existing `AGENTS.md`.
- Reason: The user asked for staged commits and explicitly asked whether `project-ledger-loop` was being used.
- Alternatives considered: Continue with chat-only state.
- Consequences / follow-up: Update the ledger before stable phase commits and before handoff.

## 2026-05-03 - Win64 Offline Zip Package
- Status: active
- Decision: Ship a fixed Windows x64 offline package with bundled portable Python 3.12 and compatible wheels.
- Reason: The target is double-click usability and no external user dependency, not minimum single-exe size.
- Alternatives considered: Go rewrite, PyInstaller one-file exe, system Python plus pip install.
- Consequences / follow-up: Keep package exclusions strict for local config, outputs, caches, logs, and runtime directories.

## 2026-05-03 - Result-First Right Panel
- Status: active
- Decision: Make the current image/result area the primary right-panel content; queue and metadata stay compact or modal.
- Reason: The previous right panel felt crowded and reduced preview space.
- Alternatives considered: Keep queue/history/detail panels always visible.
- Consequences / follow-up: Queue must have explicit controls for expand, clear, and remove queued jobs.

## 2026-05-03 - Explicit Poster Text Field
- Status: active
- Decision: Add `poster_text` as a separate form field and append exact readable-text instructions to the GPT Image prompt.
- Reason: Generic wording such as "need some text" often produces no readable text, especially when negative prompts penalize bad text.
- Alternatives considered: Only update user documentation or rely on stronger prompt examples.
- Consequences / follow-up: History stores `poster_text`; users should put exact desired words in this field.

## 2026-05-14 - Session-Scoped Text Drafts
- Status: active
- Decision: Store text drafts with the workbench session instead of the global engine form. GPT sessions keep `prompt`, `negative_prompt`, and `poster_text`; Banana sessions keep `prompt`.
- Reason: Users were accidentally reusing old negative prompts or poster text because those values behaved like sticky global presets rather than per-conversation context.
- Alternatives considered: Keep them in `高级参数`; only move negative prompt; make all generation parameters session-scoped.
- Consequences / follow-up: History apply and regenerate flows must write back into session drafts, and deleting a session should remove its drafts along with any session-owned reference snapshots.

## 2026-05-14 - Composer-Adjacent Text Constraints
- Status: active
- Decision: Surface GPT `负面提示词` and `画面文字` in a dedicated expandable `文本约束` strip directly under the main composer.
- Reason: These fields meaningfully affect nearly every generation, so hiding them deep in `高级参数` made accidental stale injection too easy.
- Alternatives considered: Keep them in advanced settings only; make them always expanded; add a separate modal.
- Consequences / follow-up: The strip should summarize current values compactly, and advanced settings should stop duplicating these fields.

## 2026-05-14 - Global Composer References For Now
- Status: active
- Decision: Keep unsubmitted composer reference images global for this v1.0.2 slice, but require an explicit preserve/clear choice when switching sessions and clear them when deleting the active session.
- Reason: Session-scoping reference files is a larger behavior change; the current goal was to remove prompt-text leakage first without reopening the reference upload lifecycle.
- Alternatives considered: Make reference files fully session-scoped now; silently preserve them on switch; silently clear them on every switch.
- Consequences / follow-up: The UI must warn that current reference images are not session-bound yet, and future queue/multi-chat work can revisit deeper reference scoping.
