# 作业小管家 · AI Agent Demo

一个用自然语言帮家长记录孩子作业的 AI Agent 示例：模型负责理解人话，工具负责读写数据，Agent 负责把两者串起来。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
```

开箱即用，无需任何 Key：未配置模型时会自动使用前端规则模拟，功能与交互完全一致。

## 架构

```
浏览器
  App.tsx                 状态编排：选中日期、消息列表
  ├─ ChatPanel.tsx        对话 + 工具调用轨迹
  └─ HomeworkBoard.tsx    当日作业看板（手动按钮复用同一套工具）
  lib/
    agent.ts              Agent 循环：调模型 → 执行工具 → 回填结果 → 再调模型
    tools.ts              5 个工具的定义（给模型）与实现（操作数据）
    mockAgent.ts          无 Key 时的本地规则引擎，模拟一次 tool calling
    llm.ts                调用 /api/llm/chat，不带任何密钥
    store.ts              localStorage 数据源 + useSyncExternalStore
Node（Vite 开发服务器）
  vite.config.ts 中间件    /api/llm/status、/api/llm/chat，注入 API Key
```

### Agent 的工具集

| 工具 | 作用 |
| --- | --- |
| `list_homework` | 查询某天已记录的作业 |
| `add_homework` | 新增作业（自动查重） |
| `update_homework` | 改状态 / 用时 / 备注，支持按 id、学科、标题关键词匹配 |
| `delete_homework` | 删除记录错误的作业 |
| `get_daily_summary` | 统计完成率、累计用时、剩余清单 |

## 切换到真实模型

复制 `.env.example` 为 `.env`，填入任意 OpenAI 兼容服务的配置后重启 dev server：

```bash
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

页面右上角的徽章会变成「真实模型 · 模型名」，此后对话走模型的 function calling，前端只负责执行工具并把结果回填。

Key 只存在于 Node 进程，不会进入浏览器产物；调用失败会自动降级为本地模拟并在回复中说明原因。

## 试试这些说法

- 数学口算题卡写完了，用了 25 分钟
- 明天有英语单词听写，预计 15 分钟
- 语文还有一篇作文
- 今天作业完成得怎么样？

## 数据

全部存在浏览器 `localStorage`（键名 `homework-agent/items/v1`），刷新不丢；看板底部可以「恢复示例数据」或「清空全部」。

## 已知边界

- 模型代理依赖 Vite 开发服务器，`npm run build` 产物是纯静态页面，会退回本地模拟模式。
- 本地模拟是规则匹配，只覆盖常见说法（完成 / 未完成 / 进行中 / 新增 / 删除 / 统计），复杂表达请配置真实模型。
