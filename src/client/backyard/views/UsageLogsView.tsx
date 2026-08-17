import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Clock,
  Mail,
  Zap,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Eye,
  FileText,
  Activity,
  Server,
  X,
  Radio,
  Ban
} from 'lucide-react';
import { backyardApi } from '../api';
import type { UsageLogItem, DiagLogItem } from '../types';

export const UsageLogsView: React.FC = () => {
  const [logs, setLogs] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [sourceMode, setSourceMode] = useState('all');

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<UsageLogItem | null>(null);
  const [detailTraces, setDetailTraces] = useState<DiagLogItem[]>([]);
  const [loadingTraces, setLoadingTraces] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Quick IP Block State
  const [blockIpTarget, setBlockIpTarget] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState('0');
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await backyardApi.getUsageLogs({
        page,
        pageSize,
        search,
        status,
        provider,
        sourceMode
      });
      setLogs(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to load usage logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, status, provider, sourceMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleExportCsv = () => {
    const url = backyardApi.getExportLogsUrl({ search, status, provider, sourceMode });
    window.open(url, '_blank');
  };

  const handleOpenLogDetail = async (item: UsageLogItem) => {
    setSelectedLog(item);
    setLoadingTraces(true);
    setCopiedJson(false);
    try {
      const res = await backyardApi.getDiagnostics({
        page: 1,
        pageSize: 15,
        search: item.emailDomain || item.provider || ''
      });
      setDetailTraces(res.items);
    } catch {
      setDetailTraces([]);
    } finally {
      setLoadingTraces(false);
    }
  };

  const handleCopyAuditJson = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleStartBlockIp = (ip: string) => {
    setBlockIpTarget(ip);
    setBlockReason('批量异常请求 / 大规模占用');
    setBlockDuration('0');
    setBlockError(null);
  };

  const handleConfirmBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockIpTarget) return;
    setBlockLoading(true);
    setBlockError(null);
    try {
      const duration = Number(blockDuration);
      await backyardApi.blockIp({
        ip: blockIpTarget,
        reason: blockReason.trim() || undefined,
        durationHours: duration > 0 ? duration : null
      });
      setBlockIpTarget(null);
      setToastMessage(`已成功限制 IP (${blockIpTarget}) 的访问，前端将展示拦截提示`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setBlockError(err.message || '限制 IP 失败');
    } finally {
      setBlockLoading(false);
    }
  };

  const renderStatusBadge = (item: UsageLogItem) => {
    switch (item.status) {
      case 'success':
        return <span className="by-badge by-badge-success"><CheckCircle2 size={12} /> 成功 ({item.extractedCode || '已提取'})</span>;
      case 'no_code':
        return <span className="by-badge by-badge-warning"><HelpCircle size={12} /> 无验证码</span>;
      case 'timeout':
        return <span className="by-badge by-badge-danger"><Clock size={12} /> 超时</span>;
      case 'captcha':
        return <span className="by-badge by-badge-danger"><AlertCircle size={12} /> 验证码阻拦</span>;
      case 'auth_failed':
        return <span className="by-badge by-badge-danger"><AlertCircle size={12} /> 认证失败</span>;
      case 'cancelled':
        return <span className="by-badge by-badge-neutral">用户取消</span>;
      default:
        return <span className="by-badge by-badge-danger"><AlertCircle size={12} /> 异常</span>;
    }
  };

  const renderSourceBadge = (mode: string) => {
    switch (mode) {
      case 'api_key':
        return <span className="by-badge by-badge-purple">API 自动化</span>;
      case 'batch':
        return <span className="by-badge by-badge-info">批量队列</span>;
      default:
        return <span className="by-badge by-badge-neutral">单账号</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header & Export Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--by-text-primary)', margin: 0 }}>用户使用情况记录</h2>
          <p style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', marginTop: '4px' }}>
            完整审计用户抓取行为，记录 IP、地区、邮箱类型、执行状态与耗时（严格不记录密码）
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="by-btn by-btn-secondary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button className="by-btn by-btn-primary" onClick={handleExportCsv}>
            <Download size={16} /> 导出 CSV 记录
          </button>
        </div>
      </div>

      {toastMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--by-success-bg)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: 'var(--by-success)',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{toastMessage}</span>
          <button className="by-btn-icon" onClick={() => setToastMessage(null)} style={{ padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="by-card" style={{ padding: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <input
              type="text"
              className="by-input"
              placeholder="搜索邮箱、IP、地区、验证码..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
            <Search size={16} color="var(--by-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          </div>

          <div style={{ minWidth: '130px', flex: '0 1 auto' }}>
            <select className="by-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">全部状态</option>
              <option value="success">成功提取</option>
              <option value="no_code">无验证码</option>
              <option value="error">异常/报错</option>
              <option value="timeout">请求超时</option>
              <option value="captcha">验证码拦截</option>
              <option value="auth_failed">认证失败</option>
            </select>
          </div>

          <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
            <select className="by-select" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}>
              <option value="all">全部邮箱服务商</option>
              <option value="mailcom">Mail.com (Web RPA)</option>
              <option value="microsoft">Microsoft Outlook</option>
              <option value="gmx">GMX</option>
              <option value="rambler">Rambler</option>
              <option value="mailru">Mail.ru</option>
              <option value="custom">自定义 IMAP/POP3</option>
            </select>
          </div>

          <div style={{ minWidth: '140px', flex: '0 1 auto' }}>
            <select className="by-select" value={sourceMode} onChange={(e) => { setSourceMode(e.target.value); setPage(1); }}>
              <option value="all">全部调用来源</option>
              <option value="single">网页单账号</option>
              <option value="batch">网页批量</option>
              <option value="api_key">API Key 调度</option>
            </select>
          </div>

          <button type="submit" className="by-btn by-btn-secondary">
            <Filter size={16} /> 筛选
          </button>
        </form>
      </div>

      {/* Usage Table (Responsive Table to Card View) */}
      <div className="by-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="by-table-wrapper mobile-card-view">
          <table className="by-table">
            <thead>
              <tr>
                <th>请求时间</th>
                <th>客户端 IP & 地区</th>
                <th>邮箱账号 (脱敏)</th>
                <th>服务商</th>
                <th>调用模式</th>
                <th>执行状态</th>
                <th>识别验证码</th>
                <th>耗时</th>
                <th>详情与日志</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                    正在载入使用记录...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-muted)' }}>
                    未查询到符合条件的使用记录
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id}>
                    <td data-label="请求时间" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--by-text-secondary)' }}>
                      {new Date(item.createdAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>

                    <td data-label="客户端 IP & 地区">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--by-text-primary)', fontFamily: 'var(--by-font-mono)', fontSize: '0.82rem' }}>
                          {item.clientIp}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Globe size={11} /> {item.region}
                        </span>
                      </div>
                    </td>

                    <td data-label="邮箱账号">
                      <span style={{ fontWeight: 600, color: 'var(--by-text-code)' }}>{item.emailAccount}</span>
                    </td>

                    <td data-label="服务商">
                      <span style={{ textTransform: 'capitalize', color: 'var(--by-text-secondary)', fontSize: '0.82rem' }}>
                        {item.provider === 'mailcom' ? 'Mail.com' : item.provider}
                      </span>
                    </td>

                    <td data-label="调用模式">
                      {renderSourceBadge(item.sourceMode)}
                    </td>

                    <td data-label="执行状态">
                      {renderStatusBadge(item)}
                    </td>

                    <td data-label="验证码">
                      {item.extractedCode ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--by-warning-bg)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                          <span style={{ fontWeight: 700, color: 'var(--by-warning)', fontFamily: 'var(--by-font-mono)', fontSize: '0.9rem' }}>
                            {item.extractedCode}
                          </span>
                          <button
                            onClick={() => handleCopy(item.extractedCode!)}
                            className="by-btn-icon"
                            style={{ padding: '2px', color: copiedCode === item.extractedCode ? 'var(--by-success)' : 'var(--by-warning)' }}
                            title="复制验证码"
                          >
                            {copiedCode === item.extractedCode ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--by-text-muted)', fontSize: '0.8rem' }}>-</span>
                      )}
                    </td>

                    <td data-label="耗时" style={{ color: 'var(--by-text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--by-font-mono)' }}>
                      {item.durationMs}ms
                    </td>

                    <td data-label="详情与日志">
                      <button
                        type="button"
                        className="by-btn by-btn-secondary by-btn-sm"
                        onClick={() => handleOpenLogDetail(item)}
                        title="查看本次执行的详细日志与排查轨迹"
                        style={{ gap: '5px' }}
                      >
                        <FileText size={13} color="var(--by-primary)" />
                        <span>查看日志</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="by-pagination" style={{ padding: '16px 20px 24px 20px', borderTop: '1px solid var(--by-border)' }}>
          <div className="by-pagination-info">
            共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{total}</span> 条记录 • 第 {page} / {totalPages} 页
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

      {/* Execution Log & Audit Detail Modal */}
      {selectedLog && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '720px' }}>
            <div className="by-modal-header">
              <div>
                <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--by-primary)" />
                  <span>执行详细日志与排查详情</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', marginTop: '2px' }}>
                  记录 ID: {selectedLog.id} • {new Date(selectedLog.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
              <button className="by-btn-icon" onClick={() => setSelectedLog(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body">
              {/* Core Parameters Grid */}
              <div className="by-detail-grid">
                <div className="by-detail-cell">
                  <span className="by-detail-label">客户端真实 IP & 归属</span>
                  <span className="by-detail-value" style={{ fontFamily: 'var(--by-font-mono)' }}>
                    {selectedLog.clientIp}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                    {selectedLog.region}
                  </span>
                </div>

                <div className="by-detail-cell">
                  <span className="by-detail-label">邮箱账号 (脱敏保护)</span>
                  <span className="by-detail-value" style={{ color: 'var(--by-text-code)' }}>
                    {selectedLog.emailAccount}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                    域名: {selectedLog.emailDomain || selectedLog.emailAccount.split('@')[1] || '-'}
                  </span>
                </div>

                <div className="by-detail-cell">
                  <span className="by-detail-label">邮箱服务商协议</span>
                  <span className="by-detail-value" style={{ textTransform: 'capitalize' }}>
                    {selectedLog.provider === 'mailcom' ? 'Mail.com (Chrome RPA)' : selectedLog.provider}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                    调用模式: {selectedLog.sourceMode === 'api_key' ? 'API Key 调度' : selectedLog.sourceMode === 'batch' ? '批量队列' : '单账号抓取'}
                  </span>
                </div>

                <div className="by-detail-cell">
                  <span className="by-detail-label">识别验证码 / 耗时</span>
                  <span className="by-detail-value" style={{ color: selectedLog.extractedCode ? 'var(--by-warning)' : 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)' }}>
                    {selectedLog.extractedCode || '无验证码'}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                    耗时: {selectedLog.durationMs}ms • 邮件数: {selectedLog.messageCount}
                  </span>
                </div>
              </div>

              {/* Status Alert Banner */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: selectedLog.status === 'success' ? 'var(--by-success-bg)' : 'var(--by-warning-bg)',
                border: `1px solid ${selectedLog.status === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedLog.status === 'success' ? (
                    <CheckCircle2 size={18} color="var(--by-success)" />
                  ) : (
                    <AlertCircle size={18} color="var(--by-warning)" />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: selectedLog.status === 'success' ? 'var(--by-success)' : 'var(--by-warning)' }}>
                      执行状态: {selectedLog.status.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>
                      说明: {selectedLog.statusDetail || '正常执行完成'}
                    </div>
                  </div>
                </div>
                {renderStatusBadge(selectedLog)}
              </div>

              {/* Step-by-Step Diagnostic Trace Log */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={15} color="var(--by-primary)" />
                    <span>关联 Chrome RPA / IMAP 执行诊断轨迹</span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                    {loadingTraces ? '正在查询诊断日志...' : `共匹配到 ${detailTraces.length} 条轨迹`}
                  </span>
                </div>

                {loadingTraces ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--by-text-secondary)' }}>
                    <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
                    正在载入诊断日志...
                  </div>
                ) : detailTraces.length > 0 ? (
                  <div className="by-trace-timeline">
                    {detailTraces.map((trace) => (
                      <div key={trace.id} className="by-trace-item">
                        <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)', whiteSpace: 'nowrap' }}>
                          {new Date(trace.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                        </span>
                        <span className={`by-badge ${trace.level === 'ERROR' ? 'by-badge-danger' : trace.level === 'WARN' ? 'by-badge-warning' : 'by-badge-info'}`} style={{ fontSize: '0.7rem' }}>
                          {trace.stage}
                        </span>
                        <span style={{ color: trace.level === 'ERROR' ? 'var(--by-danger)' : 'var(--by-text-primary)', flex: 1 }}>
                          {trace.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '14px', background: 'var(--by-bg-input)', border: '1px solid var(--by-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--by-text-muted)', textAlign: 'center' }}>
                    本次执行通过内存快速处理完成，未产生异常中断。
                  </div>
                )}
              </div>

              {/* Raw JSON Audit Payload */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--by-text-secondary)' }}>
                    审计日志 JSON 快照:
                  </span>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    onClick={handleCopyAuditJson}
                    style={{ fontSize: '0.74rem' }}
                  >
                    {copiedJson ? <Check size={12} color="var(--by-success)" /> : <Copy size={12} />}
                    {copiedJson ? '已复制 JSON' : '复制完整 JSON'}
                  </button>
                </div>
                <pre style={{
                  background: 'var(--by-bg-input)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  color: 'var(--by-text-primary)',
                  overflowX: 'auto',
                  maxHeight: '160px',
                  border: '1px solid var(--by-border)',
                  fontFamily: 'var(--by-font-mono)'
                }}>
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>

            <div className="by-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="by-btn by-btn-danger by-btn-sm"
                onClick={() => handleStartBlockIp(selectedLog.clientIp)}
                title="立即限制该 IP 访问"
              >
                <Ban size={13} /> 限制该 IP 访问
              </button>

              <button
                type="button"
                className="by-btn by-btn-secondary"
                onClick={() => setSelectedLog(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Block IP Modal */}
      {blockIpTarget && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '440px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ban size={18} color="var(--by-danger)" /> 限制 IP 访问权限
              </div>
              <button className="by-btn-icon" onClick={() => setBlockIpTarget(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmBlockIp}>
              <div className="by-modal-body">
                <div style={{ marginBottom: '14px', fontSize: '0.86rem', color: 'var(--by-text-secondary)' }}>
                  将限制来自目标 IP 的任何抓取与 API 访问：
                </div>

                <div className="by-input-group">
                  <label className="by-label">目标 IP 地址</label>
                  <input
                    type="text"
                    className="by-input"
                    value={blockIpTarget}
                    readOnly
                    style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 700 }}
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">限制原因</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如: 大批量高频抓取 / 恶意请求"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    required
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">封禁时长</label>
                  <select className="by-select" value={blockDuration} onChange={(e) => setBlockDuration(e.target.value)}>
                    <option value="0">永久限制</option>
                    <option value="1">1 小时</option>
                    <option value="24">24 小时 (1 天)</option>
                    <option value="168">7 天</option>
                    <option value="720">30 天</option>
                  </select>
                </div>

                {blockError && (
                  <div style={{ color: 'var(--by-danger)', fontSize: '0.82rem', marginTop: '6px' }}>
                    {blockError}
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setBlockIpTarget(null)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-danger" disabled={blockLoading}>
                  {blockLoading ? '正在限制...' : '确认封禁'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
