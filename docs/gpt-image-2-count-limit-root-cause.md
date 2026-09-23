# gpt-image-2「生成数量」失效：根因与修复（2026-09-11）

## 一句话结论

不是前端或后端把参数弄丢了：Studio 一直把 `n` 原样发出去，**是上游渠道只接受 `n=1`**，对 `n>1` 直接返回
`400 {"message": "n currently supports 1 only"}`。修复前用户设 4 张就必然报「上游服务拒绝了请求」；
修复后同一渠道自动改成**逐张补齐**（一次一张、请求 N 次），用户设定的数量重新生效。

## 用户症状

- 在 Studio 设置「生成数量 = 4」后点生成，直接报错：`上游服务拒绝了请求，请检查模型与生成参数。`
- 桌面历史（`%LOCALAPPDATA%\com.nmimagestudio.desktop` → `D:\Documents\NM Image Studio`）里 2026-09-10 / 09-11
  的记录全部是 `n=1`（报错的请求不写历史），而 2026-06-11 `n=2→2 张`、2026-07-21 `n=3→3 张` 的成功记录
  走的是另一条网关（`ai-gateway.local`），说明「数量」在别的渠道上是生效过的。

## 已排除的假设（都实测过）

| 假设 | 结论 |
| --- | --- |
| 前端没把 `n` 发出去 | 排除。`submissionPayload.ts` 只排除 `model_options`；构建产物 `static/studio/assets/index-BizgDgDV.js` 同源；`setGenerationCount` → `setGptForm(n)` → `submit()` 读实时表单 |
| 被「未知参数」重试删掉 | 排除。v1.1.3 起 `n` 在保护集合 `{model,prompt,image,input,tools,n}` 内 |
| 档案切换 / 配置重载把 `n` 重置回 1 | 排除。`profileFormSnapshot` 只清 api_key / 凭据 / model_options |
| 后端没有补齐（top-up）逻辑 | 排除，逻辑存在且有效：`while resolved_endpoint != "/v1/responses" and 0 < len(images) < n` |
| 真正的缺口 | 补齐循环**只在第一次请求成功之后**才跑；渠道对 `n>1` 直接 400 时循环进不去，用户只看到通用报错 |

## 根因证据（真实渠道，探测花费 0 元）

直连用户自己的中转 `http://64.186.244.43:12001`（New API），模型 `「YS」gpt-image-2.5-sunburst`：

| 请求 | 结果 |
| --- | --- |
| `/v1/images/generations`，`n=2` | `HTTP 400`，0.72s，`{"message": "n currently supports 1 only", "type": "invalid_request_error", "code": "ERR-272507F5B8"}` |
| `/v1/images/edits`，`n=2` + 1 张 1024×1024 参考图 | `HTTP 400`，0.70s，`{"error": {"message": "n currently supports 1 only", ...}}` |
| 应用内同请求、关闭新探测（模拟修复前） | `HTTP 400`，0.71s，detail `上游服务拒绝了请求，请检查模型与生成参数。` |
| 应用内同请求、修复后 `n=4` | `HTTP 200`，**4 张图**，`count_strategy=per-image`，110.76s，`estimated_cost=$0.1422` |

渠道在 0.7 秒内速拒、未出图、未计费，说明是**渠道侧参数校验**（不是超时、不是内容审核）。

复现命令（换成自己的 key / base_url）：

```bash
curl -sS -m 30 -o body.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"「YS」gpt-image-2.5-sunburst","prompt":"test","size":"1024x1024","n":2}' \
  http://64.186.244.43:12001/v1/images/generations
cat body.json   # => {"message":"n currently supports 1 only", ...}
```

本地留存证据（`outputs/` 已被 gitignore）：`outputs/count-fix-evidence/`
（`generations_n2.json`、`edits_n2.json`、`live_count4.json`、`studio_ui.png`）。

## 修复（`app.py`）

1. 新增 `upstream_rejects_multiple_images(message)`：只认「数量被限制为 1」的说法
   （`n currently supports 1 only`、`only 1 image`、`n must be 1`、`n is limited to 1`、`每次只能生成 1 张`、
   `n=4 is not supported` 等）。尺寸、内容审核、鉴权类 400 一律不匹配，避免误降级。
2. `post_gpt_payload` 的 400 分支：当 `n>1` 且命中该判定时，把 `n` 改为 1 立即重试，并标记
   `count_strategy = "per-image"`（同一分支里原有的「未知参数剔除」逻辑保持不变，`n` 仍受保护）。
3. 补齐循环：`per-image` 模式下后续每个请求也继续发 `n=1`（否则会被再次 400），直到凑满用户设定的张数。
4. `meta.count_strategy` 记录 `single-call` / `per-image`，历史里能看出这一次是多请求凑出来的。

代价与产品含义：渠道一次只出一张，所以 **N 张 = N 次请求 = N 倍时间与费用**（本例 4 张 110.8s / $0.1422）。
这是渠道能力决定的；Studio 的「多图确认」弹窗本来就是为这种成本提示准备的。

## 回归测试

`tests/test_upstream_jobs.py` 新增 4 个用例：

- `test_count_limit_detector_matches_real_channel_rejection`：11 条正例 + 8 条负例语料。
- `test_gpt_generate_still_honors_count_when_channel_only_supports_one`：`n=3` → 200 / 3 张，
  上游收到的 `n` 序列为 `[3, 1, 1, 1]`，`meta.count_strategy=per-image`。
- `test_gpt_edit_still_honors_count_when_channel_only_supports_one`：edits `n=2` → 2 张，序列 `[2, 1, 1]`。
- `test_gpt_unrelated_400_keeps_failing_and_does_not_downgrade_count`：无关 400 仍然 400，
  只发 1 次请求（不降级、不重试）。

全套结果：294 Python / 27 Node 通过；`python -m py_compile app.py` 通过；
真实启停 `start_web.ps1` → `/api/health` 200；修复后真实渠道 `n=4` 出 4 张。

## 打包后端（桌面版 sidecar）验收

桌面版跑的是 PyInstaller 冻结的 `nm-image-studio-backend.exe`，所以「源码修好了」不等于「装上就生效」。
v1.1.4 打包后单独验收了冻结产物（零花费，确定性 mock 渠道，复刻真实渠道行为：`n>1` 回 400
`n currently supports 1 only`，`n=1` 回一张图）：

| 步骤 | 结果 |
| --- | --- |
| 启动冻结 sidecar（独立 `IMAGE_TOOL_DATA_ROOT` + desktop token） | `/api/health` 200，version=1.1.4，无 token 请求 401 |
| 请求 `n=3` | HTTP 200，**3 张图**，`meta.n=3`、`image_count=3`、`saved_count=3`、`count_strategy=per-image` |
| mock 渠道侧看到的 `n` 序列 | `[3, 1, 1, 1]` |

脚本：`.runtime/verify_packaged_backend_mock.py`（`.runtime/` 已被 gitignore，不进包）。

## 验收当天的渠道停摆（与本次修复无关）

2026-09-12 07:2x 复跑真实渠道时，源码后端与打包后端**同时**返回 502「上游服务返回异常」；直连中转得到：

- `n=2` → `400 {"error": {"message": "n currently supports 1 only", "code": "ERR-BCEFE8A29B"}}`（判定前提依旧成立）
- `n=1` → `503 {"error": {"message": "No active tokens available in the pool", "code": "ERR-55EC10F73C"}}`

即中转的上游令牌池当前为空/不可用，任何张数都出不了图（不是 1 张的问题，也不是修复引入的）。
渠道恢复后可用 `.runtime/probe_gpt_count.py --url http://127.0.0.1:7861 --n 2` 复跑一次真实验收。

## 边界与后续

- 桌面版跑的是打包好的 `backend\nm-image-studio-backend.exe`（PyInstaller）。本次修的是源码，
  **要让已安装的桌面版生效必须重新打包后端与四类包**（`scripts/build_desktop_backend.ps1` 等）。
- 只覆盖 gpt-image-2。banana 走 `batch_size`，本来就是逐张循环，不受影响。
- 其他 `「」` 渠道（「KB」/「XJ」/「1K」/「CX」…）是否同样只支持 `n=1` 未逐个付费验证；
  同一条 400 判定对它们同样生效，但若某个渠道是**静默忽略 n**，则由原有补齐循环兜底。
- 已知未覆盖：若渠道的 400 文案是「Unknown parameter: n」（完全不认识这个字段）而不是「只支持 1 张」，
  当前仍按原样报错（`n` 在核心保护集合里，不会被剔除）。本次真实渠道不属于这一类。
- 未做：给渠道方报障（`n currently supports 1 only` 是渠道能力声明，不是故障）。
