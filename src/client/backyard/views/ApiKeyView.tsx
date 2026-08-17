import React, { useEffect, useState, useRef } from 'react';
import {
  Key,
  Plus,
  Upload,
  Download,
  Copy,
  Check,
  Trash2,
  Play,
  Clock,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
  ListFilter,
  FileText,
  KeyRound,
  Zap,
  FolderUp,
  X,
  ChevronDown
} from 'lucide-react';
import { backyardApi } from '../api';
import type { ApiKeyItem, AccessTokenItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatDuration, formatFullDateTime, type DatePreset } from '../../../shared/format-utils';
import { DateRangeFilter } from '../components/DateRangeFilter';

export const ApiKeyView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [tokenFilter, setTokenFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom' | null>(null);

  // Selection for Batch Export
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateSingleModal, setShowCreateSingleModal] = useState(false);

  // Delete Confirm Modal State
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Import Modal State & TXT File
  const [importText, setImportText] = useState('');
  const [importProvider, setImportProvider] = useState('smart');
  const [importExpiry, setImportExpiry] = useState('0');
  const [importBatchName, setImportBatchName] = useState('');
  const [importTokenId, setImportTokenId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);

  // Quick Token Creation inside Import Modal
  const [showQuickTokenPanel, setShowQuickTokenPanel] = useState(false);
  const [quickTokenName, setQuickTokenName] = useState('');
  const [quickTokenQuota, setQuickTokenQuota] = useState(20);
  const [quickTokenDuration, setQuickTokenDuration] = useState('0');
  const [quickTokenLoading, setQuickTokenLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Searchable Token Select Dropdown State
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [tokenDisplayCount, setTokenDisplayCount] = useState(10);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  // Export Modal State & Token Binding
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'custom' | 'csv' | 'json' | 'urls'>('custom');
  const [availableTokens, setAvailableTokens] = useState<AccessTokenItem[]>([]);
  const [selectedTokenForExport, setSelectedTokenForExport] = useState('');
  const [exportedContent, setExportedContent] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);

  // Test Drawer State
  const [testingKey, setTestingKey] = useState<ApiKeyItem | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await backyardApi.getKeys({
        page,
        pageSize,
        search,
        status,
        provider,
        tokenId: tokenFilter !== 'all' ? tokenFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setKeys(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to load api keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (start: string, end: string, preset?: DatePreset | 'custom' | null) => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset || null);
    setPage(1);
  };

  const loadAvailableTokens = async () => {
    try {
      const res = await backyardApi.getTokens({ pageSize: 100 });
      const activeTokens = res.items.filter((t) => t.isActive && !t.isExhausted);
      setAvailableTokens(activeTokens);
      if (activeTokens.length > 0 && !importTokenId) {
        setImportTokenId(activeTokens[0].id);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    }
  };

  // Click outside to close token dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setTokenDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [page, pageSize, status, provider, tokenFilter, startDate, endDate]);

  useEffect(() => {
    loadAvailableTokens();
  }, []);

  const handleCopyUrl = (apiKey: string) => {
    const origin = window.location.origin;
    const url = `${origin}/api/${apiKey}`;
    navigator.clipboard.writeText(url);
    setCopiedKey(apiKey);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleActive = async (key: ApiKeyItem) => {
    try {
      setErrorMsg(null);
      await backyardApi.toggleKeyActive(key.id, !key.isActive);
      fetchKeys();
    } catch (err: any) {
      setErrorMsg(err.message || '操作失败');
    }
  };

  const handleConfirmDeleteKey = async () => {
    if (!keyToDelete) return;
    setDeleteLoading(true);
    setErrorMsg(null);
    try {
      await backyardApi.deleteKey(keyToDelete.id);
      setKeyToDelete(null);
      fetchKeys();
    } catch (err: any) {
      setErrorMsg(err.message || '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleTxtFile = (file: File) => {
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
      alert('请上传 .txt 纯文本文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setImportText(text);
      setUploadedFile({ name: file.name, size: file.size });
      if (!importBatchName) {
        setImportBatchName(file.name.replace(/\.txt$/i, ''));
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleTxtFile(file);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleTxtFile(file);
    }
  };

  const handleOpenImport = () => {
    setShowImportModal(true);
    setImportResult(null);
    setUploadedFile(null);
    setImportText('');
    loadAvailableTokens();
  };

  const handleQuickCreateToken = async () => {
    if (!quickTokenName.trim()) {
      alert('请填写 Token 备注名称');
      return;
    }
    setQuickTokenLoading(true);
    try {
      const duration = Number(quickTokenDuration);
      const newTok = await backyardApi.createToken({
        name: quickTokenName.trim(),
        totalQuota: Number(quickTokenQuota) || 20,
        durationDays: duration > 0 ? duration : null
      });
      await loadAvailableTokens();
      if (newTok?.token?.id) {
        setImportTokenId(newTok.token.id);
      }
      setShowQuickTokenPanel(false);
      setQuickTokenName('');
    } catch (err: any) {
      alert(err.message || '发行 Token 失败');
    } finally {
      setQuickTokenLoading(false);
    }
  };

  const handleBatchImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      alert('请粘贴账号密码或上传 .txt 文件');
      return;
    }

    if (!importTokenId) {
      alert('请选择需要绑定的授权 Token（必选项），若无可用 Token 请点击【快速发行新 Token】');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const hours = Number(importExpiry);
      const res = await backyardApi.batchImportKeys({
        rawText: importText,
        defaultProvider: importProvider,
        expiresInHours: hours > 0 ? hours : null,
        batchName: importBatchName || undefined,
        tokenId: importTokenId
      });
      setImportResult(res);
      fetchKeys();
    } catch (err: any) {
      alert(err.message || '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleOpenExport = async (format: 'custom' | 'csv' | 'json' | 'urls' = 'custom') => {
    setShowExportModal(true);
    setExportFormat(format);
    setExporting(true);
    try {
      const tokenRes = await backyardApi.getTokens({ pageSize: 100 });
      setAvailableTokens(tokenRes.items.filter((t) => t.isActive && !t.isExhausted));

      const res = await backyardApi.batchExportKeys({
        format,
        token: selectedTokenForExport || undefined
      });
      setExportedContent(res.formatted);
    } catch (err: any) {
      alert(err.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportFormatChange = async (format: 'custom' | 'csv' | 'json' | 'urls') => {
    setExportFormat(format);
    setExporting(true);
    try {
      const res = await backyardApi.batchExportKeys({
        format,
        token: selectedTokenForExport || undefined
      });
      setExportedContent(res.formatted);
    } catch (err: any) {
      alert(err.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportTokenChange = async (tokenStr: string) => {
    setSelectedTokenForExport(tokenStr);
    setExporting(true);
    try {
      const res = await backyardApi.batchExportKeys({
        format: exportFormat,
        token: tokenStr || undefined
      });
      setExportedContent(res.formatted);
    } catch (err: any) {
      alert(err.message || '更新导出内容失败');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyExportContent = () => {
    navigator.clipboard.writeText(exportedContent);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleDownloadExport = () => {
    const ext = exportFormat === 'csv' ? 'csv' : exportFormat === 'json' ? 'json' : 'txt';
    const blob = new Blob([exportedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inbox_mate_apikeys_${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartTestKey = async (item: ApiKeyItem) => {
    setTestingKey(item);
    setTestResult(null);
    setTestError(null);
    setTestLoading(true);

    try {
      const res = await backyardApi.testApiKey(item.apiKey);
      setTestResult(res);
    } catch (err: any) {
      setTestError(err.message || '在线测试拉取失败');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Quick Action Buttons */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <Key size={22} color="var(--by-primary)" />
            <span>API Key 密钥管理</span>
          </h2>
          <p className="by-view-desc">
            支持批量导入账号密码生成公共拉取 API，凭据经 AES-256-GCM 强加密保存
          </p>
        </div>
        <div className="by-view-actions">
          <button className="by-btn by-btn-secondary" onClick={() => handleOpenExport('custom')}>
            <Download size={15} /> 批量导出
          </button>
          <button className="by-btn by-btn-primary" onClick={handleOpenImport}>
            <Upload size={15} /> 批量导入生成
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="by-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <input
              type="text"
              className="by-input"
              placeholder="搜索邮箱账号、API Key 或备注..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchKeys()}
              style={{ paddingLeft: '36px' }}
            />
            <Search size={16} color="var(--by-text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          </div>

          <div style={{ minWidth: '130px', flex: '0 1 auto' }}>
            <select className="by-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">全部状态</option>
              <option value="active">生效中 (Active)</option>
              <option value="expired">已过期 (Expired)</option>
              <option value="disabled">已禁用 (Disabled)</option>
            </select>
          </div>

          <div style={{ minWidth: '150px', flex: '0 1 auto' }}>
            <select className="by-select" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}>
              <option value="all">全部邮箱类型</option>
              <option value="mailcom">Mail.com</option>
              <option value="microsoft">Microsoft</option>
              <option value="gmx">GMX</option>
              <option value="rambler">Rambler</option>
              <option value="custom">自定义 IMAP</option>
            </select>
          </div>

          <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
            <select className="by-select" value={tokenFilter} onChange={(e) => { setTokenFilter(e.target.value); setPage(1); }}>
              <option value="all">全部绑定 Token</option>
              {availableTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (余{t.remainingQuota}次)
                </option>
              ))}
            </select>
          </div>

          <button className="by-btn by-btn-secondary" onClick={fetchKeys} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--by-border)', paddingTop: '10px' }}>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            activePreset={activePreset}
            onChange={handleDateChange}
          />
        </div>
      </div>

      {/* Keys Table / Mobile Cards */}
      <div className="by-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="by-table-wrapper mobile-card-view">
          <table className="by-table">
            <thead>
              <tr>
                <th>邮箱账号</th>
                <th>服务商</th>
                <th>绑定授权 Token</th>
                <th>API 访问地址 (一键复制)</th>
                <th>状态</th>
                <th>有效期</th>
                <th>调用次数</th>
                <th>最后使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && keys.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    正在载入 API Key 列表...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-muted)' }}>
                    暂无 API Key，请点击右上角【批量导入生成】快速生成
                  </td>
                </tr>
              ) : (
                keys.map((item) => {
                  const isExpired = item.expiresAt && new Date(item.expiresAt) <= new Date();
                  const origin = window.location.origin;
                  const tokenQuery = item.boundToken ? `?token=${encodeURIComponent(item.boundToken)}` : '';
                  const fullUrl = `${origin}/api/${item.apiKey}${tokenQuery}`;

                  return (
                    <tr key={item.id}>
                      <td data-label="邮箱账号">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{item.accountEmail}</span>
                          {item.name && <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>{item.name}</span>}
                        </div>
                      </td>

                      <td data-label="服务商">
                        <span style={{ textTransform: 'capitalize', color: 'var(--by-text-secondary)', fontSize: '0.84rem' }}>
                          {item.provider === 'mailcom' ? 'Mail.com' : item.provider}
                        </span>
                      </td>

                      <td data-label="绑定授权 Token">
                        {item.boundToken ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span
                              className="by-badge by-badge-info"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={`Token: ${item.boundToken}`}
                            >
                              <KeyRound size={11} /> {item.boundTokenName || item.boundToken.slice(0, 10) + '...'}
                            </span>
                            {item.boundTokenRemaining !== null && item.boundTokenRemaining !== undefined && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)' }}>
                                剩余 {item.boundTokenRemaining} 次
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)' }}>未绑定</span>
                        )}
                      </td>

                      <td data-label="API 访问地址">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code style={{
                            background: 'var(--by-bg-input)',
                            border: '1px solid var(--by-border)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            color: 'var(--by-text-code)',
                            fontFamily: 'var(--by-font-mono)',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            /api/{item.apiKey}{tokenQuery}
                          </code>
                          <button
                            onClick={() => handleCopyUrl(item.apiKey)}
                            className="by-btn by-btn-secondary by-btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                            title="复制完整 API URL"
                          >
                            {copiedKey === item.apiKey ? <Check size={12} color="var(--by-success)" /> : <Copy size={12} />}
                            {copiedKey === item.apiKey ? '已复制' : '复制URL'}
                          </button>
                        </div>
                      </td>

                      <td data-label="状态">
                        {!item.isActive ? (
                          <span className="by-badge by-badge-neutral">已禁用</span>
                        ) : isExpired ? (
                          <span className="by-badge by-badge-danger">已过期</span>
                        ) : (
                          <span className="by-badge by-badge-success">生效中</span>
                        )}
                      </td>

                      <td data-label="有效期" style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)' }}>
                        {item.expiresAt ? formatFullDateTime(item.expiresAt) : '永久有效'}
                      </td>

                      <td data-label="调用次数" style={{ fontFamily: 'var(--by-font-mono)', color: 'var(--by-text-primary)', fontWeight: 600 }}>
                        {item.callCount}
                      </td>

                      <td data-label="最后使用" style={{ fontSize: '0.8rem', color: 'var(--by-text-muted)' }}>
                        {item.lastUsedAt ? formatFullDateTime(item.lastUsedAt) : '从未调用'}
                      </td>

                      <td data-label="操作">
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleStartTestKey(item)}
                            className="by-btn by-btn-secondary by-btn-sm"
                            title="在线测试实时拉取邮件"
                          >
                            <Play size={12} color="var(--by-success)" /> 测试
                          </button>
                          <button
                            onClick={() => handleToggleActive(item)}
                            className="by-btn by-btn-secondary by-btn-sm"
                            title={item.isActive ? '点击禁用' : '点击启用'}
                          >
                            {item.isActive ? '禁用' : '启用'}
                          </button>
                          <button
                            onClick={() => setKeyToDelete(item)}
                            className="by-btn by-btn-danger by-btn-sm"
                            title="删除此 Key"
                          >
                            <Trash2 size={12} />
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

        {/* Pagination Bar */}
        <div className="by-pagination" style={{ padding: '16px 20px 24px 20px', borderTop: '1px solid var(--by-border)' }}>
          <div className="by-pagination-info">
            共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{total}</span> 个 API Key • 第 {page} / {totalPages} 页
          </div>

          <div className="by-pagination-controls">
            <select
              className="by-select by-btn-sm"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ width: 'auto', padding: '0 28px 0 10px', height: '32px', lineHeight: '30px' }}
            >
              <option value="10">10条/页</option>
              <option value="20">20条/页</option>
              <option value="50">50条/页</option>
              <option value="100">100条/页</option>
            </select>

            <button
              className="by-btn by-btn-secondary by-btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              title={page <= 1 ? '已是第一页' : '上一页'}
            >
              <ChevronLeft size={14} /> 上一页
            </button>

            <button
              className="by-btn by-btn-secondary by-btn-sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading || totalPages <= 1}
              title={page >= totalPages ? '已是最后一页' : '下一页'}
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Floating Thumb Bar (< 768px) */}
      <div className="by-floating-bar">
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--by-text-primary)' }}>
          共 {total} 个 API Key
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="by-btn by-btn-secondary by-btn-sm" onClick={() => handleOpenExport('custom')}>
            <Download size={14} /> 导出
          </button>
          <button className="by-btn by-btn-primary by-btn-sm" onClick={handleOpenImport}>
            <Plus size={14} /> 批量导入
          </button>
        </div>
      </div>

      {/* Batch Import Modal */}
      {showImportModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '680px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="var(--by-primary)" /> 批量导入账号并发行 API Key
              </div>
              <button className="by-btn-icon" onClick={() => setShowImportModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBatchImportSubmit}>
              <div className="by-modal-body">
                <div style={{ marginBottom: '14px', fontSize: '0.84rem', color: 'var(--by-text-secondary)', lineHeight: 1.5 }}>
                  支持任意格式文本粘贴或直接上传 <code>.txt</code> 文件（系统智能识别邮箱和密码），如：<br />
                  <code style={{ color: 'var(--by-text-code)' }}>账号: anais_officiavhr@mail.com | 密码: oL9KZDccB</code><br />
                  <code style={{ color: 'var(--by-text-code)' }}>user@mail.com----mypassword</code> 或 <code style={{ color: 'var(--by-text-code)' }}>user@domain.com:password</code>
                </div>

                {/* TXT File Drag & Drop Zone */}
                <div
                  className={`by-file-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed var(--by-border-strong)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    textAlign: 'center',
                    background: isDragging ? 'var(--by-info-bg)' : 'var(--by-bg-input)',
                    cursor: 'pointer',
                    marginBottom: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--by-primary)' }}>
                    <FolderUp size={18} />
                    <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>点击选择或拖拽 .txt 文件至此处导入</span>
                  </div>
                  {uploadedFile ? (
                    <div style={{ marginTop: '4px', fontSize: '0.76rem', color: 'var(--by-success)', fontWeight: 600 }}>
                      ✓ 已成功读取文件: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  ) : (
                    <div style={{ marginTop: '2px', fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>
                      支持纯文本文件，读取后将自动填入下方输入框
                    </div>
                  )}
                </div>

                <div className="by-input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="by-label" style={{ margin: 0, fontSize: '0.82rem' }}>粘贴账号密码文本 (一行一个)</label>
                    {importText && (
                      <button
                        type="button"
                        className="by-btn-icon"
                        onClick={() => { setImportText(''); setUploadedFile(null); }}
                        style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}
                      >
                        清空文本
                      </button>
                    )}
                  </div>
                  <textarea
                    className="by-textarea"
                    rows={3}
                    placeholder={`账号: anais_officiavhr@mail.com | 密码: oL9KZDccB\n账号: test_user@outlook.com | 密码: mypassword123`}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    style={{ minHeight: '68px', maxHeight: '110px', fontSize: '0.82rem' }}
                    required
                  />
                </div>

                {/* Token Binding Selector (Mandatory) & Quick Issuer */}
                <div style={{
                  margin: '14px 0',
                  background: 'var(--by-bg-card-subtle)',
                  padding: '14px',
                  borderRadius: '8px',
                  border: '1px solid var(--by-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="by-label" style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <KeyRound size={15} color="var(--by-primary)" />
                      <span>归属授权 Token <span style={{ color: 'var(--by-danger)' }}>* (必选)</span></span>
                    </label>
                    <button
                      type="button"
                      className="by-btn by-btn-secondary by-btn-sm"
                      onClick={() => setShowQuickTokenPanel(!showQuickTokenPanel)}
                      style={{ fontSize: '0.76rem', padding: '3px 8px' }}
                    >
                      <Plus size={13} /> 快速发行新 Token
                    </button>
                  </div>

                  {/* Searchable & Scrollable Token Select Dropdown */}
                  <div className="by-token-select-container" ref={tokenDropdownRef}>
                    <div
                      className={`by-token-select-trigger ${tokenDropdownOpen ? 'active' : ''}`}
                      onClick={() => {
                        setTokenDropdownOpen(!tokenDropdownOpen);
                        if (!tokenDropdownOpen) {
                          setTokenDisplayCount(10);
                          setTokenSearchQuery('');
                        }
                      }}
                    >
                      {(() => {
                        const sel = availableTokens.find((t) => t.id === importTokenId);
                        if (sel) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden', flex: 1 }}>
                              <KeyRound size={14} color="var(--by-primary)" style={{ flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, color: 'var(--by-text-primary)', whiteSpace: 'nowrap' }}>{sel.name}</span>
                              <span style={{ fontSize: '0.74rem', color: 'var(--by-success)', background: 'var(--by-success-bg)', padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                剩余 {sel.remainingQuota}/{sel.totalQuota} 次
                              </span>
                              <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                - {sel.token.slice(0, 16)}...
                              </span>
                            </div>
                          );
                        }
                        return <span style={{ color: 'var(--by-text-muted)' }}>-- 请输入或选择要绑定的授权 Token (必选项) --</span>;
                      })()}
                      <ChevronDown size={15} style={{ color: 'var(--by-text-muted)', transform: tokenDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0, marginLeft: '8px' }} />
                    </div>

                    {tokenDropdownOpen && (
                      <div className="by-token-dropdown-menu">
                        <div className="by-token-search-header">
                          <Search size={14} color="var(--by-text-muted)" />
                          <input
                            type="text"
                            className="by-token-search-input"
                            placeholder="按 Token 备注名称或密钥字符检索..."
                            value={tokenSearchQuery}
                            autoFocus
                            onChange={(e) => {
                              setTokenSearchQuery(e.target.value);
                              setTokenDisplayCount(10);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {tokenSearchQuery && (
                            <button
                              type="button"
                              className="by-btn-icon"
                              style={{ width: '18px', height: '18px', padding: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTokenSearchQuery('');
                                setTokenDisplayCount(10);
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {(() => {
                          const q = tokenSearchQuery.trim().toLowerCase();
                          const filtered = availableTokens.filter((t) => {
                            if (!q) return true;
                            return t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q);
                          });
                          const visible = filtered.slice(0, tokenDisplayCount);

                          return (
                            <div
                              className="by-token-list-scroll"
                              onScroll={(e) => {
                                const target = e.currentTarget;
                                if (target.scrollTop + target.clientHeight >= target.scrollHeight - 15) {
                                  if (tokenDisplayCount < filtered.length) {
                                    setTokenDisplayCount((prev) => prev + 10);
                                  }
                                }
                              }}
                            >
                              {visible.length === 0 ? (
                                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--by-text-muted)', fontSize: '0.82rem' }}>
                                  未检索到匹配的授权 Token
                                </div>
                              ) : (
                                visible.map((t) => {
                                  const isSelected = t.id === importTokenId;
                                  return (
                                    <div
                                      key={t.id}
                                      className={`by-token-item ${isSelected ? 'selected' : ''}`}
                                      onClick={() => {
                                        setImportTokenId(t.id);
                                        setTokenDropdownOpen(false);
                                      }}
                                    >
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="by-token-item-name">
                                          <span>{t.name}</span>
                                          <span style={{ fontSize: '0.72rem', color: 'var(--by-success)', background: 'var(--by-success-bg)', padding: '1px 5px', borderRadius: '4px', fontWeight: 500 }}>
                                            余 {t.remainingQuota}/{t.totalQuota} 次
                                          </span>
                                        </div>
                                        <div className="by-token-item-sub">
                                          {t.token}
                                        </div>
                                      </div>
                                      {isSelected && <Check size={14} color="var(--by-primary)" style={{ flexShrink: 0, marginLeft: '8px' }} />}
                                    </div>
                                  );
                                })
                              )}

                              {filtered.length > tokenDisplayCount && (
                                <div style={{ padding: '6px', textAlign: 'center', color: 'var(--by-text-muted)', fontSize: '0.74rem' }}>
                                  向下滚动加载更多 (已展示 {visible.length} / 共 {filtered.length} 条)...
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '6px' }}>
                    强绑定后，该批次生成的每个 API Key 调取抓取时将自动从所选 Token 扣费，便于精细化追踪与成本控制。
                  </div>

                  {/* Inline Quick Token Creation Panel */}
                  {showQuickTokenPanel && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: 'var(--by-bg-input)',
                      borderRadius: '6px',
                      border: '1px dashed var(--by-primary)'
                    }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--by-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={14} /> 极速发行新 Token 并自动绑定
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="by-input"
                          placeholder="Token 备注名称 (如: 8月17日批次)"
                          value={quickTokenName}
                          onChange={(e) => setQuickTokenName(e.target.value)}
                          style={{ fontSize: '0.82rem' }}
                        />
                        <input
                          type="number"
                          className="by-input"
                          placeholder="额度次数"
                          value={quickTokenQuota}
                          onChange={(e) => setQuickTokenQuota(Math.max(1, Number(e.target.value)))}
                          min={1}
                          style={{ fontSize: '0.82rem' }}
                        />
                        <select
                          className="by-select"
                          value={quickTokenDuration}
                          onChange={(e) => setQuickTokenDuration(e.target.value)}
                          style={{ fontSize: '0.82rem' }}
                        >
                          <option value="0">永久有效</option>
                          <option value="7">7 天</option>
                          <option value="30">30 天</option>
                        </select>
                        <button
                          type="button"
                          className="by-btn by-btn-primary by-btn-sm"
                          onClick={handleQuickCreateToken}
                          disabled={quickTokenLoading || !quickTokenName.trim()}
                        >
                          {quickTokenLoading ? '发行中...' : '立即发行'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="by-input-group">
                    <label className="by-label">邮箱类型 / 协议</label>
                    <select className="by-select" value={importProvider} onChange={(e) => setImportProvider(e.target.value)}>
                      <option value="smart">智能自动识别 (推荐)</option>
                      <option value="mailcom">Mail.com (Web RPA)</option>
                      <option value="microsoft">Microsoft (Outlook / Live)</option>
                      <option value="gmx">GMX</option>
                      <option value="rambler">Rambler</option>
                      <option value="custom">自定义 IMAP</option>
                    </select>
                  </div>

                  <div className="by-input-group">
                    <label className="by-label">有效期设置</label>
                    <select className="by-select" value={importExpiry} onChange={(e) => setImportExpiry(e.target.value)}>
                      <option value="0">永久有效</option>
                      <option value="1">1 小时</option>
                      <option value="24">24 小时 (1 天)</option>
                      <option value="168">7 天</option>
                      <option value="720">30 天</option>
                      <option value="2160">90 天</option>
                    </select>
                  </div>
                </div>

                <div className="by-input-group" style={{ marginTop: '14px' }}>
                  <label className="by-label">批量批次名称 / 备注 (可选)</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如: 8月17日第一批采购"
                    value={importBatchName}
                    onChange={(e) => setImportBatchName(e.target.value)}
                  />
                </div>

                {importResult && (
                  <div style={{
                    marginTop: '16px',
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'var(--by-success-bg)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--by-success)',
                    fontSize: '0.88rem'
                  }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} /> 导入完成！
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                      共处理 {importResult.totalProcessed} 行，成功生成 {importResult.successCount} 个 Key，失败 {importResult.failedCount} 行。
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        className="by-btn by-btn-secondary by-btn-sm"
                        onClick={() => {
                          setShowImportModal(false);
                          handleOpenExport('custom');
                        }}
                      >
                        立即批量导出带 API 格式
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowImportModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={importing || !importText.trim() || !importTokenId}>
                  {importing ? '正在生成...' : '立即批量生成 API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Export Modal */}
      {showExportModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '720px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} color="var(--by-success)" /> 批量导出 API 关联列表
              </div>
              <button className="by-btn-icon" onClick={() => setShowExportModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body">
              {/* Token Binding Selector (User Suggestion 2) */}
              <div style={{ marginBottom: '14px', background: 'var(--by-bg-input)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <label className="by-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span>🔗 关联绑定授权 Token (选填，自动在 URL 后附加 ?token=xxx 生成开箱即用链接)</span>
                </label>
                <select
                  className="by-select"
                  value={selectedTokenForExport}
                  onChange={(e) => handleExportTokenChange(e.target.value)}
                  style={{ fontSize: '0.86rem' }}
                >
                  <option value="">-- 不绑定 Token (仅导出基础 /api/{'{apiKey}'} 地址) --</option>
                  {availableTokens.map((t) => (
                    <option key={t.id} value={t.token}>
                      {t.name} (余 {t.remainingQuota}/{t.totalQuota} 次) - {t.token.slice(0, 12)}...
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '4px' }}>
                  选择后，导出的 API 链接将自动附带 <code>?token={'{token}'}</code>，使用者复制即可在脚本或浏览器中免密直接调用。
                </div>
              </div>

              {/* Format Selectors */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`by-btn by-btn-sm ${exportFormat === 'custom' ? 'by-btn-primary' : 'by-btn-secondary'}`}
                  onClick={() => handleExportFormatChange('custom')}
                >
                  账号|密码|API 格式
                </button>
                <button
                  type="button"
                  className={`by-btn by-btn-sm ${exportFormat === 'csv' ? 'by-btn-primary' : 'by-btn-secondary'}`}
                  onClick={() => handleExportFormatChange('csv')}
                >
                  <FileSpreadsheet size={14} /> CSV 电子表格
                </button>
                <button
                  type="button"
                  className={`by-btn by-btn-sm ${exportFormat === 'json' ? 'by-btn-primary' : 'by-btn-secondary'}`}
                  onClick={() => handleExportFormatChange('json')}
                >
                  <FileCode size={14} /> JSON 格式
                </button>
                <button
                  type="button"
                  className={`by-btn by-btn-sm ${exportFormat === 'urls' ? 'by-btn-primary' : 'by-btn-secondary'}`}
                  onClick={() => handleExportFormatChange('urls')}
                >
                  纯 API URL 列表
                </button>
              </div>

              <textarea
                className="by-textarea"
                rows={10}
                readOnly
                value={exporting ? '正在生成导出内容...' : exportedContent}
                style={{ fontSize: '0.82rem' }}
              />
            </div>

            <div className="by-modal-footer">
              <button type="button" className="by-btn by-btn-secondary" onClick={handleDownloadExport} disabled={exporting}>
                <Download size={16} /> 下载文件
              </button>
              <button type="button" className="by-btn by-btn-primary" onClick={handleCopyExportContent} disabled={exporting}>
                {exportCopied ? <Check size={16} /> : <Copy size={16} />}
                {exportCopied ? '复制成功！' : '一键复制全部'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Online Test Drawer / Modal */}
      {testingKey && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '640px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play size={18} color="var(--by-success)" /> API 在线实时拉取测试
              </div>
              <button className="by-btn-icon" onClick={() => setTestingKey(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body">
              <div style={{ marginBottom: '14px', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--by-text-secondary)' }}>测试账号: </span>
                <strong style={{ color: 'var(--by-text-primary)' }}>{testingKey.accountEmail}</strong>
                <span style={{ marginLeft: '12px', color: 'var(--by-text-secondary)' }}>服务商: </span>
                <span style={{ color: 'var(--by-primary)', textTransform: 'capitalize' }}>{testingKey.provider}</span>
              </div>

              {testLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--by-primary)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                  <div>正在连接邮箱拉取最新邮件与验证码...</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', marginTop: '4px' }}>
                    Mail.com 将调度 Chrome RPA 无头浏览器，请稍候约 10-25 秒
                  </div>
                </div>
              ) : testError ? (
                <div style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'var(--by-danger-bg)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: 'var(--by-danger)',
                  fontSize: '0.88rem'
                }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={16} /> 拉取失败
                  </div>
                  <div style={{ marginTop: '4px' }}>{testError}</div>
                </div>
              ) : testResult ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Code Highlight Box */}
                  <div style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: testResult.verificationCode ? 'var(--by-success-bg)' : 'var(--by-warning-bg)',
                    border: `1px solid ${testResult.verificationCode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>提取到的验证码字段:</div>
                      <div style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: testResult.verificationCode ? 'var(--by-success)' : 'var(--by-warning)',
                        fontFamily: 'var(--by-font-mono)'
                      }}>
                        {testResult.verificationCode || '无验证码'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--by-text-secondary)' }}>
                      耗时: {formatDuration(testResult.durationMs)}<br />
                      共拉取: {testResult.messageCount} 封邮件
                    </div>
                  </div>

                  {/* Raw JSON Preview */}
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--by-text-secondary)', marginBottom: '6px' }}>
                      API 接口实际返回 JSON 内容:
                    </div>
                    <pre style={{
                      background: 'var(--by-bg-input)',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      color: 'var(--by-text-primary)',
                      overflowX: 'auto',
                      maxHeight: '220px',
                      border: '1px solid var(--by-border)'
                    }}>
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="by-modal-footer">
              <button
                type="button"
                className="by-btn by-btn-secondary"
                onClick={() => handleStartTestKey(testingKey)}
                disabled={testLoading}
              >
                <RefreshCw size={14} className={testLoading ? 'animate-spin' : ''} /> 再次拉取
              </button>
              <button type="button" className="by-btn by-btn-primary" onClick={() => setTestingKey(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Key Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(keyToDelete)}
        title="删除 API Key"
        message={
          <div>
            确定要删除邮箱账号 <strong style={{ color: 'var(--by-text-code)' }}>{keyToDelete?.accountEmail}</strong> 对应的 API Key 吗？
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--by-danger)' }}>
              删除后关联的外部自动化调用将立即失效。
            </div>
          </div>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleConfirmDeleteKey}
        onClose={() => setKeyToDelete(null)}
      />
    </div>
  );
};
