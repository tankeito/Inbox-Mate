import React, { useEffect, useState } from 'react';
import {
  Activity,
  RefreshCw,
  RotateCcw,
  Zap,
  Globe,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Server,
  Play,
  Clock,
  Shield,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { backyardApi } from '../api';
import type { RpaStatusData, DiagLogItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface RpaStatusViewProps {
  onNavigate?: (tab: string) => void;
}

export const RpaStatusView: React.FC<RpaStatusViewProps> = ({ onNavigate }) => {
  const [status, setStatus] = useState<RpaStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<DiagLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Restart Modal
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);

  // Health Check State
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<{
    ok: boolean;
    latencyMs: number;
    proxyUsed: string;
    pageTitle: string;
    statusCode: number;
    hasCaptcha: boolean;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await backyardApi.getRpaStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Failed to load RPA status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentRpaLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await backyardApi.getDiagnostics({
        page: 1,
        pageSize: 10,
        engine: 'web_rpa'
      });
      setRecentLogs(res.items);
    } catch (err) {
      console.error('Failed to load recent RPA logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshAll = () => {
    fetchStatus();
    fetchRecentRpaLogs();
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConfirmRestart = async () => {
    setRestartLoading(true);
    try {
      const res = await backyardApi.restartRpa();
      setShowRestartModal(false);
      setToast({ type: 'success', message: res.message || 'Chrome 无头浏览器已成功重新初始化！' });
      fetchStatus();
      fetchRecentRpaLogs();
      setTimeout(() => setToast(null), 5000);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || '重启 Chrome 失败' });
    } finally {
      setRestartLoading(false);
    }
  };

  const handleRunHealthCheck = async () => {
    setCheckingHealth(true);
    setHealthResult(null);
    try {
      const res = await backyardApi.testRpaHealthCheck();
      setHealthResult(res);
      setToast({ type: 'success', message: `Mail.com 探测成功！耗时: ${res.latencyMs}ms` });
      setTimeout(() => setToast(null), 5000);
      fetchStatus();
      fetchRecentRpaLogs();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || '连通性自检失败' });
    } finally {
      setCheckingHealth(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;
    if (status.activeConcurrentAccounts > 0) {
      return (
        <span className="by-badge by-badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--by-warning)', animation: 'pulse 1.5s infinite' }} />
          执行抓取中 (并发: {status.activeConcurrentAccounts})
        </span>
      );
    }
    if (status.isConnected) {
      return (
        <span className="by-badge by-badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--by-success)' }} />
          待机就绪 (空闲)
        </span>
      );
    }
    return (
      <span className="by-badge by-badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--by-text-muted)' }} />
        常驻进程待命
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--by-text-primary)', margin: 0 }}>
              Chrome RPA 状态与运维中枢
            </h2>
            {getStatusBadge()}
          </div>
          <p style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', marginTop: '4px' }}>
            实时监控 Playwright Chromium 无头浏览器并发、内存开销与代理通道，提供手动重启与连通性自检
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="by-btn by-btn-secondary" onClick={refreshAll} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>

          <button className="by-btn by-btn-secondary" onClick={handleRunHealthCheck} disabled={checkingHealth}>
            <Zap size={15} color="var(--by-warning)" className={checkingHealth ? 'animate-spin' : ''} />
            {checkingHealth ? '正在探测 Mail.com...' : '连通性自检'}
          </button>

          <button className="by-btn by-btn-danger" onClick={() => setShowRestartModal(true)}>
            <RotateCcw size={15} /> 手动重启 Chrome
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: toast.type === 'success' ? 'var(--by-success-bg)' : 'var(--by-danger-bg)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
          color: toast.type === 'success' ? 'var(--by-success)' : 'var(--by-danger)',
          fontSize: '0.88rem'
        }}>
          {toast.message}
        </div>
      )}

      {/* Top 4 Metrics Cards Grid (1 Row on PC) */}
      <div className="by-stat-grid-4">
        {/* Card 1: Concurrency */}
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>当前活跃并发数</span>
            <Layers size={16} color="var(--by-primary)" />
          </div>
          <div className="by-stat-value" style={{ color: (status?.activeConcurrentAccounts || 0) > 3 ? 'var(--by-warning)' : 'var(--by-primary)' }}>
            {status?.activeConcurrentAccounts ?? 0}
          </div>
          <div className="by-stat-sub">
            正在执行的 Playwright 抓取任务
          </div>
        </div>

        {/* Card 2: Recycle Counter */}
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>实例生命周期</span>
            <RotateCcw size={16} color="var(--by-purple)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-purple)' }}>
            {status ? `${status.browserUsageCount} / ${status.maxRecycleUsage}` : '0 / 30'}
          </div>
          <div className="by-stat-sub">
            满 {status?.maxRecycleUsage ?? 30} 次自动无感回收释放内存
          </div>
        </div>

        {/* Card 3: Memory Usage */}
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>进程内存占用</span>
            <Cpu size={16} color="var(--by-success)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-success)' }}>
            {status ? `${status.memoryUsageMb} MB` : '-'}
          </div>
          <div className="by-stat-sub">
            Heap 堆使用: {status?.heapUsedMb ?? 0} MB
          </div>
        </div>

        {/* Card 4: Proxy Channel */}
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>代理通道与网络</span>
            <Globe size={16} color="var(--by-warning)" />
          </div>
          <div className="by-stat-value" style={{ fontSize: '1.25rem', fontFamily: 'var(--by-font-mono)', letterSpacing: '-0.01em' }}>
            {status?.proxyInfo.server ? status.proxyInfo.server.replace('http://', '') : '直连 (Direct)'}
          </div>
          <div className="by-stat-sub">
            来源: {status?.proxyInfo.source === 'windows-registry' ? 'Windows 系统代理' : status?.proxyInfo.source === 'env' ? '环境变量' : '本地直连'}
          </div>
        </div>
      </div>

      {/* Health Check Result Banner if tested */}
      {healthResult && (
        <div className="by-card" style={{ borderLeft: '4px solid var(--by-success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle2 size={24} color="var(--by-success)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--by-text-primary)' }}>
                  Mail.com 无头浏览器健康探测通过 (HTTP {healthResult.statusCode})
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)', marginTop: '2px' }}>
                  响应延迟: <strong style={{ color: 'var(--by-success)' }}>{healthResult.latencyMs}ms</strong> • 页面标题: "{healthResult.pageTitle}" • 使用代理: {healthResult.proxyUsed} • 验证码阻拦: {healthResult.hasCaptcha ? '⚠️ 检测到 CAPTCHA' : '🟢 无阻拦'}
                </div>
              </div>
            </div>
            <button className="by-btn by-btn-secondary by-btn-sm" onClick={() => setHealthResult(null)}>
              关闭结果
            </button>
          </div>
        </div>
      )}

      {/* Two Column Section */}
      <div className="by-two-col-grid">
        {/* Left Card: Concurrency Diagnostics & Guidance */}
        <div className="by-card">
          <div className="by-card-header">
            <div>
              <div className="by-card-title">
                <Activity size={18} color="var(--by-primary)" /> 并发健康度与调度建议
              </div>
              <div className="by-card-subtitle">
                分析当前系统负载并提供稳定性调优建议
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              padding: '14px',
              borderRadius: '8px',
              background: (status?.activeConcurrentAccounts || 0) > 4 ? 'var(--by-warning-bg)' : 'var(--by-success-bg)',
              border: `1px solid ${(status?.activeConcurrentAccounts || 0) > 4 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              {(status?.activeConcurrentAccounts || 0) > 4 ? (
                <AlertTriangle size={20} color="var(--by-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <CheckCircle2 size={20} color="var(--by-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--by-text-primary)' }}>
                  {(status?.activeConcurrentAccounts || 0) > 4 ? '高负载并发中' : '当前无高压并发，运行平稳'}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                  {(status?.activeConcurrentAccounts || 0) > 4
                    ? '检测到同时有超过 4 个无头浏览器正在执行 Mail.com 登录。若出现连接超时，建议在【IP 限制】中限制批量调用，或点击右上角【安全重启】释放通道。'
                    : 'Chromium 实例连接正常，无僵尸页面滞留。系统已配置每 30 次抓取自动回收，防止内存泄漏。'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
              <div style={{ padding: '12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>无头引擎内核</div>
                <div style={{ fontWeight: 600, color: 'var(--by-text-primary)', marginTop: '2px' }}>Chromium 135 (Headless)</div>
              </div>
              <div style={{ padding: '12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>运行环境平台</div>
                <div style={{ fontWeight: 600, color: 'var(--by-text-primary)', marginTop: '2px' }}>{status?.systemPlatform || 'windows'} ({status?.nodeVersion || 'node.js'})</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Manual Operations & FAQ */}
        <div className="by-card">
          <div className="by-card-header">
            <div>
              <div className="by-card-title">
                <RotateCcw size={18} color="var(--by-purple)" /> 运维操作与故障排查
              </div>
              <div className="by-card-subtitle">
                遇到超时或假死时的快速应急手段
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--by-text-primary)' }}>强制重启 Chrome 实例</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginTop: '2px' }}>终止所有正在运行的无头实例并清除会话缓存</div>
              </div>
              <button className="by-btn by-btn-danger by-btn-sm" onClick={() => setShowRestartModal(true)}>
                重启
              </button>
            </div>

            <div style={{ padding: '12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--by-text-primary)' }}>Mail.com 网络连通自检</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginTop: '2px' }}>向目标邮箱服务器发起 1 次轻量探测并测量延迟</div>
              </div>
              <button className="by-btn by-btn-secondary by-btn-sm" onClick={handleRunHealthCheck} disabled={checkingHealth}>
                {checkingHealth ? '探测中...' : '测试'}
              </button>
            </div>

            {onNavigate && (
              <button
                type="button"
                className="by-btn by-btn-secondary"
                onClick={() => onNavigate('diagnostics')}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
              >
                <span>前往查看实时系统诊断日志</span>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recent Chrome RPA Logs Stream */}
      <div className="by-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="by-card-title" style={{ fontSize: '0.96rem' }}>
              <Clock size={16} color="var(--by-primary)" /> 最近 Chrome RPA 关键执行轨迹 (Web RPA Stream)
            </div>
            <div className="by-card-subtitle" style={{ marginTop: '2px' }}>
              展示最新的 10 条无头浏览器生命周期事件与并发快照
            </div>
          </div>
          {onNavigate && (
            <button className="by-btn by-btn-secondary by-btn-sm" onClick={() => onNavigate('diagnostics')}>
              查看全部诊断日志
            </button>
          )}
        </div>

        <div className="by-rpa-trace-list">
          {logsLoading && recentLogs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--by-text-secondary)' }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              正在载入执行轨迹...
            </div>
          ) : recentLogs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--by-text-muted)', fontSize: '0.88rem' }}>
              目前暂无 Chrome RPA 执行记录
            </div>
          ) : (
            recentLogs.map((item) => (
              <div key={item.id} className="by-rpa-trace-item">
                <div className="by-rpa-trace-meta">
                  <span className="by-rpa-trace-time">
                    {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <span className={`by-badge ${item.level === 'ERROR' ? 'by-badge-danger' : item.level === 'WARN' ? 'by-badge-warning' : 'by-badge-info'}`} style={{ fontSize: '0.74rem' }}>
                    {item.level}
                  </span>
                  <span className="by-badge by-badge-purple" style={{ fontSize: '0.74rem' }}>
                    {item.stage}
                  </span>
                  {item.accountEmail && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--by-text-code)', fontFamily: 'var(--by-font-mono)', fontWeight: 600 }}>
                      [{item.accountEmail}]
                    </span>
                  )}
                </div>

                <div className="by-rpa-trace-msg" style={{ color: item.level === 'ERROR' ? 'var(--by-danger)' : 'var(--by-text-primary)' }}>
                  {item.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Restart Confirm Modal */}
      <ConfirmModal
        isOpen={showRestartModal}
        title="重启 Chrome 无头浏览器"
        message={
          <div>
            确定要手动重启 Chrome 无头浏览器实例吗？
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>
              系统将安全释放所有无头浏览器进程并清除内存缓存，重新初始化 Chromium 引擎。
            </div>
          </div>
        }
        confirmText="确认重启"
        cancelText="取消"
        variant="danger"
        loading={restartLoading}
        onConfirm={handleConfirmRestart}
        onClose={() => setShowRestartModal(false)}
      />
    </div>
  );
};
