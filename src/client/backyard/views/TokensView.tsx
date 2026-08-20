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
  ListFilter,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { backyardApi } from '../api';
import type { AccessTokenItem, TokenSummaryStats, UsageLogItem, TokenLogsStats, ScopeMode, EnginePreference } from '../types';
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
  const [newScopeMode, setNewScopeMode] = useState<ScopeMode>('code_only');
  const [newEnginePreference, setNewEnginePreference] = useState<EnginePreference>('auto');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Token Modal
  const [tokenToEdit, setTokenToEdit] = useState<AccessTokenItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuota, setEditQuota] = useState('10');
  const [editDuration, setEditDuration] = useState('0');
  const [editScopeMode, setEditScopeMode] = useState<ScopeMode>('code_only');
  const [editEnginePreference, setEditEnginePreference] = useState<EnginePreference>('auto');
  const [editLoading, setEditLoading] = useState(false);

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
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{
    token: AccessTokenItem;
    reconciledCount: number;
    previousUsedQuota: number;
    message: string;
  } | null>(null);

  // Batch Operations State
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [showBatchReconcileModal, setShowBatchReconcileModal] = useState(false);
  const [batchReconcileResult, setBatchReconcileResult] = useState<{
    count: number;
    results: Array<{ id: string; name: string; reconciledCount: number; previousUsedQuota: number; remainingQuota: number }>;
    message: string;
  } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

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
        durationDays: duration > 0 ? duration : null,
        scopeMode: newScopeMode,
        enginePreference: newEnginePreference
      });
      setShowCreateModal(false);
      setNewName('');
      setNewQuota('10');
      setNewDuration('0');
      setNewScopeMode('code_only');
      setNewEnginePreference('auto');
      setToastMessage({ type: 'success', text: `已成功生成 Token: "${res.token.name}" (额度: ${res.token.totalQuota}次)` });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '生成 Token 失败' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEdit = (token: AccessTokenItem) => {
    setTokenToEdit(token);
    setEditName(token.name);
    setEditQuota(String(token.totalQuota));
    setEditScopeMode(token.scopeMode || 'code_only');
    setEditEnginePreference(token.enginePreference || 'auto');
    setEditDuration('0');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenToEdit || !editName.trim()) return;
    setEditLoading(true);
    try {
      const quota = Number(editQuota) || tokenToEdit.totalQuota;
      const duration = Number(editDuration) || 0;
      const res = await backyardApi.updateToken(tokenToEdit.id, {
        name: editName.trim(),
        totalQuota: quota,
        durationDays: duration > 0 ? duration : null,
        scopeMode: editScopeMode,
        enginePreference: editEnginePreference
      });
      setTokenToEdit(null);
      setToastMessage({ type: 'success', text: `已成功更新 Token "${res.token.name}" 的权限与配置` });
      fetchTokens();
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '更新 Token 失败' });
    } finally {
      setEditLoading(false);
    }
  };

  const renderScopeBadge = (scope?: ScopeMode) => {
    if (scope === 'full') {
      return (
        <span className="by-badge by-badge-neutral" title="完整报文模式：包含正文与完整 HTML" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
          完整报文
        </span>
      );
    }
    if (scope === 'summary') {
      return (
        <span className="by-badge by-badge-info" title="邮件摘要模式：包含主题/发件人/摘要，剔除庞大正文" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
          邮件摘要
        </span>
      );
    }
    return (
      <span className="by-badge by-badge-success" title="仅提取验证码：报文极致精简，不返回正文" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
        仅验证码
      </span>
    );
  };

  const renderEngineBadge = (engine?: EnginePreference) => {
    if (engine === 'web_rpa') {
      return (
        <span className="by-badge by-badge-warning" title="强制走 Chrome 无头浏览器自动化" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
          强制 Chrome
        </span>
      );
    }
    if (engine === 'imap_pop3') {
      return (
        <span className="by-badge by-badge-primary" title="强制走 IMAP/POP3 极速协议通道" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
          强制 IMAP
        </span>
      );
    }
    return (
      <span className="by-badge by-badge-neutral" title="智能自适应路由" style={{ fontSize: '0.74rem', padding: '2px 8px' }}>
        智能自适应
      </span>
    );
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

  const handleOpenReconcileModal = () => {
    setReconcileResult(null);
    setShowReconcileModal(true);
  };

  const handleConfirmReconcile = async () => {
    if (!tokenForLogs) return;
    setReconcileLoading(true);
    try {
      const res = await backyardApi.reconcileTokenQuota(tokenForLogs.id);
      setReconcileResult(res);
      setTokenForLogs(res.token);
      setTokens((prev) => prev.map((t) => (t.id === res.token.id ? res.token : t)));
      setToastMessage({ type: 'success', text: res.message });
      setTimeout(() => setToastMessage(null), 4000);
      fetchTokens();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '智能校准额度失败' });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setReconcileLoading(false);
    }
  };

  // Batch Toggle Active
  const handleBatchToggle = async (isActive: boolean) => {
    if (selectedTokenIds.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await backyardApi.batchToggleTokens(selectedTokenIds, isActive);
      setToastMessage({ type: 'success', text: res.message });
      setTimeout(() => setToastMessage(null), 4000);
      setSelectedTokenIds([]);
      fetchTokens();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '批量切换状态失败' });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setBatchLoading(false);
    }
  };

  // Batch Delete
  const handleBatchDelete = async () => {
    if (selectedTokenIds.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await backyardApi.batchDeleteTokens(selectedTokenIds);
      setToastMessage({ type: 'success', text: res.message });
      setTimeout(() => setToastMessage(null), 4000);
      setSelectedTokenIds([]);
      setShowBatchDeleteModal(false);
      fetchTokens();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '批量删除失败' });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setBatchLoading(false);
    }
  };

  // Batch Reconcile
  const handleOpenBatchReconcile = () => {
    setBatchReconcileResult(null);
    setShowBatchReconcileModal(true);
  };

  const handleConfirmBatchReconcile = async () => {
    if (selectedTokenIds.length === 0) return;
    setBatchLoading(true);
    try {
      const res = await backyardApi.batchReconcileTokens(selectedTokenIds);
      setBatchReconcileResult(res);
      setToastMessage({ type: 'success', text: res.message });
      setTimeout(() => setToastMessage(null), 4000);
      fetchTokens();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || '批量智能识别校准失败' });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setBatchLoading(false);
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

      {/* Batch Action Bar */}
      {selectedTokenIds.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: 'var(--by-shadow-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--by-primary)',
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 700
            }}>
              {selectedTokenIds.length}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--by-text-primary)' }}>
              已勾选 <strong style={{ color: 'var(--by-primary)' }}>{selectedTokenIds.length}</strong> 个 Token
            </span>
            <button
              type="button"
              className="by-btn by-btn-secondary by-btn-sm"
              style={{ height: '26px', padding: '0 8px', fontSize: '0.74rem' }}
              onClick={() => setSelectedTokenIds([])}
            >
              取消选择
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="by-btn by-btn-secondary by-btn-sm"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '0.8rem',
                color: 'var(--by-primary)',
                borderColor: 'var(--by-primary)',
                background: 'rgba(99, 102, 241, 0.08)',
                fontWeight: 600,
                gap: '5px'
              }}
              onClick={handleOpenBatchReconcile}
              disabled={batchLoading}
            >
              <Sparkles size={14} color="var(--by-primary)" />
              <span>批量智能识别</span>
            </button>

            <button
              type="button"
              className="by-btn by-btn-secondary by-btn-sm"
              style={{ height: '30px', padding: '0 10px', fontSize: '0.8rem', gap: '4px' }}
              onClick={() => handleBatchToggle(true)}
              disabled={batchLoading}
            >
              <Unlock size={13} color="var(--by-success)" />
              <span>批量启用</span>
            </button>

            <button
              type="button"
              className="by-btn by-btn-secondary by-btn-sm"
              style={{ height: '30px', padding: '0 10px', fontSize: '0.8rem', gap: '4px' }}
              onClick={() => handleBatchToggle(false)}
              disabled={batchLoading}
            >
              <Lock size={13} color="var(--by-warning)" />
              <span>批量冻结</span>
            </button>

            <button
              type="button"
              className="by-btn by-btn-danger by-btn-sm"
              style={{ height: '30px', padding: '0 12px', fontSize: '0.8rem', gap: '4px' }}
              onClick={() => setShowBatchDeleteModal(true)}
              disabled={batchLoading}
            >
              <Trash2 size={13} />
              <span>批量删除</span>
            </button>
          </div>
        </div>
      )}

      {/* Token List Table / Card View */}
      <div className="by-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="by-table-wrapper mobile-card-view">
          <table className="by-table">
            <thead>
              <tr>
                <th style={{ width: '42px', textAlign: 'center', padding: '10px 8px' }}>
                  <input
                    type="checkbox"
                    className="by-checkbox"
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    checked={tokens.length > 0 && tokens.every((t) => selectedTokenIds.includes(t.id))}
                    ref={(el) => {
                      if (el) {
                        const hasSome = tokens.some((t) => selectedTokenIds.includes(t.id));
                        const hasAll = tokens.length > 0 && tokens.every((t) => selectedTokenIds.includes(t.id));
                        el.indeterminate = hasSome && !hasAll;
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const newIds = Array.from(new Set([...selectedTokenIds, ...tokens.map((t) => t.id)]));
                        setSelectedTokenIds(newIds);
                      } else {
                        setSelectedTokenIds(selectedTokenIds.filter((id) => !tokens.some((t) => t.id === id)));
                      }
                    }}
                  />
                </th>
                <th>Token 密钥凭据</th>
                <th>使用者备注</th>
                <th>数据返回权限</th>
                <th>抓取分支</th>
                <th style={{ minWidth: '170px' }}>额度消费进度 (已用 / 总额)</th>
                <th>状态</th>
                <th>创建 / 到期时间</th>
                <th>快捷充值</th>
                <th>管理操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && tokens.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    正在载入 Token 列表...
                  </td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-muted)' }}>
                    暂无授权 Token，点击右上角【发行新 Token】开始创建
                  </td>
                </tr>
              ) : (
                tokens.map((item) => {
                  const percent = Math.min(100, Math.round((item.usedQuota / item.totalQuota) * 100));
                  return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', padding: '10px 8px', width: '42px' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="by-checkbox"
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          checked={selectedTokenIds.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTokenIds([...selectedTokenIds, item.id]);
                            } else {
                              setSelectedTokenIds(selectedTokenIds.filter((id) => id !== item.id));
                            }
                          }}
                        />
                      </td>
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

                      <td data-label="数据权限">
                        {renderScopeBadge(item.scopeMode)}
                      </td>

                      <td data-label="抓取分支">
                        {renderEngineBadge(item.enginePreference)}
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
                            onClick={() => handleOpenEdit(item)}
                            title="编辑 Token 权限与配置 (数据范围/Chrome/IMAP分支)"
                            style={{ color: 'var(--by-purple)' }}
                          >
                            <SlidersHorizontal size={13} />
                          </button>
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
          <div className="by-modal" style={{ maxWidth: '500px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="var(--by-primary)" /> 发行新 API 授权 Token
              </div>
              <button className="by-btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  <label className="by-label">数据返回权限 (Scope)</label>
                  <select
                    className="by-select"
                    value={newScopeMode}
                    onChange={(e) => setNewScopeMode(e.target.value as ScopeMode)}
                  >
                    <option value="code_only">仅提取验证码 (精简极速，不返正文，推荐)</option>
                    <option value="summary">邮件摘要模式 (含主题/发件人/预览，剔除正文)</option>
                    <option value="full">完整邮件报文 (包含全部 HTML/Text 正文)</option>
                  </select>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
                    {newScopeMode === 'code_only' && '⚡ 极致轻量：报文 < 500 字节，并在找到验证码时提前中断 IMAP 下载。'}
                    {newScopeMode === 'summary' && '📄 包含邮件列表与 300 字摘要，不返回几十 KB 冗长 HTML。'}
                    {newScopeMode === 'full' && '📦 返回完整邮件 Raw/HTML 报文内容。'}
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">邮件抓取执行分支 (Engine)</label>
                  <select
                    className="by-select"
                    value={newEnginePreference}
                    onChange={(e) => setNewEnginePreference(e.target.value as EnginePreference)}
                  >
                    <option value="auto">智能自适应 (默认：Mail.com 走 RPA，普通走 IMAP)</option>
                    <option value="imap_pop3">强制 IMAP/POP3 协议 (速度快/省内存，适合已开启 IMAP 的 Mail.com)</option>
                    <option value="web_rpa">强制 Chrome 无头浏览器 (适合未开启 IMAP 或协议被封账号)</option>
                  </select>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
                    可针对 mail.com 邮箱自由切换：支持 IMAP 的走极速协议，不支持的走 Chrome。
                  </div>
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
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
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

      {/* Edit Token Permissions & Settings Modal */}
      {tokenToEdit && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '500px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} color="var(--by-purple)" /> 编辑 Token 权限与配置
              </div>
              <button className="by-btn-icon" onClick={() => setTokenToEdit(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'var(--by-bg-input)',
                  border: '1px solid var(--by-border)',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <code style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 600, color: 'var(--by-text-code)' }}>
                    {tokenToEdit.token}
                  </code>
                </div>

                <div className="by-input-group">
                  <label className="by-label">使用者备注名称</label>
                  <input
                    type="text"
                    className="by-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">数据返回权限 (Scope)</label>
                  <select
                    className="by-select"
                    value={editScopeMode}
                    onChange={(e) => setEditScopeMode(e.target.value as ScopeMode)}
                  >
                    <option value="code_only">仅提取验证码 (精简极速，不返正文，推荐)</option>
                    <option value="summary">邮件摘要模式 (含主题/发件人/预览，剔除正文)</option>
                    <option value="full">完整邮件报文 (包含全部 HTML/Text 正文)</option>
                  </select>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
                    遵循权限收敛原则：若设定为“仅验证码”，外部请求携带 ?scope=full 亦强制返回极简数据。
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">邮件抓取执行分支 (Engine)</label>
                  <select
                    className="by-select"
                    value={editEnginePreference}
                    onChange={(e) => setEditEnginePreference(e.target.value as EnginePreference)}
                  >
                    <option value="auto">智能自适应 (默认：Mail.com 走 RPA，普通走 IMAP)</option>
                    <option value="imap_pop3">强制 IMAP/POP3 协议 (速度快/省内存，适合已开启 IMAP 的 Mail.com)</option>
                    <option value="web_rpa">强制 Chrome 无头浏览器 (适合未开启 IMAP 或协议被封账号)</option>
                  </select>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
                    实时热切换：随时调整该 Token 下的 Mail.com 等账号走 Chrome RPA 还是 IMAP 协议。
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">总调用额度 (次数)</label>
                  <input
                    type="number"
                    className="by-input"
                    min={tokenToEdit.usedQuota}
                    value={editQuota}
                    onChange={(e) => setEditQuota(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '3px' }}>
                    当前已消耗 {tokenToEdit.usedQuota} 次，修改后剩余可用次数为 {Math.max(0, (Number(editQuota) || 0) - tokenToEdit.usedQuota)} 次。
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">重新设置有效期</label>
                  <select className="by-select" value={editDuration} onChange={(e) => setEditDuration(e.target.value)}>
                    <option value="0">保持原有效期 ({tokenToEdit.expiresAt ? formatFullDateTime(tokenToEdit.expiresAt) : '永久有效'})</option>
                    <option value="7">从现在起延长 7 天</option>
                    <option value="30">从现在起延长 30 天</option>
                    <option value="90">从现在起延长 90 天</option>
                    <option value="365">从现在起延长 1 年</option>
                  </select>
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setTokenToEdit(null)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={editLoading || !editName.trim()}>
                  {editLoading ? '正在保存...' : '保存权限配置'}
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
                  <div className="by-modal-title" style={{ fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>【{tokenForLogs.name}】Token 消耗与调用审计</span>
                    {renderScopeBadge(tokenForLogs.scopeMode)}
                    {renderEngineBadge(tokenForLogs.enginePreference)}
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
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      fontSize: '0.78rem',
                      color: 'var(--by-primary)',
                      borderColor: 'var(--by-primary)',
                      background: 'rgba(99, 102, 241, 0.08)',
                      fontWeight: 600,
                      gap: '4px',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                    onClick={handleOpenReconcileModal}
                    title="点击打开智能识别与额度校准弹窗"
                  >
                    <Sparkles size={13} color="var(--by-primary)" />
                    <span>智能识别</span>
                  </button>

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

      {/* Smart Reconciliation Pop-up Modal (智能识别与额度校准弹窗) */}
      {showReconcileModal && tokenForLogs && (
        <div className="by-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="by-modal" style={{ maxWidth: '520px', width: '92vw' }}>
            <div className="by-modal-header" style={{ padding: '16px 20px' }}>
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                <Sparkles size={18} color="var(--by-primary)" /> 智能识别与额度核销对齐
              </div>
              <button
                className="by-btn-icon"
                onClick={() => {
                  setShowReconcileModal(false);
                  setReconcileResult(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Token Info Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'var(--by-bg-input)',
                border: '1px solid var(--by-border)'
              }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginBottom: '2px' }}>目标 Token</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--by-text-primary)' }}>
                    {tokenForLogs.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginBottom: '2px' }}>总额度</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--by-text-secondary)' }}>
                    {tokenForLogs.totalQuota} 次
                  </div>
                </div>
              </div>

              {!reconcileResult ? (
                <>
                  {/* Explanation Card */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '0.82rem',
                    lineHeight: '1.55',
                    color: 'var(--by-text-secondary)'
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--by-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Activity size={14} /> 智能识别核销说明：
                    </div>
                    <div>
                      系统将自动检索审计日志中该 Token 名下<strong>所有正常成功（提取到验证码/成功读取邮件）</strong>的真实有效调用记录，并将已用额度自动校准对齐为真实成功流水件数。
                    </div>
                  </div>

                  {/* Live Calculation Comparison Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px'
                  }}>
                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'var(--by-bg-input)',
                      border: '1px solid var(--by-border)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginBottom: '4px' }}>
                        当前记录已消耗
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--by-warning)' }}>
                        {tokenForLogs.usedQuota} <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>次</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', marginTop: '2px' }}>
                        剩余可用: {tokenForLogs.remainingQuota} 次
                      </div>
                    </div>

                    <div style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>
                        审计流水实际成功
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                        {tokenLogsStats?.successCalls ?? 0} <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>次</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', marginTop: '2px' }}>
                        核销后预计剩余: {Math.max(0, tokenForLogs.totalQuota - (tokenLogsStats?.successCalls ?? 0))} 次
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Notice */}
                  <div style={{
                    fontSize: '0.78rem',
                    color: (tokenLogsStats?.successCalls ?? 0) === tokenForLogs.usedQuota ? 'var(--by-text-muted)' : 'var(--by-info)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 2px'
                  }}>
                    <CheckCircle size={13} color={(tokenLogsStats?.successCalls ?? 0) === tokenForLogs.usedQuota ? 'var(--by-text-muted)' : 'var(--by-info)'} />
                    <span>
                      {(tokenLogsStats?.successCalls ?? 0) === tokenForLogs.usedQuota
                        ? '当前已消耗额度与成功审计记录完全一致，核销后数据保持一致。'
                        : `核销后已用额度将调整至 ${tokenLogsStats?.successCalls ?? 0} 次（差额 ${(tokenLogsStats?.successCalls ?? 0) - tokenForLogs.usedQuota >= 0 ? '+' : ''}${(tokenLogsStats?.successCalls ?? 0) - tokenForLogs.usedQuota} 次）。`}
                    </span>
                  </div>
                </>
              ) : (
                /* Success Feedback Card */
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', margin: '0 auto', color: '#10b981' }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--by-text-primary)' }}>
                    智能识别与核销对齐完成！
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--by-text-secondary)', lineHeight: '1.5' }}>
                    Token <strong>"{reconcileResult.token.name}"</strong> 已用额度已成功校准为 <strong>{reconcileResult.reconciledCount} 次</strong>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '16px',
                    padding: '8px 12px',
                    background: 'var(--by-bg-input)',
                    borderRadius: '8px',
                    border: '1px solid var(--by-border)',
                    fontSize: '0.8rem',
                    color: 'var(--by-text-secondary)',
                    marginTop: '4px'
                  }}>
                    <span>总额度: <strong>{reconcileResult.token.totalQuota} 次</strong></span>
                    <span>已用: <strong style={{ color: 'var(--by-warning)' }}>{reconcileResult.token.usedQuota} 次</strong></span>
                    <span>剩余可用: <strong style={{ color: 'var(--by-success)' }}>{reconcileResult.token.remainingQuota} 次</strong></span>
                  </div>
                </div>
              )}
            </div>

            <div className="by-modal-footer" style={{ padding: '12px 20px' }}>
              {!reconcileResult ? (
                <>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary"
                    onClick={() => setShowReconcileModal(false)}
                    disabled={reconcileLoading}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="by-btn by-btn-primary"
                    onClick={handleConfirmReconcile}
                    disabled={reconcileLoading}
                    style={{ gap: '6px' }}
                  >
                    <Sparkles size={14} className={reconcileLoading ? 'animate-spin' : ''} />
                    {reconcileLoading ? '正在核销对齐...' : '确认智能核销对齐'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="by-btn by-btn-primary"
                  onClick={() => {
                    setShowReconcileModal(false);
                    setReconcileResult(null);
                  }}
                  style={{ width: '100%' }}
                >
                  确定并完成
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      <ConfirmModal
        isOpen={showBatchDeleteModal}
        title="批量删除授权 Token"
        message={
          <div>
            确定要批量删除选中的 <strong style={{ color: 'var(--by-danger)' }}>{selectedTokenIds.length}</strong> 个授权 Token 吗？
            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--by-danger)' }}>
              ⚠️ 此操作不可撤销，删除后使用这些 Token 的所有外部接口调用将立即失效！
            </div>
          </div>
        }
        confirmText="确认批量删除"
        cancelText="取消"
        variant="danger"
        loading={batchLoading}
        onConfirm={handleBatchDelete}
        onClose={() => setShowBatchDeleteModal(false)}
      />

      {/* Batch Reconcile Modal */}
      {showBatchReconcileModal && (
        <div className="by-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="by-modal" style={{ maxWidth: '580px', width: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="by-modal-header" style={{ padding: '16px 20px' }}>
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem' }}>
                <Sparkles size={18} color="var(--by-primary)" /> 批量智能识别与额度校准
              </div>
              <button
                className="by-btn-icon"
                onClick={() => {
                  setShowBatchReconcileModal(false);
                  setBatchReconcileResult(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body" style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!batchReconcileResult ? (
                <>
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '0.82rem',
                    lineHeight: '1.55',
                    color: 'var(--by-text-secondary)'
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--by-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Activity size={14} /> 批量核销说明：
                    </div>
                    <div>
                      将对已勾选的 <strong>{selectedTokenIds.length}</strong> 个 Token 逐个扫描审计日志中的真实正常成功（验证码/邮件）调用件数，并将各 Token 已用额度与实际成功流水严格校准对齐。
                    </div>
                  </div>

                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--by-text-secondary)', marginBottom: '-6px' }}>
                    待校准 Token 列表 ({selectedTokenIds.length} 项)：
                  </div>

                  <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {tokens
                      .filter((t) => selectedTokenIds.includes(t.id))
                      .map((t) => (
                        <div key={t.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'var(--by-bg-input)',
                          border: '1px solid var(--by-border)',
                          fontSize: '0.8rem'
                        }}>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{t.name}</span>
                            <span style={{ marginLeft: '8px', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)', fontSize: '0.74rem' }}>
                              ({t.token.slice(0, 10)}...)
                            </span>
                          </div>
                          <div style={{ color: 'var(--by-text-secondary)' }}>
                            当前已用: <strong style={{ color: 'var(--by-warning)' }}>{t.usedQuota}</strong> / {t.totalQuota} 次
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    textAlign: 'center'
                  }}>
                    <div style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', marginBottom: '6px' }}>
                      <CheckCircle2 size={22} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--by-text-primary)' }}>
                      {batchReconcileResult.message}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--by-text-secondary)', marginBottom: '-4px' }}>
                    核销对齐明细：
                  </div>

                  <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {batchReconcileResult.results.map((r) => (
                      <div key={r.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'var(--by-bg-input)',
                        border: '1px solid var(--by-border)',
                        fontSize: '0.8rem'
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{r.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--by-text-muted)' }}>
                            原已用: {r.previousUsedQuota} 次 ➔ 校准后已用: <strong style={{ color: 'var(--by-primary)' }}>{r.reconciledCount} 次</strong>
                          </span>
                          <span style={{ color: 'var(--by-success)', fontWeight: 600 }}>
                            剩余: {r.remainingQuota} 次
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="by-modal-footer" style={{ padding: '12px 20px' }}>
              {!batchReconcileResult ? (
                <>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary"
                    onClick={() => setShowBatchReconcileModal(false)}
                    disabled={batchLoading}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="by-btn by-btn-primary"
                    onClick={handleConfirmBatchReconcile}
                    disabled={batchLoading}
                    style={{ gap: '6px' }}
                  >
                    <Sparkles size={14} className={batchLoading ? 'animate-spin' : ''} />
                    {batchLoading ? '正在批量核销...' : `确认批量核销 (${selectedTokenIds.length}项)`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="by-btn by-btn-primary"
                  onClick={() => {
                    setShowBatchReconcileModal(false);
                    setBatchReconcileResult(null);
                    setSelectedTokenIds([]);
                  }}
                  style={{ width: '100%' }}
                >
                  确定并完成
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
