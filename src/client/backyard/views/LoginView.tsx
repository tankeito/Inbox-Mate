import React, { useState, useEffect } from 'react';
import { Shield, Lock, Mail, KeyRound, AlertCircle, ArrowRight, Loader2, Monitor, Sun, Moon, ChevronDown } from 'lucide-react';
import { backyardApi } from '../api';
import type { AdminUser } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: AdminUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('inbox_mate_theme') as any) || 'system';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('inbox_mate_theme', themeMode);
    let resolvedTheme = themeMode;
    if (themeMode === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleMediaChange = () => {
      if (themeMode === 'system') {
        document.documentElement.setAttribute('data-theme', mediaQuery.matches ? 'light' : 'dark');
      }
    };
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, [themeMode]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('请填写管理员邮箱与登录密码');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await backyardApi.login(email.trim(), password);
      if (res.require2FA && res.tempToken) {
        setTempToken(res.tempToken);
        setError(null);
      } else if (res.token && res.user) {
        localStorage.setItem('backyard_token', res.token);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim() || totpCode.trim().length !== 6) {
      setError('请输入 6 位有效动态验证码');
      return;
    }

    if (!tempToken) {
      setError('验证凭据失效，请返回重新登录');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await backyardApi.verify2FA(tempToken, totpCode.trim());
      if (res.token && res.user) {
        localStorage.setItem('backyard_token', res.token);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || '2FA 验证码错误，请重新输入');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--by-bg-app)',
      padding: '20px',
      position: 'relative'
    }}>
      {/* Top Right Theme Selector */}
      <div style={{ position: 'absolute', top: '20px', right: '24px' }}>
        <div className="by-theme-dropdown-container">
          <button
            type="button"
            className="by-theme-trigger-btn"
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            title="切换主题模式 (跟随系统 / 亮色模式 / 暗色模式)"
          >
            {themeMode === 'light' ? (
              <Sun size={15} color="#d97706" />
            ) : themeMode === 'dark' ? (
              <Moon size={15} color="#38bdf8" />
            ) : (
              <Monitor size={15} />
            )}
            <ChevronDown size={12} />
          </button>

          {isThemeMenuOpen && (
            <div className="by-theme-menu" onClick={() => setIsThemeMenuOpen(false)}>
              <button
                type="button"
                className={`by-theme-option ${themeMode === 'system' ? 'active' : ''}`}
                onClick={() => setThemeMode('system')}
              >
                <Monitor size={14} />
                <span>跟随系统</span>
              </button>
              <button
                type="button"
                className={`by-theme-option ${themeMode === 'light' ? 'active' : ''}`}
                onClick={() => setThemeMode('light')}
              >
                <Sun size={14} color="#d97706" />
                <span>亮色模式</span>
              </button>
              <button
                type="button"
                className={`by-theme-option ${themeMode === 'dark' ? 'active' : ''}`}
                onClick={() => setThemeMode('dark')}
              >
                <Moon size={14} color="#38bdf8" />
                <span>暗色模式</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="by-card" style={{
        maxWidth: '440px',
        width: '100%',
        padding: '36px 30px',
        boxShadow: 'var(--by-shadow-xl)',
        border: '1px solid var(--by-border-strong)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3)',
            marginBottom: '16px'
          }}>
            <Shield size={28} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--by-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            Inbox Mate 后台管理
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--by-text-secondary)', marginTop: '6px' }}>
            {tempToken ? '请输入身份验证器 6 位动态验证码' : '安全管理与自动化调度控制台'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            backgroundColor: 'var(--by-danger-bg)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--by-danger)',
            fontSize: '0.86rem',
            marginBottom: '20px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {!tempToken ? (
          /* Step 1: Username & Password Form */
          <form onSubmit={handlePasswordSubmit}>
            <div className="by-input-group">
              <label className="by-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} /> 管理员邮箱
              </label>
              <input
                type="email"
                className="by-input"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div className="by-input-group" style={{ marginTop: '14px' }}>
              <label className="by-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} /> 登录密码
              </label>
              <input
                type="password"
                className="by-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              className="by-btn by-btn-primary"
              style={{ width: '100%', padding: '12px', marginTop: '20px', fontSize: '0.96rem' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> 正在登录...
                </>
              ) : (
                <>
                  安全登录 <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: 2FA TOTP Form */
          <form onSubmit={handle2FASubmit}>
            <div className="by-input-group">
              <label className="by-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <KeyRound size={14} /> 2FA 动态口令
              </label>
              <input
                type="text"
                className="by-input"
                placeholder="6 位数字 (如 849201)"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
                style={{
                  textAlign: 'center',
                  fontSize: '1.4rem',
                  letterSpacing: '6px',
                  fontWeight: 700,
                  fontFamily: 'var(--by-font-mono)'
                }}
                autoFocus
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--by-text-muted)', textAlign: 'center', marginTop: '4px' }}>
                请打开 Google Authenticator / 1Password 获取实时验证码
              </span>
            </div>

            <button
              type="submit"
              className="by-btn by-btn-primary"
              style={{ width: '100%', padding: '12px', marginTop: '16px', fontSize: '0.96rem' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> 正在校验...
                </>
              ) : (
                '验证并进入后台'
              )}
            </button>

            <button
              type="button"
              className="by-btn by-btn-secondary"
              style={{ width: '100%', marginTop: '10px', fontSize: '0.85rem' }}
              onClick={() => {
                setTempToken(null);
                setTotpCode('');
                setError(null);
              }}
              disabled={loading}
            >
              返回账号密码登录
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--by-text-muted)' }}>
          Inbox Mate 2.4.0 • 本地安全沙盒与 API 管理中枢
        </div>
      </div>
    </div>
  );
};
