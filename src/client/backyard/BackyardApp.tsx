import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Key,
  Activity,
  Settings,
  LogOut,
  Shield,
  ExternalLink,
  ChevronDown,
  Monitor,
  Sun,
  Moon,
  Menu,
  X,
  Zap
} from 'lucide-react';
import { backyardApi } from './api';
import type { AdminUser } from './types';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { UsageLogsView } from './views/UsageLogsView';
import { ApiKeyView } from './views/ApiKeyView';
import { RpaStatusView } from './views/RpaStatusView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { SettingsView } from './views/SettingsView';
import { ConfirmModal } from './components/ConfirmModal';
import './backyard.css';

function getInitialTabFromUrl(): string {
  const path = window.location.pathname;
  if (path.includes('/backyard/logs')) return 'logs';
  if (path.includes('/backyard/keys')) return 'keys';
  if (path.includes('/backyard/rpa')) return 'rpa';
  if (path.includes('/backyard/diagnostics')) return 'diagnostics';
  if (path.includes('/backyard/settings')) return 'settings';
  return 'dashboard';
}

export const BackyardApp: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>(getInitialTabFromUrl());
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const res = await backyardApi.getMe();
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();

    const handlePopState = () => {
      setActiveTab(getInitialTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (tab: string) => {
    setActiveTab(tab);
    const subpath = tab === 'dashboard' ? '' : `/${tab}`;
    window.history.pushState({}, '', `/backyard${subpath}`);
  };

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await backyardApi.logout();
    } catch {}
    finally {
      setLogoutLoading(false);
      setShowLogoutModal(false);
      setUser(null);
      window.history.pushState({}, '', '/backyard');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--by-bg-app)', color: 'var(--by-text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--by-border-strong)', borderTopColor: 'var(--by-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px auto' }} />
          <div style={{ fontSize: '0.9rem' }}>正在验证后台权限...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={(u) => setUser(u)} />;
  }

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return '控制台总览';
      case 'logs':
        return '用户使用记录';
      case 'keys':
        return 'API Key 管理';
      case 'rpa':
        return 'Chrome RPA 状态与运维';
      case 'diagnostics':
        return 'Chrome RPA 与系统诊断';
      case 'settings':
        return '安全与系统设置';
      default:
        return '后台管理';
    }
  };

  return (
    <div className="by-app">
      <div className="by-layout">
        {/* Desktop Sidebar */}
        <aside className="by-sidebar">
          <div className="by-sidebar-header">
            <div className="by-brand-logo">
              <Shield size={20} />
            </div>
            <div>
              <div className="by-brand-title">
                Inbox Mate <span className="by-brand-badge">Backyard</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>系统管理中枢</div>
            </div>
          </div>

          <nav className="by-sidebar-nav">
            <button
              className={`by-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>控制台总览</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'rpa' ? 'active' : ''}`}
              onClick={() => navigateTo('rpa')}
            >
              <Zap size={18} />
              <span>Chrome RPA 运维</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => navigateTo('logs')}
            >
              <FileText size={18} />
              <span>使用记录审计</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'keys' ? 'active' : ''}`}
              onClick={() => navigateTo('keys')}
            >
              <Key size={18} />
              <span>API Key 发行与管理</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => navigateTo('diagnostics')}
            >
              <Activity size={18} />
              <span>Chrome RPA 诊断</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => navigateTo('settings')}
            >
              <Settings size={18} />
              <span>安全与 2FA 设置</span>
            </button>
          </nav>

          <div className="by-sidebar-footer">
            <div className="by-user-badge">
              <div className="by-user-avatar">
                {user.email.slice(0, 2).toUpperCase()}
              </div>
              <div className="by-user-info">
                <div className="by-user-name" title={user.email}>{user.email}</div>
                <div className="by-user-role">
                  {user.twoFactorEnabled ? '2FA 安全保护中' : '管理员 (未开2FA)'}
                </div>
              </div>
            </div>

            <button className="by-btn-icon" onClick={() => setShowLogoutModal(true)} title="退出后台">
              <LogOut size={16} color="var(--by-text-secondary)" />
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="by-main">
          {/* Header */}
          <header className="by-header">
            <div className="by-header-title">
              <span>{getPageTitle()}</span>
            </div>

            <div className="by-header-actions">
              {/* Theme Switcher Button & Dropdown matching Figure 2 */}
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

              <a
                href="/"
                className="by-btn by-btn-secondary by-btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>前台工作台</span>
                <ExternalLink size={13} />
              </a>

              <button
                className="by-btn by-btn-secondary by-btn-sm"
                onClick={() => setShowLogoutModal(true)}
              >
                <LogOut size={14} /> 退出
              </button>
            </div>
          </header>

          {/* View Container */}
          <main className="by-content">
            {activeTab === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
            {activeTab === 'rpa' && <RpaStatusView onNavigate={navigateTo} />}
            {activeTab === 'logs' && <UsageLogsView />}
            {activeTab === 'keys' && <ApiKeyView />}
            {activeTab === 'diagnostics' && <DiagnosticsView />}
            {activeTab === 'settings' && <SettingsView user={user} onUserUpdated={(u) => setUser(u)} />}
          </main>

          {/* Backyard Footer */}
          <footer className="by-footer">
            <div className="by-footer-left">
              <span style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>
                Inbox Mate Backyard
              </span>
              <span>© {new Date().getFullYear()} 系统管理中枢</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--by-success)' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--by-success)' }} />
                核心服务运行正常 (v1.0.0)
              </span>
            </div>

            <div className="by-footer-right">
              <span>Playwright Headless</span>
              <span>•</span>
              <span>SQLite 3.53 WAL</span>
              <span>•</span>
              <span>AES-256-GCM</span>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (< 768px) */}
      <nav className="by-mobile-nav">
        <button
          className={`by-mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => navigateTo('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>总览</span>
        </button>

        <button
          className={`by-mobile-nav-item ${activeTab === 'rpa' ? 'active' : ''}`}
          onClick={() => navigateTo('rpa')}
        >
          <Zap size={18} />
          <span>RPA</span>
        </button>

        <button
          className={`by-mobile-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => navigateTo('logs')}
        >
          <FileText size={18} />
          <span>记录</span>
        </button>

        <button
          className={`by-mobile-nav-item ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => navigateTo('keys')}
        >
          <Key size={18} />
          <span>Key</span>
        </button>

        <button
          className={`by-mobile-nav-item ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => navigateTo('diagnostics')}
        >
          <Activity size={18} />
          <span>诊断</span>
        </button>

        <button
          className={`by-mobile-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => navigateTo('settings')}
        >
          <Settings size={18} />
          <span>设置</span>
        </button>
      </nav>

      {/* Logout Confirm Modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        title="退出管理后台"
        message="确定要退出 Inbox Mate 后台管理系统吗？退出后需重新输入密码与 2FA 验证码登录。"
        confirmText="退出登录"
        cancelText="取消"
        variant="warning"
        loading={logoutLoading}
        onConfirm={handleConfirmLogout}
        onClose={() => setShowLogoutModal(false)}
      />
    </div>
  );
};
