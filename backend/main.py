from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
import json

# 加载环境变量
load_dotenv()

app = FastAPI(title="AI Chat API")

# 跨域配置（生产环境替换为实际域名）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    history: list = []

# 非流式接口
@app.post("/api/chat")
async def chat(request: ChatRequest):
    api_base = os.getenv("API_BASE_URL")
    api_key = os.getenv("API_KEY")
    model_name = os.getenv("MODEL_NAME")

    messages = [{"role": "user", "content": request.message}]
    for idx, (user_msg, ai_msg) in enumerate(request.history):
        messages.insert(idx*2, {"role": "user", "content": user_msg})
        messages.insert(idx*2+1, {"role": "assistant", "content": ai_msg})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.7,
                    "stream": False
                }
            )
        response.raise_for_status()
        result = response.json()
        ai_reply = result["choices"][0]["message"]["content"].strip()
        new_history = request.history + [[request.message, ai_reply]]
        return {"reply": ai_reply, "history": new_history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 流式接口（适配打字效果）
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    api_base = os.getenv("API_BASE_URL")
    api_key = os.getenv("API_KEY")
    model_name = os.getenv("MODEL_NAME")

    # 构建完整对话历史
    messages = []
    for user_msg, ai_msg in request.history:
        messages.append({"role": "user", "content": user_msg})
        messages.append({"role": "assistant", "content": ai_msg})
    messages.append({"role": "user", "content": request.message})

    async def generate_stream():
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": messages,
                        "temperature": 0.7,
                        "stream": True,
                        "max_tokens": 4096
                    },
                    timeout=60
                )
            response.raise_for_status()

            # 逐行解析流式响应（兼容OpenAI/通义千问格式）
            async for line in response.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                # 处理OpenAI流式格式：data: {json}
                if line.startswith("data: "):
                    line = line[6:]
                # 结束标记
                if line == "[DONE]":
                    break
                # 解析JSON内容
                try:
                    chunk = json.loads(line)
                    # 兼容不同模型的delta格式
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        # 逐字返回，确保前端打字效果
                        yield content
                except json.JSONDecodeError:
                    continue
        except Exception as e:
            yield f"❌ 出错了：{str(e)}"

    return StreamingResponse(generate_stream(), media_type="text/plain")

# 健康检查
@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8001)), reload=True)