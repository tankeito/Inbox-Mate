import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Copy,
  Check,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  Shield,
  X,
  FileText,
  History,
  Globe,
  ExternalLink,
  Activity,
  ShieldCheck,
  CheckCircle,
  XCircle,
  ListFilter
} from 'lucide-react';
import { backyardApi } from '../api';
import type { AccessTokenItem, TokenSummaryStats, UsageLogItem, TokenLogsStats } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatDuration, formatFullDateTime, type DatePreset } from '../../../shared/format-utils';
import { DateRangeFilter } from '../components/DateRangeFilter';

export const TokensView: React.FC = () => {
  const [tokens, setTokens] = useState<AccessTokenItem[]>([]);
  const [summary, setSummary] = useState<TokenSummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom' | null>(null);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Issue Token Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuota, setNewQuota] = useState('10');
  const [newDuration, setNewDuration] = useState('0');
  const [createLoading, setCreateLoading] = useState(false);

  // Custom TopUp Modal
  const [tokenToTopUp, setTokenToTopUp] = useState<AccessTokenItem | null>(null);
  const [topUpCount, setTopUpCount] = useState('10');
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Delete Confirm Modal
  const [tokenToDelete, setTokenToDelete] = useState<AccessTokenItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Token Usage Logs Modal
  const [tokenForLogs, setTokenForLogs] = useState<AccessTokenItem | null>(null);
  const [tokenLogs, setTokenLogs] = useState<UsageLogItem[]>([]);
  const [tokenLogsLoading, setTokenLogsLoading] = useState(false);
  const [tokenLogsPage, setTokenLogsPage] = useState(1);
  const [tokenLogsPageSize, setTokenLogsPageSize] = useState(8);
  const [tokenLogsTotal, setTokenLogsTotal] = useState(0);
  const [tokenLogsTotalPages, setTokenLogsTotalPages] = useState(1);
  const [tokenLogsStartDate, setTokenLogsStartDate] = useState('');
  const [tokenLogsEndDate, setTokenLogsEndDate] = useState('');
  const [tokenLogsActivePreset, setTokenLogsActivePreset] = useState<DatePreset | 'custom' | null>(null);
  const [tokenLogsStatusTab, setTokenLogsStatusTab] = useState<'all' | 'success' | 'error'>('all');
  const [tokenLogsStats, setTokenLogsStats] = useState<TokenLogsStats | null>(null);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const res = await backyardApi.getTokens({
        page,
        pageSize,
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setTokens(res.items);
      setSummary(res.summary);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      console.error('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, [page, pageSize, startDate, endDate]);

  const handleDateChange = (start: string, end: string, preset?: DatePreset | 'custom' | null) => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset || null);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTokens();
  };

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      const quota = Number(newQuota) || 10;
      const duration = Number(newDuration) || 0;
      const res = await backyardApi.createToken({
        name: newName.trim(),
        totalQuota: quota,
        durationDays: duration > 0 ? duration : null
      });
      setShowCreateModal(false);
      setNewName('');
      setNewQuota('10');
      setNewDuration('0');
      setToastMessage({ type: 'success', text: `已成功生成 Token: "${res.token.name}" (额度: ${res.token.totalQuota}次)` });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '生成 Token 失败' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleQuickTopUp = async (id: string, count: number) => {
    try {
      const res = await backyardApi.topUpToken(id, count);
      setToastMessage({ type: 'success', text: `已为 "${res.token.name}" 充值 +${count} 次额度` });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '充值失败' });
    }
  };

  const handleCustomTopUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenToTopUp) return;
    setTopUpLoading(true);
    try {
      const count = Number(topUpCount) || 10;
      await backyardApi.topUpToken(tokenToTopUp.id, count);
      setTokenToTopUp(null);
      setToastMessage({ type: 'success', text: `已成功充值 +${count} 次额度` });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '充值失败' });
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleToggleActive = async (item: AccessTokenItem) => {
    try {
      const res = await backyardApi.toggleTokenActive(item.id, !item.isActive);
      setToastMessage({ type: 'success', text: res.message });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '切换状态失败' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!tokenToDelete) return;
    setDeleteLoading(true);
    try {
      await backyardApi.deleteToken(tokenToDelete.id);
      setTokenToDelete(null);
      setToastMessage({ type: 'success', text: 'Token 已成功删除' });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '删除失败' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleOpenTokenLogs = async (
    item: AccessTokenItem,
    p = 1,
    size = tokenLogsPageSize,
    tab: 'all' | 'success' | 'error' = tokenLogsStatusTab
  ) => {
    setTokenForLogs(item);
    setTokenLogsPage(p);
    setTokenLogsPageSize(size);
    setTokenLogsStatusTab(tab);
    setTokenLogsLoading(true);
    try {
      const res = await backyardApi.getTokenLogs(item.id, { page: p, pageSize: size, status: tab });
      if (res.token) {
        setTokenForLogs(res.token);
      }
      setTokenLogs(res.items);
      setTokenLogsTotal(res.total);
      setTokenLogsTotalPages(res.totalPages);
      if (res.stats) {
        setTokenLogsStats(res.stats);
      }
    } catch (err: any) {
      console.error('Failed to fetch token logs:', err);
      setTokenLogs([]);
    } finally {
      setTokenLogsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* Top Header */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <KeyRound size={22} color="var(--by-primary)" />
            <span>API 授权 Token 与额度生成器</span>
          </h2>
          <p className="by-view-desc">
            发行独立访问令牌，调用 API 自动扣减可用次数，成功扣费、失败免扣，保护 2C4G 服务器不被恶意挤兑
          </p>
        </div>

        <div className="by-view-actions">
          <button className="by-btn by-btn-secondary" onClick={fetchTokens} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>

          <button className="by-btn by-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} /> 发行新 Token
          </button>
        </div>
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: toastMessage.type === 'success' ? 'var(--by-success-bg)' : 'var(--by-danger-bg)',
          border: `1px solid ${toastMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
          color: toastMessage.type === 'success' ? 'var(--by-success)' : 'var(--by-danger)',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{toastMessage.text}</span>
          <button className="by-btn-icon" onClick={() => setToastMessage(null)} style={{ padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 4 Stat Cards Row */}
      <div className="by-stat-grid-4">
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>总发行 Token 数</span>
            <KeyRound size={16} color="var(--by-primary)" />
          </div>
          <div className="by-stat-value">{summary?.totalTokens ?? 0}</div>
          <div className="by-stat-sub">生效中: {summary?.activeTokens ?? 0} 个</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>已分配总次数</span>
            <Zap size={16} color="var(--by-purple)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-purple)' }}>
            {summary?.totalQuotaAllocated ?? 0}
          </div>
          <div className="by-stat-sub">系统累计授权额度</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>已消耗调用次数</span>
            <Clock size={16} color="var(--by-warning)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-warning)' }}>
            {summary?.totalQuotaUsed ?? 0}
          </div>
          <div className="by-stat-sub">成功执行抓取扣费</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>剩余总可用额度</span>
            <CheckCircle2 size={16} color="var(--by-success)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-success)' }}>
            {summary?.totalQuotaRemaining ?? 0}
          </div>
          <div className="by-stat-sub">健康可支配调用量</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="by-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--by-text-muted)' }} />
            <input
              type="text"
              className="by-input"
              placeholder="搜索 Token 密钥、使用者备注名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          <button type="submit" className="by-btn by-btn-secondary">
            <Search size={15} /> 筛选
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--by-border)', paddingTop: '10px' }}>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            activePreset={activePreset}
            onChange={handleDateChange}
          />
        </div>
      </div>

      {/* Token List Table / Card View */}
      <div className="by-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="by-table-wrapper mobile-card-view">
          <table className="by-table">
            <thead>
              <tr>
                <th>Token 密钥凭据</th>
                <th>使用者备注</th>
                <th style={{ minWidth: '180px' }}>额度消费进度 (已用 / 总额)</th>
                <th>状态</th>
                <th>创建 / 到期时间</th>
                <th>快捷充值</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && tokens.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    正在载入 Token 列表...
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-muted)' }}>
                    暂无授权 Token，点击右上角【发行新 Token】开始创建
                  </td>
                </tr>
              ) : (
                tokens.map((item) => {
                  const percent = Math.min(100, Math.round((item.usedQuota / item.totalQuota) * 100));
                  return (
                    <tr key={item.id}>
                      <td data-label="Token 密钥">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 700, color: 'var(--by-text-code)', fontSize: '0.84rem' }}>
                            {item.token.slice(0, 14)}...
                          </code>
                          <button
                            type="button"
                            className="by-btn-icon"
                            style={{ padding: '2px 4px' }}
                            onClick={() => handleCopy(item.token)}
                            title="复制完整 Token"
                          >
                            {copiedToken === item.token ? <Check size={13} color="var(--by-success)" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>

                      <td data-label="使用者备注">
                        <div style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{item.name}</div>
                      </td>

                      <td data-label="额度进度">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                            <span style={{ fontWeight: 600, color: item.isExhausted ? 'var(--by-danger)' : 'var(--by-text-primary)' }}>
                              已用 {item.usedQuota} / 共 {item.totalQuota} 次
                            </span>
                            <span style={{ color: 'var(--by-text-muted)' }}>
                              剩余 <strong style={{ color: item.remainingQuota > 0 ? 'var(--by-success)' : 'var(--by-danger)' }}>{item.remainingQuota}</strong> 次
                            </span>
                          </div>

                          <div style={{ height: '7px', background: 'var(--by-bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${percent}%`,
                                background: item.isExhausted
                                  ? 'var(--by-danger)'
                                  : percent > 80
                                  ? 'var(--by-warning)'
                                  : 'var(--by-success)',
                                borderRadius: '4px',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td data-label="状态">
                        {item.isExhausted ? (
                          <span className="by-badge by-badge-danger">已耗尽</span>
                        ) : !item.isActive ? (
                          <span className="by-badge by-badge-neutral">已冻结</span>
                        ) : (
                          <span className="by-badge by-badge-success">正常可用</span>
                        )}
                      </td>

                      <td data-label="创建/到期">
                        <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>
                          创建: {formatFullDateTime(item.createdAt)}<br />
                          {item.expiresAt ? `到期: ${formatFullDateTime(item.expiresAt)}` : '永久有效'}
                        </div>
                      </td>

                      <td data-label="快捷充值">
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="by-btn by-btn-secondary by-btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.74rem', height: '26px' }}
                            onClick={() => handleQuickTopUp(item.id, 10)}
                            title="一键充值 10 次"
                          >
                            +10
                          </button>
                          <button
                            type="button"
                            className="by-btn by-btn-secondary by-btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.74rem', height: '26px' }}
                            onClick={() => handleQuickTopUp(item.id, 50)}
                            title="一键充值 50 次"
                          >
                            +50
                          </button>
                          <button
                            type="button"
                            className="by-btn by-btn-secondary by-btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.74rem', height: '26px' }}
                            onClick={() => { setTokenToTopUp(item); setTopUpCount('100'); }}
                            title="自定义充值额度"
                          >
                            自定义
                          </button>
                        </div>
                      </td>

                      <td data-label="管理操作">
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="by-btn by-btn-secondary by-btn-sm"
                            onClick={() => handleOpenTokenLogs(item)}
                            title="查看 Token 详细消耗日志"
                            style={{ color: 'var(--by-primary)' }}
                          >
                            <FileText size={13} />
                          </button>
                          <button
                            type="button"
                            className="by-btn by-btn-secondary by-btn-sm"
                            onClick={() => handleToggleActive(item)}
                            title={item.isActive ? '冻结该 Token' : '解冻恢复使用'}
                          >
                            {item.isActive ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>
                          <button
                            type="button"
                            className="by-btn by-btn-danger by-btn-sm"
                            onClick={() => setTokenToDelete(item)}
                            title="删除 Token"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="by-pagination" style={{ padding: '16px 20px 24px 20px', borderTop: '1px solid var(--by-border)' }}>
          <div className="by-pagination-info">
            共 <strong style={{ color: 'var(--by-text-primary)' }}>{total}</strong> 个 Token • 第 {page} / {totalPages} 页
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              className="by-select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ width: '105px', height: '34px', fontSize: '0.8rem' }}
            >
              <option value="10">10 条/页</option>
              <option value="20">20 条/页</option>
              <option value="50">50 条/页</option>
            </select>

            <button
              className="by-btn by-btn-secondary by-btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <button
              className="by-btn by-btn-secondary by-btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Issue Token Modal */}
      {showCreateModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '460px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--by-primary)" /> 发行新 API 授权 Token
              </div>
              <button className="by-btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="by-modal-body">
                <div className="by-input-group">
                  <label className="by-label">使用者备注名称</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如: 客户A批量采集、测试团队专用"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">初始调用额度 (次数)</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    {['10', '50', '100', '500'].map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={`by-btn by-btn-sm ${newQuota === q ? 'by-btn-primary' : 'by-btn-secondary'}`}
                        onClick={() => setNewQuota(q)}
                        style={{ flex: 1 }}
                      >
                        {q} 次
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="by-input"
                    min="1"
                    value={newQuota}
                    onChange={(e) => setNewQuota(e.target.value)}
                    placeholder="自定义次数"
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--by-text-muted)' }}>
                    每次成功抓取扣减 1 次，外部邮箱网络异常/密码错误失败不扣费。
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">有效期</label>
                  <select className="by-select" value={newDuration} onChange={(e) => setNewDuration(e.target.value)}>
                    <option value="0">永久有效</option>
                    <option value="7">7 天</option>
                    <option value="30">30 天 (1 个月)</option>
                    <option value="90">90 天 (3 个月)</option>
                    <option value="365">365 天 (1 年)</option>
                  </select>
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowCreateModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={createLoading || !newName.trim()}>
                  {createLoading ? '正在发行...' : '确认发行 Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom TopUp Modal */}
      {tokenToTopUp && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '400px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="var(--by-warning)" /> 充值 Token 调用额度
              </div>
              <button className="by-btn-icon" onClick={() => setTokenToTopUp(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCustomTopUpSubmit}>
              <div className="by-modal-body">
                <div style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', marginBottom: '14px' }}>
                  为 Token <strong style={{ color: 'var(--by-text-primary)' }}>"{tokenToTopUp.name}"</strong> 充值可用次数：
                </div>

                <div className="by-input-group">
                  <label className="by-label">增加调用次数</label>
                  <input
                    type="number"
                    className="by-input"
                    min="1"
                    value={topUpCount}
                    onChange={(e) => setTopUpCount(e.target.value)}
                    required
                    autoFocus
                  />
                  <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginTop: '4px' }}>
                    充值后总额度将由 {tokenToTopUp.totalQuota} 次增加至 {tokenToTopUp.totalQuota + (Number(topUpCount) || 0)} 次。
                  </div>
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setTokenToTopUp(null)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={topUpLoading}>
                  {topUpLoading ? '正在充值...' : '确认充值'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(tokenToDelete)}
        title="删除授权 Token"
        message={
          <div>
            确定要删除授权 Token <strong style={{ color: 'var(--by-text-code)' }}>"{tokenToDelete?.name}"</strong> 吗？
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--by-danger)' }}>
              删除后使用该 Token 的任何自动化抓取脚本将立即失效。
            </div>
          </div>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onClose={() => setTokenToDelete(null)}
      />

      {/* Token Consumption Logs Modal */}
      {tokenForLogs && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '1020px', width: '95vw', maxHeight: '96vh', minHeight: '640px', display: 'flex', flexDirection: 'column' }}>
            <div className="by-modal-header" style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--by-primary-subtle)',
                  color: 'var(--by-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <div className="by-modal-title" style={{ fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>【{tokenForLogs.name}】Token 消耗与调用审计</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>密钥:</span>
                    <code style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 600, color: 'var(--by-text-code)' }}>{tokenForLogs.token}</code>
                    <button
                      type="button"
                      className="by-btn-icon"
                      style={{ padding: '1px 4px' }}
                      onClick={() => handleCopy(tokenForLogs.token)}
                      title="复制完整 Token"
                    >
                      {copiedToken === tokenForLogs.token ? <Check size={12} color="var(--by-success)" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
              <button className="by-btn-icon" onClick={() => setTokenForLogs(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px 24px' }}>
              {/* Top 3-Card Summary Grid (Elegant & Spacious) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '12px'
              }}>
                {/* Card 1: 真实扣费额度 (与外层严格对齐) */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--by-bg-input)',
                  border: '1px solid var(--by-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <KeyRound size={13} color="var(--by-primary)" /> Token 计费额度
                    </span>
                    {!tokenForLogs.isActive ? (
                      <span className="by-badge by-badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>已冻结</span>
                    ) : tokenForLogs.isExhausted ? (
                      <span className="by-badge by-badge-warning" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>已耗尽</span>
                    ) : (
                      <span className="by-badge by-badge-success" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>正常可用</span>
                    )}
                  </div>
                  
                  {(() => {
                    const percent = Math.min(100, Math.round((tokenForLogs.usedQuota / tokenForLogs.totalQuota) * 100));
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                          <span style={{ fontSize: '1.12rem', fontWeight: 700, color: 'var(--by-text-primary)' }}>
                            已用 {tokenForLogs.usedQuota} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--by-text-muted)' }}>/ 共 {tokenForLogs.totalQuota} 次</span>
                          </span>
                          <span style={{ fontSize: '0.78rem' }}>
                            剩余可用: <strong style={{ color: tokenForLogs.remainingQuota > 0 ? 'var(--by-success)' : 'var(--by-danger)' }}>{tokenForLogs.remainingQuota}</strong> 次
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--by-bg-card)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${percent}%`,
                              background: tokenForLogs.remainingQuota === 0 ? 'var(--by-danger)' : 'var(--by-primary)',
                              transition: 'width 0.3s ease'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: '0.7rem', color: 'var(--by-text-muted)' }}>
                    * 成功调用计费扣减，与外层表格严格统一
                  </div>
                </div>

                {/* Card 2: 审计总调用与状态分布 */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--by-bg-input)',
                  border: '1px solid var(--by-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Activity size={13} color="var(--by-info)" /> API 审计总流水
                    </span>
                    <span className="by-badge by-badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>全量审计</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.12rem', fontWeight: 700, color: 'var(--by-text-primary)', marginBottom: '4px' }}>
                      {tokenLogsStats?.totalCalls ?? tokenLogsTotal} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--by-text-muted)' }}>次请求流水</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', display: 'flex', gap: '12px' }}>
                      <span>成功: <strong style={{ color: 'var(--by-success)' }}>{tokenLogsStats?.successCalls ?? 0}</strong> 次</span>
                      <span>异常: <strong style={{ color: 'var(--by-danger)' }}>{tokenLogsStats?.errorCalls ?? 0}</strong> 次</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--by-text-muted)' }}>
                    包含客户端所有访问记录（含网络抖动/403/超时等）
                  </div>
                </div>

                {/* Card 3: 成功率与免扣保护 */}
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--by-bg-input)',
                  border: '1px solid var(--by-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <ShieldCheck size={13} color="var(--by-success)" /> 接口成功率 & 计费保护
                    </span>
                    <span className="by-badge by-badge-success" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>免扣保护中</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.12rem', fontWeight: 700, color: (tokenLogsStats?.successRate ?? 100) >= 80 ? 'var(--by-success)' : (tokenLogsStats?.successRate ?? 100) >= 50 ? 'var(--by-warning)' : 'var(--by-danger)', marginBottom: '4px' }}>
                      {tokenLogsStats?.successRate ?? 100}% <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--by-text-muted)' }}>成功率</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>
                      免扣保护: <strong style={{ color: 'var(--by-info)' }}>{tokenLogsStats?.freeProtectionCount ?? 0}</strong> 次异常未扣减额度
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--by-text-muted)' }}>
                    🛡️ 遵循“成功扣费、失败免扣”，客户额度受保护
                  </div>
                </div>
              </div>

              {/* Tab Selector & Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                paddingTop: '2px'
              }}>
                {/* Segmented Status Tabs */}
                <div style={{
                  display: 'inline-flex',
                  background: 'var(--by-bg-input)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid var(--by-border)'
                }}>
                  <button
                    type="button"
                    onClick={() => handleOpenTokenLogs(tokenForLogs, 1, tokenLogsPageSize, 'all')}
                    style={{
                      padding: '5px 14px',
                      fontSize: '0.8rem',
                      fontWeight: tokenLogsStatusTab === 'all' ? 700 : 500,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: tokenLogsStatusTab === 'all' ? 'var(--by-bg-card)' : 'transparent',
                      color: tokenLogsStatusTab === 'all' ? 'var(--by-text-primary)' : 'var(--by-text-secondary)',
                      boxShadow: tokenLogsStatusTab === 'all' ? 'var(--by-shadow-sm)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    全部流水 ({tokenLogsStats?.totalCalls ?? tokenLogsTotal})
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTokenLogs(tokenForLogs, 1, tokenLogsPageSize, 'success')}
                    style={{
                      padding: '5px 14px',
                      fontSize: '0.8rem',
                      fontWeight: tokenLogsStatusTab === 'success' ? 700 : 500,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: tokenLogsStatusTab === 'success' ? 'var(--by-bg-card)' : 'transparent',
                      color: tokenLogsStatusTab === 'success' ? 'var(--by-success)' : 'var(--by-text-secondary)',
                      boxShadow: tokenLogsStatusTab === 'success' ? 'var(--by-shadow-sm)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    ✓ 正常成功 ({tokenLogsStats?.successCalls ?? 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTokenLogs(tokenForLogs, 1, tokenLogsPageSize, 'error')}
                    style={{
                      padding: '5px 14px',
                      fontSize: '0.8rem',
                      fontWeight: tokenLogsStatusTab === 'error' ? 700 : 500,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: tokenLogsStatusTab === 'error' ? 'var(--by-bg-card)' : 'transparent',
                      color: tokenLogsStatusTab === 'error' ? 'var(--by-danger)' : 'var(--by-text-secondary)',
                      boxShadow: tokenLogsStatusTab === 'error' ? 'var(--by-shadow-sm)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    ✕ 异常/免扣 ({tokenLogsStats?.errorCalls ?? 0})
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    style={{ height: '28px', padding: '0 10px', fontSize: '0.78rem' }}
                    onClick={() => handleOpenTokenLogs(tokenForLogs, tokenLogsPage, tokenLogsPageSize, tokenLogsStatusTab)}
                    disabled={tokenLogsLoading}
                  >
                    <RefreshCw size={13} className={tokenLogsLoading ? 'animate-spin' : ''} /> 刷新当前
                  </button>
                </div>
              </div>

              {/* Log List / Table */}
              <div style={{ border: '1px solid var(--by-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <div className="by-table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="by-table by-table-compact" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>请求时间</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>客户端 IP & 地区</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>调用邮箱账号</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>服务商</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>调用模式</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>执行状态</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>提取验证码</th>
                        <th style={{ padding: '9px 12px', fontSize: '0.78rem' }}>耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenLogsLoading ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--by-text-secondary)' }}>
                            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                            正在加载审计记录...
                          </td>
                        </tr>
                      ) : tokenLogs.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--by-text-muted)' }}>
                            暂无【{tokenLogsStatusTab === 'success' ? '正常成功' : tokenLogsStatusTab === 'error' ? '异常免扣' : '全部'}】记录。
                          </td>
                        </tr>
                      ) : (
                        tokenLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap', color: 'var(--by-text-secondary)', padding: '9px 12px', fontSize: '0.8rem' }}>
                              {formatFullDateTime(log.createdAt)}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 600, fontSize: '0.82rem' }}>{log.clientIp}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--by-text-muted)', marginTop: '1px' }}>{log.region || '未知地区'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{log.emailAccount}</div>
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ fontSize: '0.78rem' }}>
                                {log.provider === 'mailcom' ? 'mail.com' : log.provider}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <span className="by-badge by-badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                {log.sourceMode === 'api_key' ? 'API 调用' : log.sourceMode === 'batch' ? '网页批量' : '网页单账号'}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              {log.status === 'success' ? (
                                <span className="by-badge by-badge-success" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>成功</span>
                              ) : log.status === 'no_code' ? (
                                <span className="by-badge by-badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>邮件获取</span>
                              ) : log.status === 'timeout' ? (
                                <span className="by-badge by-badge-warning" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>超时</span>
                              ) : log.status === 'captcha' ? (
                                <span className="by-badge by-badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>验证码拦截</span>
                              ) : log.status === 'auth_failed' ? (
                                <span className="by-badge by-badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>密码错误</span>
                              ) : (
                                <span className="by-badge by-badge-danger" style={{ fontSize: '0.7rem', padding: '2px 6px' }} title={log.statusDetail || '异常'}>
                                  异常
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              {log.extractedCode ? (
                                <span style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 700, color: 'var(--by-warning)', fontSize: '0.86rem' }}>
                                  {log.extractedCode}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--by-text-muted)' }}>-</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--by-text-secondary)', fontFamily: 'var(--by-font-mono)', fontSize: '0.8rem', padding: '9px 12px' }}>
                              {formatDuration(log.durationMs)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Logs Modal Pagination Bar */}
              <div className="by-pagination" style={{ padding: '10px 14px', borderTop: '1px solid var(--by-border)', marginTop: '2px' }}>
                <div className="by-pagination-info" style={{ fontSize: '0.78rem' }}>
                  共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{tokenLogsTotal}</span> 条记录 • 第 {tokenLogsPage} / {tokenLogsTotalPages} 页
                </div>

                <div className="by-pagination-controls">
                  <select
                    className="by-select by-btn-sm"
                    value={tokenLogsPageSize}
                    onChange={(e) => {
                      const newSize = Number(e.target.value);
                      setTokenLogsPageSize(newSize);
                      handleOpenTokenLogs(tokenForLogs, 1, newSize, tokenLogsStatusTab);
                    }}
                    style={{ width: 'auto', padding: '0 24px 0 8px', height: '28px', lineHeight: '26px', fontSize: '0.78rem' }}
                  >
                    <option value="6">6条/页</option>
                    <option value="8">8条/页</option>
                  </select>

                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    style={{ height: '28px', padding: '0 10px', fontSize: '0.78rem' }}
                    disabled={tokenLogsPage <= 1 || tokenLogsLoading}
                    onClick={() => handleOpenTokenLogs(tokenForLogs, tokenLogsPage - 1, tokenLogsPageSize, tokenLogsStatusTab)}
                    title={tokenLogsPage <= 1 ? '已是第一页' : '上一页'}
                  >
                    <ChevronLeft size={13} /> 上一页
                  </button>

                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    style={{ height: '28px', padding: '0 10px', fontSize: '0.78rem' }}
                    disabled={tokenLogsPage >= tokenLogsTotalPages || tokenLogsLoading}
                    onClick={() => handleOpenTokenLogs(tokenForLogs, tokenLogsPage + 1, tokenLogsPageSize, tokenLogsStatusTab)}
                    title={tokenLogsPage >= tokenLogsTotalPages ? '已是最后一页' : '下一页'}
                  >
                    下一页 <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>

            <div className="by-modal-footer" style={{ padding: '12px 24px' }}>
              <button type="button" className="by-btn by-btn-secondary" style={{ height: '32px', padding: '0 16px', fontSize: '0.84rem' }} onClick={() => setTokenForLogs(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
