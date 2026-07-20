# Studio 历史窗重构实施计划（v1.0.8）

## Task 1：契约与状态基线

- 在 `codex/history-window-refactor-v1.0.8` 记录设计、范围和验收标准。
- 为稳定入口、最近多条紧凑历史、单一历史状态、完整窗网格和同窗详情增加 RED 源码契约测试。
- 保持当前 133/133 Node、尺寸门禁、生产构建和 33/33 发布缓存门禁基线。

## Task 2：统一历史状态与入口

- 用 `closed / quick / browser(detailId?)` 替换独立的 `historyBrowserOpen` 和 `historyDetail` 状态。
- 将`存图夹`和`历史窗`改为固定并列入口。
- 将历史刷新移动到数量行，删除重复历史窗入口。
- 将左栏历史缩略图改为最多四格的批次预览，并显示总图片数。
- 实现最近 12 条记录的紧凑窗、数量角标、定位、失焦关闭、Esc 和焦点恢复。

## Task 3：完整历史图库

- 移除完整历史窗的列表/缩略图切换，保留筛选和分页。
- 为单图和多图历史记录实现统一的批次预览。
- 图片点击进入预览；卡片正文进入同窗详情。
- 收紧卡片动作层级，避免多图记录的参考图目标含糊。

## Task 4：同窗详情与响应式

- 把原独立历史详情内容放进完整历史窗内部。
- 返回网格时恢复滚动位置、筛选和已加载数量。
- 完成 920px、560px 和约 320px 的紧凑窗、工具栏、网格和详情布局。
- 检查 hover、active、focus、disabled 和减少动态效果。

## Task 5：验证与交接

- 运行全部 Node 测试、`npm run test:size`、TypeScript/Vite build、33 个发布缓存测试、四模块 `py_compile` 和 `git diff --check`。
- 更新 `PROJECT_STATUS.md`、`NEXT_ACTIONS.md`、`DECISIONS.md`。
- 提交历史窗产品改动与台账；浏览器手验前不打包、不写 G:、不推送、不发布。
