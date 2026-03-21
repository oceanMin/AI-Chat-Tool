import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

function App() {
  const [inputValue, setInputValue] = useState('');
  // 消息结构：{ id: string, role: 'user'|'assistant', content: string, isStreaming: boolean }
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 停止流式请求
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // 流式响应处理（打字效果）
  const handleStreamResponse = useCallback(async (aiMsgId, userContent, history) => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const response = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userContent, history: history }),
        signal: signal,
      });

      if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        const chunk = decoder.decode(value, { stream: true });
        // 逐字延迟显示（模拟真实打字速度，可调整delay）
        for (const char of chunk) {
          fullText += char;
          // 20ms延迟，打字更自然
          await new Promise(resolve => setTimeout(resolve, 20));
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiMsgId ? { ...msg, content: fullText } : msg
            )
          );
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMsgId
              ? { ...msg, content: `❌ 发送失败：${err.message}` }
              : msg
          )
        );
      }
    } finally {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg
        )
      );
      abortControllerRef.current = null;
    }
  }, []);

  // 发送消息
  const handleSend = useCallback(
    async (e) => {
      e.preventDefault();
      const content = inputValue.trim();
      if (!content || messages.some(msg => msg.isStreaming)) return;

      // 生成唯一ID
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();

      // 立即显示用户消息
      const userMsg = {
        id: userMsgId,
        role: 'user',
        content: content,
        isStreaming: false,
      };

      // 初始化AI消息（流式中状态）
      const aiMsg = {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages(prev => [...prev, userMsg, aiMsg]);
      setInputValue('');

      // 构建历史记录
      const history = [];
      for (let i = 0; i < messages.length; i += 2) {
        if (messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant') {
          history.push([messages[i].content, messages[i + 1].content]);
        }
      }

      // 启动流式请求
      handleStreamResponse(aiMsgId, content, history);
    },
    [inputValue, messages, handleStreamResponse]
  );

  // 代码块渲染（Markdown高亮）
  const CodeBlock = ({ node, inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      );
    }
    const match = /language-(\w+)/.exec(className || '');
    return (
      <SyntaxHighlighter
        style={dracula}
        language={match ? match[1] : 'text'}
        PreTag="div"
        customStyle={{ margin: '8px 0', borderRadius: '8px' }}
        {...props}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  };

  return (
    <div className="chat-container">
      {/* 头部 */}
      <div className="chat-header">
        <h1 className="chat-title">AI对话助手</h1>
      </div>

      {/* 聊天内容区 */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-10">
            开始和AI聊天吧！
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.role === 'user' ? 'message-user' : 'message-ai'}`}
          >
            {/* 头像 */}
            <div className={`avatar ${msg.role === 'user' ? 'avatar-user' : 'avatar-ai'}`}>
              {msg.role === 'user' ? 'U' : 'AI'}  // 先简单处理，后面可替换为头像图片
            </div>

            {/* 消息气泡 */}
            <div
              className={`message-bubble ${msg.role === 'user'
                  ? 'message-bubble-user'
                  : msg.isStreaming
                    ? 'loading-bubble'
                    : 'message-bubble-ai'
                }`}
            >
              {msg.role === 'user' ? (
                <span>{msg.content}</span>
              ) : msg.isStreaming && !msg.content ? (
                <span>AI正在思考...</span>
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown components={{ code: CodeBlock }}>
                    {msg.content}
                  </ReactMarkdown>
                  {/* 新增：流式中显示闪烁光标 */}
                  {msg.isStreaming && <span className="typing-cursor"></span>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="chat-input">
        <form onSubmit={handleSend} className="input-wrapper">
          <textarea
            className="input-box"
            rows={1}
            placeholder="输入你的问题（Enter发送，Shift+Enter换行）"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={messages.some(msg => msg.isStreaming)}
          />
          <button
            type="submit"
            className="send-button"
            disabled={messages.some(msg => msg.isStreaming)}
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;