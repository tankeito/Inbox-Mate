import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Key,
  KeyRound,
  Activity,
  Settings,
  LogOut,
  Mail,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Sun,
  Moon,
  Menu,
  X,
  Zap,
  PanelLeftClose,
  PanelLeft,
  Layers,
  Globe
} from 'lucide-react';
import { backyardApi } from './api';
import type { AdminUser } from './types';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { UsageLogsView } from './views/UsageLogsView';
import { ApiKeyView } from './views/ApiKeyView';
import { TokensView } from './views/TokensView';
import { RpaStatusView } from './views/RpaStatusView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { IpAnalyticsView } from './views/IpAnalyticsView';
import { SettingsView } from './views/SettingsView';
import { ConfirmModal } from './components/ConfirmModal';
import './backyard.css';

function getInitialTabFromUrl(): string {
  const path = window.location.pathname;
  if (path.includes('/backyard/ip-analytics') || path.includes('/backyard/security')) return 'ip-analytics';
  if (path.includes('/backyard/tokens')) return 'tokens';
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
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('by_sidebar_collapsed') === 'true';
  });

  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('inbox_mate_theme') as any) || 'system';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('by_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

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
    checkAuth();

    const handlePopState = () => {
      setActiveTab(getInitialTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const res = await backyardApi.getMe();
      if (res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await backyardApi.logout();
      setUser(null);
      setShowLogoutModal(false);
      window.location.href = '/backyard';
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLogoutLoading(false);
    }
  };

  const navigateTo = (tab: string) => {
    setActiveTab(tab);
    setShowMobileDrawer(false);
    window.history.pushState({}, '', tab === 'dashboard' ? '/backyard' : `/backyard/${tab}`);
  };

  if (loading) {
    return (
      <div className="by-loading-screen">
        <div className="by-loading-spinner" />
        <div style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--by-text-secondary)' }}>
          正在载入 Inbox Mate Backyard...
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
      case 'rpa':
        return 'Chrome RPA 状态与运维';
      case 'tokens':
        return 'API 授权 Token 与额度管理';
      case 'ip-analytics':
        return '客户端 IP & 地区访问统计与安全防御中心';
      case 'logs':
        return '用户使用记录';
      case 'keys':
        return 'API Key 管理';
      case 'diagnostics':
        return 'Chrome RPA 与系统诊断';
      case 'settings':
        return '安全与系统设置';
      default:
        return '后台管理';
    }
  };

  return (
    <div className={`by-app ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="by-layout">
        {/* Desktop Sidebar */}
        <aside className={`by-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="by-sidebar-header">
            <div
              className="by-brand-logo"
              onClick={() => {
                if (isSidebarCollapsed) {
                  setIsSidebarCollapsed(false);
                } else {
                  navigateTo('dashboard');
                }
              }}
              style={{ cursor: 'pointer' }}
              title={isSidebarCollapsed ? '展开侧边栏 (Expand)' : '控制台总览'}
            >
              <Mail size={18} strokeWidth={2.4} />
            </div>
            <div className="by-sidebar-header-text">
              <div className="by-brand-title">
                Inbox Mate <span className="by-brand-badge">Backyard</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>系统管理中枢</div>
            </div>
            <button
              type="button"
              className="by-sidebar-toggle-btn"
              onClick={() => setIsSidebarCollapsed(true)}
              title="收缩侧边栏 (Collapse)"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <nav className="by-sidebar-nav">
            <button
              className={`by-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('dashboard')}
              title={isSidebarCollapsed ? '控制台总览' : undefined}
            >
              <LayoutDashboard size={18} />
              <span className="by-nav-text">控制台总览</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'rpa' ? 'active' : ''}`}
              onClick={() => navigateTo('rpa')}
              title={isSidebarCollapsed ? 'Chrome RPA 运维' : undefined}
            >
              <Zap size={18} />
              <span className="by-nav-text">Chrome RPA 运维</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'tokens' ? 'active' : ''}`}
              onClick={() => navigateTo('tokens')}
              title={isSidebarCollapsed ? '授权 Token 生成器' : undefined}
            >
              <KeyRound size={18} />
              <span className="by-nav-text">授权 Token 生成器</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'ip-analytics' ? 'active' : ''}`}
              onClick={() => navigateTo('ip-analytics')}
              title={isSidebarCollapsed ? 'IP 统计与安全防御' : undefined}
            >
              <Globe size={18} />
              <span className="by-nav-text">IP 统计与安全防御</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => navigateTo('logs')}
              title={isSidebarCollapsed ? '使用记录审计' : undefined}
            >
              <FileText size={18} />
              <span className="by-nav-text">使用记录审计</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'keys' ? 'active' : ''}`}
              onClick={() => navigateTo('keys')}
              title={isSidebarCollapsed ? 'API Key 发行与管理' : undefined}
            >
              <Key size={18} />
              <span className="by-nav-text">API Key 发行与管理</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => navigateTo('diagnostics')}
              title={isSidebarCollapsed ? 'Chrome RPA 诊断' : undefined}
            >
              <Activity size={18} />
              <span className="by-nav-text">Chrome RPA 诊断</span>
            </button>

            <button
              className={`by-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => navigateTo('settings')}
              title={isSidebarCollapsed ? '安全与 2FA 设置' : undefined}
            >
              <Settings size={18} />
              <span className="by-nav-text">安全与 2FA 设置</span>
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

            <button className="by-btn-icon by-sidebar-logout-btn" onClick={() => setShowLogoutModal(true)} title="退出后台">
              <LogOut size={16} color="var(--by-text-secondary)" />
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="by-main">
          {/* Header */}
          <header className="by-header">
            {/* Left side: Mobile Menu Trigger + Brand Logo on mobile; Title on desktop */}
            <div className="by-header-left">
              <button
                type="button"
                className="by-mobile-menu-trigger"
                onClick={() => setShowMobileDrawer(true)}
                title="打开导航菜单"
              >
                <Menu size={20} />
              </button>

              <div className="by-mobile-brand">
                <div className="by-mobile-logo">
                  <Mail size={15} strokeWidth={2.4} color="#ffffff" />
                </div>
                <span>Inbox Mate</span>
              </div>

              <div className="by-desktop-header-title">
                <span>{getPageTitle()}</span>
              </div>
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
                title="返回前台主工作台"
              >
                <span>前台工作台</span>
                <ExternalLink size={13} />
              </a>

              <button
                className="by-btn by-btn-secondary by-btn-sm by-header-logout-btn"
                onClick={() => setShowLogoutModal(true)}
                title="安全退出后台"
              >
                <LogOut size={14} /> <span>退出</span>
              </button>
            </div>
          </header>

          {/* View Container */}
          <main className="by-content">
            {activeTab === 'dashboard' && <DashboardView onNavigate={navigateTo} />}
            {activeTab === 'rpa' && <RpaStatusView onNavigate={navigateTo} />}
            {activeTab === 'tokens' && <TokensView />}
            {activeTab === 'ip-analytics' && <IpAnalyticsView />}
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

      {/* Mobile Slide-Out Navigation Drawer */}
      {showMobileDrawer && (
        <div className="by-drawer-overlay" onClick={() => setShowMobileDrawer(false)}>
          <div className="by-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="by-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="by-brand-logo" style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}>
                  <Mail size={16} strokeWidth={2.4} />
                </div>
                <div>
                  <div className="by-brand-title" style={{ fontSize: '1rem' }}>
                    Inbox Mate <span className="by-brand-badge">Backyard</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>系统管理中枢</div>
                </div>
              </div>
              <button className="by-btn-icon" onClick={() => setShowMobileDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <nav className="by-drawer-nav">
              <button
                className={`by-drawer-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => navigateTo('dashboard')}
              >
                <LayoutDashboard size={18} />
                <span>控制台总览</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'rpa' ? 'active' : ''}`}
                onClick={() => navigateTo('rpa')}
              >
                <Zap size={18} />
                <span>Chrome RPA 运维</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'tokens' ? 'active' : ''}`}
                onClick={() => navigateTo('tokens')}
              >
                <KeyRound size={18} />
                <span>API 授权 Token 生成器</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'ip-analytics' ? 'active' : ''}`}
                onClick={() => navigateTo('ip-analytics')}
              >
                <Globe size={18} />
                <span>IP 统计与安全防御</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => navigateTo('logs')}
              >
                <FileText size={18} />
                <span>用户使用记录审计</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'keys' ? 'active' : ''}`}
                onClick={() => navigateTo('keys')}
              >
                <Key size={18} />
                <span>API Key 发行与管理</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'diagnostics' ? 'active' : ''}`}
                onClick={() => navigateTo('diagnostics')}
              >
                <Activity size={18} />
                <span>Chrome RPA 与系统诊断</span>
              </button>

              <button
                className={`by-drawer-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => navigateTo('settings')}
              >
                <Settings size={18} />
                <span>安全与 2FA 设置</span>
              </button>
            </nav>

            <div className="by-drawer-footer">
              <div className="by-user-badge" style={{ marginBottom: '12px' }}>
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

              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href="/"
                  className="by-btn by-btn-secondary by-btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <ExternalLink size={13} /> 前台工作台
                </a>
                <button
                  className="by-btn by-btn-danger by-btn-sm"
                  onClick={() => { setShowMobileDrawer(false); setShowLogoutModal(true); }}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <LogOut size={13} /> 退出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm Modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        title="退出管理后台"
        message="确定要退出 Inbox Mate 后台管理系统吗？退出后需重新输入密码与 2FA 验证码登录。"
        confirmText="退出登录"
        cancelText="取消"
        variant="warning"
        loading={logoutLoading}
        onConfirm={handleLogout}
        onClose={() => setShowLogoutModal(false)}
      />
    </div>
  );
};
