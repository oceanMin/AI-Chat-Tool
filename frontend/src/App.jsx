import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 配置：打字延迟（毫秒）
const TYPE_DELAY = 50;

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
  const [darkMode, setDarkMode] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false); // 控制输入框禁用
  const abortControllerRef = useRef(null); // 用于终止请求
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

  // 清空当前会话
  const clearCurrentSession = () => {
    if (!activeId) return;
    updateSession(activeId, () => ({ messages: [] }));
  };

  // 删除单条会话
  const deleteSession = (id) => {
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    saveSessions(newSessions);
    if (activeId === id) {
      setActiveId(newSessions.length ? newSessions[0].id : null);
    }
  };

  // 重命名会话
  const startRename = (id, currentTitle) => {
    setRenameId(id);
    setNewTitle(currentTitle);
  };
  const confirmRename = () => {
    if (!renameId || !newTitle.trim()) return;
    updateSession(renameId, () => ({ title: newTitle.trim() }));
    setRenameId(null);
    setNewTitle('');
  };

  // 一键清空所有历史
  const clearAllSessions = () => {
    if (window.confirm('确定要清空所有会话历史吗？此操作不可恢复！')) {
      const newSession = { id: Date.now().toString(), title: '新对话', messages: [] };
      setSessions([newSession]);
      saveSessions([newSession]);
      setActiveId(newSession.id);
    }
  };

  // 逐字打字函数
  const typeTextEffect = useCallback((sid, aiIndex, fullText) => {
    let current = '';
    const chars = fullText.split('');
    const timeouts = [];

    for (let i = 0; i < chars.length; i++) {
      const timeout = setTimeout(() => {
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
      timeouts.push(timeout);
    }

    // 保存 timeout 列表，用于终止时清除
    abortControllerRef.current = { timeouts };

    // 全部打完关闭光标
    setTimeout(() => {
      updateSession(sid, s => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) msgs[aiIndex].streaming = false;
        return { messages: msgs };
      });
      setIsLoading(false); // 恢复输入框
    }, chars.length * TYPE_DELAY);

    // 返回清理函数
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  // 终止回答
  const stopAnswer = () => {
    if (!abortControllerRef.current) return;

    // 1. 清除打字定时器
    if (abortControllerRef.current.timeouts) {
      abortControllerRef.current.timeouts.forEach(clearTimeout);
    }

    // 2. 终止 fetch 请求
    if (abortControllerRef.current.controller) {
      abortControllerRef.current.controller.abort();
    }

    // 3. 关闭 AI 思考状态
    const current = getActiveSession();
    if (current.id) {
      const aiIndex = current.messages.length;
      updateSession(current.id, s => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) {
          msgs[aiIndex].streaming = false;
        }
        return { messages: msgs };
      });
    }

    setIsLoading(false); // 恢复输入框
  };

  // 发送消息
  const sendMessage = async (e) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt || isLoading) return; // 加载中禁止重复发送

    const current = getActiveSession();
    if (!current.id) return;
    const sid = current.id;

    setIsLoading(true); // 禁用输入框

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

    // 3. 构建历史
    const history = [];
    for (let i = 0; i < current.messages.length; i += 2) {
      const u = current.messages[i]?.content;
      const a = current.messages[i + 1]?.content;
      if (u && a) history.push([u, a]);
    }

    try {
      // 创建 AbortController 用于终止请求
      const controller = new AbortController();
      abortControllerRef.current = { controller };

      const res = await fetch('http://localhost:8001/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, history }),
        signal: controller.signal, // 绑定终止信号
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

      // 开始逐字打字
      typeTextEffect(sid, aiIndex, fullText);

    } catch (err) {
      if (err.name === 'AbortError') {
        // 用户主动终止，不显示错误
        return;
      }
      updateSession(sid, s => {
        const msgs = [...s.messages];
        if (msgs[aiIndex]) {
          msgs[aiIndex].content = '❌ 连接失败，请检查后端服务';
          msgs[aiIndex].streaming = false;
        }
        return { messages: msgs };
      });
      setIsLoading(false);
    }
  };

  return (
    <div className={`h-screen flex ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* 左侧会话栏 */}
      <div className={`w-64 border-r p-3 flex flex-col ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex gap-2 mb-3">
          <button
            onClick={createSession}
            className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm"
          >
            + 新建对话
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg ${darkMode ? 'bg-yellow-400' : 'bg-gray-200'}`}
            title="切换深色模式"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={clearCurrentSession}
            className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm"
          >
            清空当前会话
          </button>
          <button
            onClick={clearAllSessions}
            className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm"
          >
            清空所有
          </button>
        </div>

        <div className="overflow-y-auto space-y-2">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`p-2 rounded cursor-pointer flex items-center justify-between group ${
                activeId === s.id
                  ? darkMode ? 'bg-blue-900' : 'bg-blue-100'
                  : darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
              onClick={() => setActiveId(s.id)}
            >
              {renameId === s.id ? (
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                  className="w-full bg-transparent outline-none text-sm"
                />
              ) : (
                <span className="truncate text-sm flex-1">{s.title || '未命名'}</span>
              )}

              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(s.id, s.title);
                  }}
                  className="text-xs text-blue-500"
                >
                  重命名
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  className="text-xs text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 聊天区 */}
      <div className="flex-1 flex flex-col">
        <div className={`p-4 border-b font-bold ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
          AI 对话助手
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeSession.messages.map((m, i) => (
            <div key={i} className={`flex items-start gap-3 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
              {/* 头像 */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                m.role === 'user' ? 'bg-blue-500' : 'bg-green-500'
              }`}>
                {m.role === 'user' ? 'U' : 'AI'}
              </div>

              {/* 气泡 */}
              <div className={`px-4 py-2 rounded-2xl ${
                m.role === 'user'
                  ? darkMode ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-blue-500 text-white rounded-tr-none'
                  : darkMode ? 'bg-gray-700 text-gray-200 rounded-tl-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'
              }`}>
                {m.role === 'user' ? (
                  m.content
                ) : (
                  <div>
                    {m.content === '' && m.streaming ? (
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>AI正在思考中……</span>
                    ) : (
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return inline ? (
                              <code className={`px-1 rounded text-sm ${darkMode ? 'bg-gray-600' : 'bg-gray-100'}`}>{children}</code>
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
                    {m.streaming && <span className="inline-block w-1.5 h-4 bg-gray-600 ml-1 animate-blink align-middle"></span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* 输入框 + 终止按钮 */}
        <div className={`p-3 border-t flex gap-2 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`flex-1 border rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            rows="1"
            placeholder={isLoading ? 'AI正在思考中，无法输入...' : '输入消息...'}
            disabled={isLoading} // 思考中禁用输入
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
              className="bg-gray-500 text-white px-5 py-3 rounded-full"
            >
              发送
            </button>
          ) : (
            <button
              type="submit"
              onClick={sendMessage}
              className="bg-blue-500 text-white px-5 py-3 rounded-full"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}