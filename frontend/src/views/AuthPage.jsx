import { useState } from 'react';

const USER_STORAGE_PREFIX = 'USER_';
const LOGGED_IN_USER = 'CHAT_USER';
const SESSION_STORAGE_PREFIX = 'CHAT_SESSIONS_';

export default function AuthPage({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '' });

  // 初始化用户默认会话
  const initUserSession = (username) => {
    const sessionKey = SESSION_STORAGE_PREFIX + username;
    if (!localStorage.getItem(sessionKey)) {
      const defaultSession = {
        id: Date.now().toString(),
        title: '新对话',
        messages: []
      };
      localStorage.setItem(sessionKey, JSON.stringify([defaultSession]));
    }
  };

  // 登录
  const handleLogin = () => {
    const { username, password } = form;
    if (!username || !password) return alert('请输入账号密码');

    const userStr = localStorage.getItem(USER_STORAGE_PREFIX + username);
    if (!userStr) return alert('用户不存在');

    const user = JSON.parse(userStr);
    if (user.password !== password) return alert('密码错误');

    // 初始化会话
    initUserSession(username);
    localStorage.setItem(LOGGED_IN_USER, JSON.stringify(user));
    onLoginSuccess(user);
  };

  // 注册
  const handleRegister = () => {
    const { username, password } = form;
    if (!username || !password) return alert('请输入账号密码');

    if (localStorage.getItem(USER_STORAGE_PREFIX + username)) {
      return alert('用户名已存在');
    }

    const newUser = {
      username,
      password,
      avatar: `https://picsum.photos/seed/${username}/200/200`,
    };

    localStorage.setItem(USER_STORAGE_PREFIX + username, JSON.stringify(newUser));
    // 注册时创建默认会话
    initUserSession(username);
    localStorage.setItem(LOGGED_IN_USER, JSON.stringify(newUser));
    onLoginSuccess(newUser);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-bold mb-5 text-center">
          {isLogin ? '用户登录' : '用户注册'}
        </h2>

        <input
          className="w-full border border-gray-300 rounded-lg p-3 mb-3 outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="请输入用户名"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />

        <input
          className="w-full border border-gray-300 rounded-lg p-3 mb-5 outline-none focus:ring-2 focus:ring-blue-400"
          type="password"
          placeholder="请输入密码"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <button
          onClick={isLogin ? handleLogin : handleRegister}
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium"
        >
          {isLogin ? '登录' : '注册'}
        </button>

        <button
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-gray-500 text-sm mt-4"
        >
          {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </div>
    </div>
  );
}