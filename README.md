# AI-Chat-Tool
一个开箱即用的AI对话小工具，前后端分离架构，支持流式输出、Markdown渲染、代码高亮等现代化聊天体验。

# AI Chat Tool - Backend

AI 对话工具的后端服务，基于 FastAPI 开发的简单对话，提供聊天 API 接口，支持普通对话和流式对话（打字效果）。

## 技术栈

- **Web 框架**: FastAPI
- **异步 HTTP**: httpx
- **服务器**: Uvicorn
- **环境管理**: python-dotenv

## 项目结构
backend/
├── main.py # 应用入口（唯一核心文件）
├── .env # 环境变量
├── venv # 虚拟环境


## 快速开始

### 1. 环境要求

- Python 3.9+

### 2. 安装依赖

```bash
# 克隆项目
git clone https://github.com/your-username/ai-chat-tool.git
cd ai-chat-tool/backend

# 创建虚拟环境（可选）
python -m venv venv
# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
# 开发模式（热重载）
python main.py

# 或使用 uvicorn
uvicorn main:app --reload --port 8001
访问 http://localhost:8001/docs 查看 API 文档。