# G 盘同步约定

2026-10-14，按用户手动整理后的目录确定。此规则只针对：

`G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具`

## 桌面分发

`NM Image Studio Desktop` 当前只保留：

- `说明-如何选择版本.txt`
- `NM Image Studio 1.1.6 安装版.exe`
- `NM Image Studio 1.1.6 离线安装版.exe`
- `NM Image Studio 1.1.6 便携版.zip`

以后同步保持这四项的形态，版本随新包更新。不要创建便携展开目录，不把 `.sha256`、manifest、签名、更新源或内部验收文件散放在此处。校验仍从本地 `_release` 的manifest执行。

使用 `scripts/sync_desktop_release_to_g.ps1`，先用 `-Preview` 查看计划。三个包全部版本/hash通过后再复制；新包全部复制并校验成功后，把识别到的旧桌面包移至本地 `_release/share-backups`，避免G盘堆积。未知文件、目录、用户数据与说明中的自定义内容保留；不会创建或镜像应用展开目录。

```powershell
.\scripts\sync_desktop_release_to_g.ps1 -DestinationRoot 'G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具' -ReleaseVersion 1.1.6 -Preview
```

## 网页、说明和素材

- 根目录的 `01_提示词分享`、`02_参数与说明`、`99_素材图`、启动/停止入口及中英文使用说明按用户现状保留，不重排或覆盖自定义材料。
- `NM_web_imagen` 保持干净的可启动网页工程，使用已有 `sync_release_to_g.ps1` 同步。
- 用户当前保留了根目录1.0.9、1.1.5、1.1.6的Web ZIP和更新说明；不要顺便删除这些历史包，也不要把桌面“只保留新版”的规则扩展到根目录。
- 避免用临时的 `sync_release115_desktop.ps1`、`sync-release116-desktop.py` 再次生成已经被用户删掉的内容。
- 用户以后再次调整分发形态时，先读取实际目录再同步；本约定不授权恢复用户主动删掉的额外文件。

此规则没有改变GitHub Release的附件结构，也不适用于另一处 `G:\doc\Tools\网页生图站`。
