import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 本地存储工具
const STORAGE_KEY = 'CHAT_SESSIONS';
const loadSessions = () => JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
const saveSessions = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

export default function App() {
  const [sessions, setSessions] = useState(loadSessions());
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  // 自动加载最近会话
  useEffect(() => {
    if (sessions.length && !activeId) setActiveId(sessions[0].id);
  }, [sessions]);

  // 自动滚动
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, sessions]);

  // 获取当前会话
  const activeSession = sessions.find(s => s.id === activeId) || { messages: [] };

  // 新建对话
  const createSession = () => {
    const newSession = {
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setActiveId(newSession.id);
  };

  // 更新会话
  const updateSession = (sessionId, updater) => {
    const updated = sessions.map(s => s.id === sessionId ? { ...s, ...updater(s) } : s);
    setSessions(updated);
    saveSessions(updated);
  };

  // 发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt) return;

    if (!activeId) createSession();
    const sid = activeId || sessions[0]?.id;

    // 加入用户消息
    const userMsg = { role: 'user', content: txt };
    updateSession(sid, s => ({
      messages: [...s.messages, userMsg],
      title: s.title === '新对话' ? txt.slice(0, 15) + '...' : s.title,
    }));
    setInput('');

    // 加入AI占位消息
    updateSession(sid, s => ({ messages: [...s.messages, { role: 'assistant', content: '', streaming: true }] }));
    const msgIndex = sessions.find(s => s.id === sid).messages.length + 1;

    // 构建历史
    const history = [];
    const msgs = sessions.find(s => s.id === sid)?.messages || [];
    for (let i = 0; i < msgs.length; i += 2) {
      const u = msgs[i]?.content;
      const a = msgs[i + 1]?.content;
      if (u && a) history.push([u, a]);
    }

    try {
      const res = await fetch('http://localhost:8001/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, history }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);

        updateSession(sid, s => {
          const newMsgs = [...s.messages];
          newMsgs[msgIndex] = { ...newMsgs[msgIndex], content: full, streaming: true };
          return { messages: newMsgs };
        });
      }

      updateSession(sid, s => {
        const newMsgs = [...s.messages];
        newMsgs[msgIndex] = { ...newMsgs[msgIndex], streaming: false };
        return { messages: newMsgs };
      });

    } catch (err) {
      updateSession(sid, s => {
        const newMsgs = [...s.messages];
        newMsgs[msgIndex] = { content: '❌ 连接失败', streaming: false };
        return { messages: newMsgs };
      });
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* 左侧会话栏 */}
      <div className="w-56 border-r bg-white p-3 flex flex-col">
        <button onClick={createSession} className="mb-3 bg-blue-500 text-white py-2 rounded-lg">+ 新建对话</button>
        <div className="overflow-y-auto space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`p-2 rounded cursor-pointer truncate text-sm ${activeId === s.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
            >
              {s.title}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧聊天区 */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b bg-white shadow-sm font-bold">AI 对话助手</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeSession.messages.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${m.role === 'user' ? 'bg-blue-500' : 'bg-green-500'}`}>
                {m.role === 'user' ? 'U' : 'AI'}
              </div>
              <div className={`px-4 py-2 rounded-2xl ${m.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'}`}>
                {m.role === 'user' ? m.content : (
                  <div>
                    <ReactMarkdown
                      components={{
                        code({ inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          return inline ? (
                            <code className="bg-gray-100 px-1 rounded text-sm" {...props}>{children}</code>
                          ) : (
                            <SyntaxHighlighter style={dracula} language={match?.[1] || 'text'} {...props}>
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          );
                        }
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                    {m.streaming && <span className="inline-block w-1.5 h-4 bg-gray-500 ml-1 animate-blink"></span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

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