import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 配置：打字延迟（毫秒）
const TYPE_DELAY = 40; // 数字越小打字越快，越大越慢

// 本地存储
const STORAGE_KEY = 'CHAT_SESSIONS';
const loadSessions = () => {
  try {
    const items = localStorage.getItem(STORAGE_KEY);
    return items ? JSON.parse(items) : [];
  } catch {
    return [];
  }
};
const saveSessions = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

export default function App() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  // 初始化
  useEffect(() => {
    if (sessions.length > 0) {
      setActiveId(sessions[0].id);
    } else {
      const newSession = { id: Date.now().toString(), title: '新对话', messages: [] };
      const newSessions = [newSession];
      setSessions(newSessions);
      saveSessions(newSessions);
      setActiveId(newSession.id);
    }
  }, []);

  // 自动滚动
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [activeId, sessions]);

  // 安全获取会话
  const getActiveSession = () => {
    const found = sessions.find(s => s.id === activeId);
    if (!found) return { id: null, title: '', messages: [] };
    return {
      ...found,
      messages: (found.messages || []).filter(Boolean).map(m => ({
        role: m.role || 'user',
        content: m.content || '',
        streaming: m.streaming ?? false,
        tempText: m.tempText || '',
      })),
    };
  };
  const activeSession = getActiveSession();

  // 新建对话
  const createSession = () => {
    const newSession = { id: Date.now().toString(), title: '新对话', messages: [] };
    const newSessions = [newSession, ...sessions];
    setSessions(newSessions);
    saveSessions(newSessions);
    setActiveId(newSession.id);
  };

  // 更新会话
  const updateSession = (sessionId, updater) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === sessionId ? { ...s, ...updater(s) } : s);
      saveSessions(updated);
      return updated;
    });
  };

  // 核心：逐字打字函数（带延迟）
  const typeTextEffect = (sid, aiIndex, fullText) => {
    let current = '';
    const chars = fullText.split('');

    for (let i = 0; i < chars.length; i++) {
      setTimeout(() => {
        current += chars[i];
        updateSession(sid, s => {
          const msgs = [...s.messages];
          if (msgs[aiIndex]) {
            msgs[aiIndex].content = current;
            msgs[aiIndex].streaming = true;
          }
          return { messages: msgs };
        });
      }, i * TYPE_DELAY);
    }
  };

  // 发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt) return;

    const current = getActiveSession();
    if (!current.id) return;
    const sid = current.id;

    // 1. 用户消息
    const userMsg = { role: 'user', content: txt };
    const newMsgList = [...current.messages, userMsg];
    updateSession(sid, () => ({
      messages: newMsgList,
      title: current.title === '新对话' ? txt.slice(0, 18) + '...' : current.title,
    }));
    setInput('');

    // 2. AI 占位（思考中）
    const aiMsg = { role: 'assistant', content: '', streaming: true };
    const finalList = [...newMsgList, aiMsg];
    updateSession(sid, () => ({ messages: finalList }));
    const aiIndex = finalList.length - 1;

    // 3. 历史
    const history = [];
    for (let i = 0; i < current.messages.length; i += 2) {
      const u = current.messages[i]?.content;
      const a = current.messages[i + 1]?.content;
      if (u && a) history.push([u, a]);
    }

    try {
      const res = await fetch('http://localhost:8001/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, history }),
      });

      if (!res.ok) throw new Error('服务连接失败');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      // ✅ 全部接收后，开始逐字打字
      typeTextEffect(sid, aiIndex, fullText);

    } catch (err) {
      updateSession(sid, s => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) {
          msgs[aiIndex].content = '❌ 连接失败，请检查后端服务';
          msgs[aiIndex].streaming = false;
        }
        return { messages: msgs };
      });
    }
  };

  // 页面渲染
  return (
    <div className="h-screen flex bg-gray-50">
      {/* 左侧会话栏 */}
      <div className="w-56 border-r bg-white p-3 flex flex-col">
        <button onClick={createSession} className="mb-3 bg-blue-500 text-white py-2 rounded-lg text-sm">
          + 新建对话
        </button>
        <div className="overflow-y-auto space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`p-2 rounded cursor-pointer truncate text-sm ${activeId === s.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
            >
              {s.title || '未命名'}
            </div>
          ))}
        </div>
      </div>

      {/* 聊天区 */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b bg-white shadow-sm font-bold">AI 对话助手</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeSession.messages.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
              {/* 头像 */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${m.role === 'user' ? 'bg-blue-500' : 'bg-green-500'}`}>
                {m.role === 'user' ? 'U' : 'AI'}
              </div>

              {/* 气泡 */}
              <div className={`px-4 py-2 rounded-2xl ${m.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'}`}>
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <div>
                    {/* 思考中提示 */}
                    {m.content === '' && m.streaming ? (
                      <span className="text-gray-500">AI思考中……</span>
                    ) : (
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return inline ? (
                              <code className="bg-gray-100 px-1 rounded text-sm">{children}</code>
                            ) : (
                              <SyntaxHighlighter style={dracula} language={match?.[1] || 'text'}>
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            );
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* 输入框 */}
        <form onSubmit={sendMessage} className="p-3 border-t bg-white flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 border rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
            rows="1"
            placeholder="输入消息..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
          />
          <button type="submit" className="bg-blue-500 text-white px-5 py-3 rounded-full">发送</button>
        </form>
      </div>
    </div>
  );
}