import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import AuthPage from './views/AuthPage';

// 配置
const TYPE_DELAY = 50;
const LOGGED_IN_USER = 'CHAT_USER';
const SESSION_STORAGE_PREFIX = 'CHAT_SESSIONS_';

// 加载对应用户的会话
const loadUserSessions = (username) => {
  try {
    const key = SESSION_STORAGE_PREFIX + username;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

// 保存对应用户的会话
const saveUserSessions = (username, sessions) => {
  const key = SESSION_STORAGE_PREFIX + username;
  localStorage.setItem(key, JSON.stringify(sessions));
};

const getCurrentUser = () => {
  try {
    const u = localStorage.getItem(LOGGED_IN_USER);
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState(getCurrentUser);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef(null);
  const scrollRef = useRef(null);

  // 登录后加载用户会话
  useEffect(() => {
    if (user) {
      const userSessions = loadUserSessions(user.username);
      setSessions(userSessions);
      if (userSessions.length > 0) {
        setActiveId(userSessions[0].id);
      } else {
        // 兜底：创建默认会话
        const def = { id: Date.now().toString(), title: '新对话', messages: [] };
        setSessions([def]);
        setActiveId(def.id);
        saveUserSessions(user.username, [def]);
      }
    } else {
      setSessions([]);
      setActiveId(null);
    }
  }, [user]);

  // 自动滚动
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(timer);
  }, [activeId, sessions]);

  // 获取当前会话
  const getActiveSession = () => {
    const found = sessions.find((s) => s.id === activeId);
    return found || { id: null, title: '', messages: [] };
  };

  const activeSession = getActiveSession();

  // 会话操作（按用户保存）
  const createSession = () => {
    if (!user) return;
    const ns = { id: Date.now().toString(), title: '新对话', messages: [] };
    const newList = [ns, ...sessions];
    setSessions(newList);
    saveUserSessions(user.username, newList);
    setActiveId(ns.id);
  };

  const updateSession = (sid, updater) => {
    if (!user) return;
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === sid ? { ...s, ...updater(s) } : s));
      saveUserSessions(user.username, updated);
      return updated;
    });
  };

  const clearCurrentSession = () => {
    if (!activeId || !user) return;
    updateSession(activeId, () => ({ messages: [] }));
  };

  const deleteSession = (sid) => {
    if (!user) return;
    const filtered = sessions.filter((s) => s.id !== sid);
    setSessions(filtered);
    saveUserSessions(user.username, filtered);
    if (activeId === sid) {
      setActiveId(filtered[0]?.id || null);
    }
  };

  const startRename = (sid, title) => {
    setRenameId(sid);
    setNewTitle(title);
  };

  const confirmRename = () => {
    if (!renameId || !newTitle.trim() || !user) return;
    updateSession(renameId, () => ({ title: newTitle.trim() }));
    setRenameId(null);
  };

  const clearAllSessions = () => {
    if (!user) return;
    if (window.confirm('确定要清空所有会话吗？')) {
      const ns = { id: Date.now().toString(), title: '新对话', messages: [] };
      setSessions([ns]);
      saveUserSessions(user.username, [ns]);
      setActiveId(ns.id);
    }
  };

  // 打字动画 + 终止
  const typeTextEffect = useCallback((sid, aiIndex, fullText) => {
    let current = '';
    const chars = fullText.split('');
    const timers = [];

    chars.forEach((c, i) => {
      const timer = setTimeout(() => {
        current += c;
        updateSession(sid, (s) => {
          const msgs = [...s.messages];
          if (msgs[aiIndex]) {
            msgs[aiIndex].content = current;
            msgs[aiIndex].streaming = true;
          }
          return { messages: msgs };
        });
      }, i * TYPE_DELAY);
      timers.push(timer);
    });

    abortControllerRef.current = { timers };

    setTimeout(() => {
      updateSession(sid, (s) => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) msgs[aiIndex].streaming = false;
        return { messages: msgs };
      });
      setIsLoading(false);
    }, chars.length * TYPE_DELAY);

    return () => timers.forEach(clearTimeout);
  }, []);

  const stopAnswer = () => {
    if (!abortControllerRef.current) return;
    if (abortControllerRef.current.timers) {
      abortControllerRef.current.timers.forEach(clearTimeout);
    }
    if (abortControllerRef.current.controller) {
      abortControllerRef.current.controller.abort();
    }
    updateSession(activeId, (s) => {
      const msgs = [...s.messages];
      if (msgs[msgs.length - 1]) msgs[msgs.length - 1].streaming = false;
      return { messages: msgs };
    });
    setIsLoading(false);
  };

  // 发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt || isLoading || !user) return;

    const cur = getActiveSession();
    if (!cur.id) return;
    const sid = cur.id;
    setIsLoading(true);

    // 用户消息
    const userMsg = { role: 'user', content: txt };
    const afterUser = [...cur.messages, userMsg];
    updateSession(sid, () => ({
      messages: afterUser,
      title: cur.title === '新对话' ? txt.slice(0, 16) + '...' : cur.title,
    }));
    setInput('');

    // AI占位
    const aiMsg = { role: 'assistant', content: '', streaming: true };
    const finalList = [...afterUser, aiMsg];
    updateSession(sid, () => ({ messages: finalList }));
    const aiIndex = finalList.length - 1;

    // 历史
    const history = [];
    for (let i = 0; i < cur.messages.length; i += 2) {
      const u = cur.messages[i]?.content;
      const a = cur.messages[i + 1]?.content;
      if (u && a) history.push([u, a]);
    }

    try {
      const controller = new AbortController();
      abortControllerRef.current = { controller };

      const res = await fetch('http://localhost:8001/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, history }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('服务异常');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      typeTextEffect(sid, aiIndex, fullText);
    } catch (err) {
      updateSession(sid, (s) => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) {
          msgs[aiIndex] = { role: 'assistant', content: '❌ 连接失败', streaming: false };
        }
        return { messages: msgs };
      });
      setIsLoading(false);
    }
  };

  // 退出登录
  const logout = () => {
    localStorage.removeItem(LOGGED_IN_USER);
    setUser(null);
  };

  // 未登录 → 跳登录页
  if (!user) {
    return <AuthPage onLoginSuccess={setUser} />;
  }

  // 主界面
  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* 左侧栏 */}
      <div className={`w-64 border-r flex flex-col ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        {/* 用户信息 */}
        <div className="p-3 border-b flex items-center gap-2">
          <img src={user.avatar} className="w-10 h-10 rounded-full object-cover" />
          <div className="flex-1">
            <div className="text-sm font-medium">{user.username}</div>
            <button onClick={logout} className="text-xs text-red-500">退出登录</button>
          </div>
        </div>

        <div className="p-3 flex gap-2">
          <button onClick={createSession} className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm">+ 新建对话</button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg">{darkMode ? '☀️' : '🌙'}</button>
        </div>

        <div className="px-3 pb-3 flex gap-2">
          <button onClick={clearCurrentSession} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm">清空当前</button>
          <button onClick={clearAllSessions} className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm">清空所有</button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`p-2 rounded flex justify-between items-center cursor-pointer group text-sm ${activeId === s.id ? (darkMode ? 'bg-blue-900' : 'bg-blue-100') : 'hover:bg-gray-100'
                }`}
            >
              {renameId === s.id ? (
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                  className="bg-transparent outline-none w-full"
                />
              ) : (
                <span className="truncate flex-1">{s.title}</span>
              )}

              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(s.id, s.title); }}
                  className="text-xs text-blue-500"
                >
                  重命名
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="text-xs text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 聊天区域 */}
      <div className="flex-1 flex flex-col">
        <div className={`p-4 border-b font-bold ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>AI 对话助手</div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeSession.messages.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
              <img
                src={m.role === 'user' ? user.avatar : 'https://picsum.photos/seed/ai/200/200'}
                className="w-8 h-8 rounded-full object-cover"
              />
              <div
                className={`px-4 py-2 rounded-2xl ${m.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : darkMode
                      ? 'bg-gray-700 text-gray-200'
                      : 'bg-gray-200 text-gray-800'
                  }`}
              >
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <div>
                    {m.content === '' && m.streaming ? (
                      <span className="text-gray-400">AI正在思考中……</span>
                    ) : (
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return inline ? (
                              <code className={`px-1 rounded text-sm ${darkMode ? 'bg-gray-600' : 'bg-gray-100'}`}>
                                {children}
                              </code>
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
          <div ref={scrollRef}></div>
        </div>

        {/* 输入框 */}
        <div className={`p-4 border-t flex gap-3 items-end ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`flex-1 px-4 py-3 border rounded-lg min-h-[60px] max-h-[120px] resize-none
      outline-none text-base
      ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200 text-gray-800'}
      ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={isLoading}
            placeholder="输入消息..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
          />

          {isLoading ? (
            <button
              onClick={stopAnswer}
              className="w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              title="停止生成"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h12v16H6z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={sendMessage}
              className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              title="发送"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.017 21.5L23 12 2.017 2.5 2 8.999 17 12 2 15z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}