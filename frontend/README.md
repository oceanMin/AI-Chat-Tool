# AI Chat Tool - Frontend
AI 对话小工具的前端模块，基于 React + Vite + TailwindCSS 开发，提供流畅的聊天交互体验，支持流式打字效果、Markdown 渲染、代码高亮等核心功能。项目较简单，没做拆分和封装，后续增加历史记录保存等功能在优化。

## 🌟 核心功能
- **流式打字效果**：AI 回复逐字显示，搭配闪烁光标，模拟真实对话体验
- **Markdown 渲染**：支持代码块、列表、加粗、标题等 Markdown 格式
- **代码高亮**：AI 回复中的代码块自动着色，支持多编程语言
- **美观界面**：紧凑布局 + 用户/AI 头像区分，响应式设计适配不同设备
- **即时响应**：发送消息立即显示，无需等待 AI 回复
- **键盘快捷操作**：Enter 发送消息，Shift+Enter 换行

## 🛠️ 技术栈
| 技术/库                | 用途                     |
|------------------------|--------------------------|
| React + Vite           | 前端框架/构建工具        |
| TailwindCSS            | 原子化 CSS 样式库        |
| Axios/Fetch            | 网络请求（流式响应处理） |
| React-Markdown         | Markdown 解析渲染        |
| React-Syntax-Highlighter | 代码高亮               |

## ⚙️ 环境要求
- Node.js ≥ 16.x
- npm ≥ 7.x 或 yarn ≥ 1.22.x

## 🚀 快速开始
### 1. 安装依赖
```bash
# 进入前端目录
cd frontend

# 使用 npm 安装
npm install

# 或使用 yarn 安装
yarn install

# 使用npm启动
npm run dev

# 使用yarn启动
yarn dev