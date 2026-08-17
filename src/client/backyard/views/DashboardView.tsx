import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Key,
  ShieldCheck,
  Zap,
  Clock,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Server,
  Layers,
  FileText,
  RotateCcw,
  Globe,
  Cpu,
  Shield,
  ChevronRight
} from 'lucide-react';
import { backyardApi } from '../api';
import type { DashboardStats, RpaStatusData } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rpaStatus, setRpaStatus] = useState<RpaStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  // Restart Chrome modal
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, rpaData] = await Promise.all([
        backyardApi.getOverviewStats().catch(() => null),
        backyardApi.getRpaStatus().catch(() => null)
      ]);
      if (statsData) setStats(statsData);
      if (rpaData) setRpaStatus(rpaData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmRestartChrome = async () => {
    setRestartLoading(true);
    try {
      const res = await backyardApi.restartRpa();
      setShowRestartModal(false);
      setRestartMsg(res.message || 'Chrome 无头浏览器已成功安全重启！');
      loadData();
      setTimeout(() => setRestartMsg(null), 5000);
    } catch (err: any) {
      setRestartMsg(`重启失败: ${err.message}`);
    } finally {
      setRestartLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner / Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--by-text-primary)', margin: 0 }}>控制台总览</h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', marginTop: '4px' }}>
            实时系统负载、Chrome RPA 状态、使用情况审计与 API 调度指标
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="by-btn by-btn-secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新数据
          </button>
          <button className="by-btn by-btn-primary" onClick={() => onNavigate('keys')}>
            <Key size={16} /> API Key 管理
          </button>
        </div>
      </div>

      {restartMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--by-success-bg)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: 'var(--by-success)',
          fontSize: '0.88rem'
        }}>
          {restartMsg}
        </div>
      )}

      {/* Chrome RPA Engine Status Banner Card */}
      <div className="by-card" style={{ background: 'var(--by-bg-card)', border: '1px solid var(--by-border-strong)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(168, 85, 247, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--by-primary)'
            }}>
              <Zap size={22} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--by-text-primary)' }}>
                  Chrome RPA 无头调度引擎
                </span>
                {rpaStatus?.activeConcurrentAccounts && rpaStatus.activeConcurrentAccounts > 0 ? (
                  <span className="by-badge by-badge-warning" style={{ fontSize: '0.74rem' }}>
                    🟡 抓取运行中 ({rpaStatus.activeConcurrentAccounts} 并发)
                  </span>
                ) : (
                  <span className="by-badge by-badge-success" style={{ fontSize: '0.74rem' }}>
                    🟢 待机就绪 (空闲)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)', marginTop: '3px' }}>
                Playwright Chromium • 活跃并发: <strong style={{ color: 'var(--by-primary)' }}>{rpaStatus?.activeConcurrentAccounts ?? 0}</strong> • 内存: {rpaStatus?.memoryUsageMb ?? 0}MB • 代理: {rpaStatus?.proxyInfo.server ? rpaStatus.proxyInfo.server.replace('http://', '') : '本地直连'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="by-btn by-btn-danger by-btn-sm" onClick={() => setShowRestartModal(true)}>
              <RotateCcw size={14} /> 重启 Chrome
            </button>
            <button className="by-btn by-btn-secondary by-btn-sm" onClick={() => onNavigate('rpa')}>
              <span>RPA 运维中枢</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 6 Key Stat Cards */}
      <div className="by-stat-grid">
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>今日提取总次数</span>
            <Activity size={16} color="var(--by-primary)" />
          </div>
          <div className="by-stat-value">{stats?.todayRequests ?? 0}</div>
          <div className="by-stat-sub">累计请求: {stats?.totalRequests ?? 0} 次</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>今日执行成功率</span>
            <CheckCircle2 size={16} color="var(--by-success)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-success)' }}>
            {stats?.todaySuccessRate ?? 100}%
          </div>
          <div className="by-stat-sub">成功执行: {stats?.todaySuccessCount ?? 0} 次</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>提取到验证码</span>
            <Zap size={16} color="var(--by-warning)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-warning)' }}>
            {stats?.todayCodesFound ?? 0}
          </div>
          <div className="by-stat-sub">高置信度识别命中</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>活跃客户端 IP</span>
            <TrendingUp size={16} color="var(--by-purple)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-purple)' }}>
            {stats?.activeIpsToday ?? 0}
          </div>
          <div className="by-stat-sub">今日独立访问源</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>生效中 API Key</span>
            <Key size={16} color="var(--by-primary)" />
          </div>
          <div className="by-stat-value">{stats?.totalApiKeys ?? 0}</div>
          <div className="by-stat-sub">支持自动化高速拉取</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>平均处理耗时</span>
            <Clock size={16} color="#ec4899" />
          </div>
          <div className="by-stat-value">{stats?.avgDurationMs ?? 0} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>ms</span></div>
          <div className="by-stat-sub">IMAP & Playwright RPA</div>
        </div>
      </div>

      {/* Middle: Provider Distribution & Fast Links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Provider Stats */}
        <div className="by-card">
          <div className="by-card-header">
            <div>
              <div className="by-card-title">
                <Layers size={18} color="var(--by-primary)" /> 邮箱服务商调用占比 (近7日)
              </div>
              <div className="by-card-subtitle">各类邮箱在系统中的使用分布比例</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
            {stats?.providerStats && stats.providerStats.length > 0 ? (
              stats.providerStats.map((item) => (
                <div key={item.provider}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, textTransform: 'capitalize', color: 'var(--by-text-primary)' }}>
                      {item.provider === 'mailcom' ? 'Mail.com (Web RPA)' : item.provider}
                    </span>
                    <span style={{ color: 'var(--by-text-secondary)' }}>
                      {item.count} 次 ({item.percentage}%)
                    </span>
                  </div>
                  <div style={{ height: '7px', background: 'var(--by-bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${item.percentage}%`,
                        background:
                          item.provider === 'mailcom'
                            ? 'linear-gradient(90deg, #0284c7, #38bdf8)'
                            : item.provider === 'microsoft'
                            ? 'linear-gradient(90deg, #0284c7, #0ea5e9)'
                            : 'linear-gradient(90deg, #8b5cf6, #a855f7)',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--by-text-muted)', textAlign: 'center', padding: '20px' }}>
                暂无服务商分布数据
              </div>
            )}
          </div>
        </div>

        {/* Quick Operations & System Highlights */}
        <div className="by-card">
          <div className="by-card-header">
            <div>
              <div className="by-card-title">
                <Server size={18} color="var(--by-purple)" /> 后台核心管理入口
              </div>
              <div className="by-card-subtitle">常用功能快捷直达</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            <div
              onClick={() => onNavigate('rpa')}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--by-bg-input)',
                border: '1px solid var(--by-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--by-purple)' }}>
                  <Zap size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--by-text-primary)' }}>Chrome RPA 状态与运维中枢</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>实时并发监控、手动安全重启与连通性自检</div>
                </div>
              </div>
              <ArrowUpRight size={18} color="var(--by-text-muted)" />
            </div>

            <div
              onClick={() => onNavigate('keys')}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--by-bg-input)',
                border: '1px solid var(--by-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--by-primary)' }}>
                  <Key size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--by-text-primary)' }}>批量导入 / 导出 API Key</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>支持账号|密码格式导入并自动发行 URL</div>
                </div>
              </div>
              <ArrowUpRight size={18} color="var(--by-text-muted)" />
            </div>

            <div
              onClick={() => onNavigate('logs')}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--by-bg-input)',
                border: '1px solid var(--by-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--by-success)' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--by-text-primary)' }}>用户使用情况审计表</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>IP、地区、邮箱类型、耗时明细分页查询</div>
                </div>
              </div>
              <ArrowUpRight size={18} color="var(--by-text-muted)" />
            </div>

            <div
              onClick={() => onNavigate('diagnostics')}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--by-bg-input)',
                border: '1px solid var(--by-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--by-warning)' }}>
                  <Activity size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--by-text-primary)' }}>Chrome RPA & IMAP 诊断跟踪</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>Mail.com 登录、代理与网络拦截实时排查</div>
                </div>
              </div>
              <ArrowUpRight size={18} color="var(--by-text-muted)" />
            </div>
          </div>

          <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--by-info-bg)', border: '1px solid rgba(2, 132, 199, 0.2)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--by-info)' }}>
            <ShieldCheck size={16} style={{ flexShrink: 0 }} />
            <span>系统已启用 SQLite WAL 原生事务持久化与 AES-256-GCM 凭据加密防护</span>
          </div>
        </div>
      </div>

      {/* Restart Chrome Confirm Modal */}
      <ConfirmModal
        isOpen={showRestartModal}
        title="重启 Chrome 无头浏览器"
        message="确定要立即重启后台 Chrome 无头浏览器吗？系统将释放全部 Playwright 实例并重新加载。"
        confirmText="确认重启"
        cancelText="取消"
        variant="danger"
        loading={restartLoading}
        onConfirm={handleConfirmRestartChrome}
        onClose={() => setShowRestartModal(false)}
      />
    </div>
  );
};
