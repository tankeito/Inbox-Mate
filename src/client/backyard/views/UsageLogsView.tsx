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
  Ban,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  Maximize2,
  Sparkles,
  Layers,
  Cpu,
  Image as ImageIcon
} from 'lucide-react';
import { backyardApi } from '../api';
import type { UsageLogItem, DiagLogItem } from '../types';
import { formatDuration, formatFullDateTime, type DatePreset } from '../../../shared/format-utils';
import { DateRangeFilter } from '../components/DateRangeFilter';

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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom' | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<UsageLogItem | null>(null);
  const [detailTraces, setDetailTraces] = useState<DiagLogItem[]>([]);
  const [loadingTraces, setLoadingTraces] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Quick IP Block State
  const [blockIpTarget, setBlockIpTarget] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState('24');
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
        sourceMode,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setLogs(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Failed to fetch usage logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, status, provider, sourceMode, startDate, endDate]);

  const handleDatePresetChange = (preset: DatePreset | 'custom' | null, range?: { startDate: string; endDate: string }) => {
    setActivePreset(preset);
    if (range) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    } else {
      setStartDate('');
      setEndDate('');
    }
    setPage(1);
  };

  const handleDateChange = (start: string, end: string, preset?: DatePreset | 'custom' | null) => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset || null);
    setPage(1);
  };

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
    const url = backyardApi.getExportLogsUrl({ search, status, provider, sourceMode, startDate, endDate });
    window.open(url, '_blank');
  };

  const handleOpenLogDetail = async (item: UsageLogItem) => {
    setSelectedLog(item);
    setLoadingTraces(true);
    setCopiedJson(false);
    setExpandedTraceId(null);
    setPreviewScreenshot(null);
    setCopiedReport(false);
    try {
      // 1. Precise match by traceId (item.id)
      let res = await backyardApi.getDiagnostics({
        page: 1,
        pageSize: 50,
        traceId: item.id
      });
      // 2. If no traces found under traceId (legacy record), fallback to domain/provider
      if (res.items.length === 0) {
        res = await backyardApi.getDiagnostics({
          page: 1,
          pageSize: 20,
          search: item.emailDomain || item.provider || ''
        });
      }
      // Sort traces in chronological sequence (ascending) for natural timeline reading
      const sorted = [...res.items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setDetailTraces(sorted);
    } catch {
      setDetailTraces([]);
    } finally {
      setLoadingTraces(false);
    }
  };

  // Extract latest forensics snapshot if available in trace details
  const latestSnapshot = React.useMemo(() => {
    for (let i = detailTraces.length - 1; i >= 0; i--) {
      const trace = detailTraces[i];
      if (trace.details) {
        try {
          const parsed = typeof trace.details === 'string' ? JSON.parse(trace.details) : trace.details;
          if (parsed && (parsed.screenshotBase64 || parsed.finalUrl || parsed.pageCategory)) {
            return parsed;
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  }, [detailTraces]);

  const getSmartDiagnosis = (item: UsageLogItem, snapshot: any) => {
    if (item.status === 'success') {
      return {
        tone: 'success',
        title: '邮件拉取成功 (SUCCESS)',
        summary: `邮箱邮件已顺利提取，耗时 ${formatDuration(item.durationMs)}，提取到验证码: ${item.extractedCode || '无'}。`,
        suggestion: '系统运行良好，无需额外排查。'
      };
    }
    if (item.status === 'no_code') {
      return {
        tone: 'warning',
        title: '邮件已获取但未检测到验证码 (NO_CODE)',
        summary: `收件箱已成功访问（共获取 ${item.messageCount} 封邮件），但近期邮件中未匹配到验证码。`,
        suggestion: '请确认目标业务平台是否已成功向该邮箱下发了验证码邮件。'
      };
    }
    if (snapshot?.pageCategory === 'consent_interstitial') {
      return {
        tone: 'warning',
        title: '停留在 Mail.com 隐私协议授权页 (Consent Interstitial)',
        summary: `无头浏览器登录后被重定向至隐私协议同意页 (${snapshot.finalUrl || 'consent.mail.com'})。`,
        suggestion: '系统自愈引擎已尝试自动跳过；若多次超时，建议在 Clash 节点中切换为更纯净的海外家宽/机房节点。'
      };
    }
    if (snapshot?.pageCategory === 'promo_interstitial') {
      return {
        tone: 'warning',
        title: '停留在 Mail.com 广告/优惠中转页 (Promo Interstitial)',
        summary: `登录后被重定向至中转欢迎页 (${snapshot.finalUrl || 'navigator.mail.com/welcome'})。`,
        suggestion: '系统已尝试自动点击【Continue to Mailbox】跳过；若持续发生，可在设置中调大超时预算。'
      };
    }
    if (snapshot?.pageCategory === 'security_challenge') {
      return {
        tone: 'danger',
        title: '触发 Mail.com 安全二次验证挑战 (Security Challenge / 2FA)',
        summary: 'Mail.com 识别到新设备或异常 IP 登录，弹出手机验证或安全问题挑战。',
        suggestion: '该账号需在浏览器中人工登录一次并绑定恢复邮箱/手机，或配置固定静态住宅代理登录。'
      };
    }
    if (snapshot?.pageCategory === 'cloudflare_captcha' || item.status === 'captcha') {
      return {
        tone: 'danger',
        title: '触发 Cloudflare / 验证码人机拦截 (CAPTCHA Triggered)',
        summary: '当前出口 IP 请求频率过高或已被 Mail.com 风控策略标记阻拦。',
        suggestion: '请在代理客户端中切换节点，避免单一 IP 短时间内高并发请求 Mail.com。'
      };
    }
    if (item.status === 'auth_failed') {
      return {
        tone: 'danger',
        title: '账号或密码认证失败 (AUTH_FAILED)',
        summary: 'Mail.com 提示登录凭据错误或账号已被锁定。',
        suggestion: '请检查输入的邮箱密码是否正确，或检查账号是否在官网已被临时冻结。'
      };
    }
    if (item.status === 'timeout') {
      return {
        tone: 'warning',
        title: '收件箱加载超时 (TIMEOUT)',
        summary: `在 30 秒内未成功加载收件箱数据 (总耗时: ${formatDuration(item.durationMs)})。终点页面: ${snapshot?.finalUrl || '未知'}。`,
        suggestion: '请检查代理连通性或当前并发数；若频繁超时，可点击下方【现场视觉快照】进一步定位停滞画面。'
      };
    }
    return {
      tone: 'danger',
      title: '执行异常 (ERROR)',
      summary: item.statusDetail || '抓取过程中遇到未知异常。',
      suggestion: '可展开下方单步轨迹查看具体报错堆栈或网络请求状态。'
    };
  };

  const handleCopyDiagnosticReport = () => {
    if (!selectedLog) return;
    const diag = getSmartDiagnosis(selectedLog, latestSnapshot);
    const lines = [
      `# Inbox-Mate 执行排查报告`,
      `- 记录 ID: ${selectedLog.id}`,
      `- 执行时间: ${formatFullDateTime(selectedLog.createdAt)}`,
      `- 客户端 IP: ${selectedLog.clientIp} (${selectedLog.region})`,
      `- 邮箱账号: ${selectedLog.emailAccount}`,
      `- 服务商/模式: ${selectedLog.provider} (${selectedLog.sourceMode})`,
      `- 状态: ${selectedLog.status.toUpperCase()} (${selectedLog.statusDetail || '无'})`,
      `- 耗时: ${formatDuration(selectedLog.durationMs)}`,
      ``,
      `## 智能诊断结论`,
      `- 诊断: ${diag.title}`,
      `- 说明: ${diag.summary}`,
      `- 建议: ${diag.suggestion}`,
      latestSnapshot?.finalUrl ? `- 现场终点 URL: ${latestSnapshot.finalUrl}` : '',
      latestSnapshot?.pageTitle ? `- 页面标题: ${latestSnapshot.pageTitle}` : '',
      latestSnapshot?.detectedPrompt ? `- 现场提示文本: ${latestSnapshot.detectedPrompt}` : '',
      ``,
      `## 执行生命周期轨迹 (${detailTraces.length} 步)`,
      ...detailTraces.map((t, idx) => `  ${idx + 1}. [${new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}] [${t.level}] [${t.stage}] ${t.message}`)
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Export Action */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <FileText size={22} color="var(--by-primary)" />
            <span>用户使用情况记录</span>
          </h2>
          <p className="by-view-desc">
            完整审计用户抓取行为，记录 IP、地区、邮箱类型、执行状态与耗时（严格不记录密码）
          </p>
        </div>
        <div className="by-view-actions">
          <button className="by-btn by-btn-secondary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button className="by-btn by-btn-primary" onClick={handleExportCsv}>
            <Download size={15} /> 导出 CSV 记录
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
      <div className="by-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

        {/* Date Range Bar with Presets */}
        <div style={{ borderTop: '1px solid var(--by-border)', paddingTop: '10px' }}>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            activePreset={activePreset}
            onChange={handleDateChange}
          />
        </div>
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
                      {formatFullDateTime(item.createdAt)}
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
                      {formatDuration(item.durationMs)}
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
      {selectedLog && (() => {
        const diag = getSmartDiagnosis(selectedLog, latestSnapshot);
        return (
          <div className="by-modal-overlay">
            <div className="by-modal" style={{ maxWidth: '980px', width: '94vw' }}>
              <div className="by-modal-header">
                <div>
                  <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={18} color="var(--by-primary)" />
                    <span>执行详细日志与排查详情</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>记录 ID: <code style={{ fontFamily: 'var(--by-font-mono)', color: 'var(--by-text-secondary)' }}>{selectedLog.id}</code></span>
                    <span>•</span>
                    <span>{formatFullDateTime(selectedLog.createdAt)}</span>
                  </div>
                </div>
                <button className="by-btn-icon" onClick={() => setSelectedLog(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="by-modal-body">
                {/* Core Parameters Grid - 4 Columns */}
                <div className="by-detail-grid">
                  <div className="by-detail-cell" title={`${selectedLog.clientIp} (${selectedLog.region})`}>
                    <span className="by-detail-label">客户端真实 IP & 归属</span>
                    <span
                      className="by-detail-value"
                      style={{
                        fontFamily: 'var(--by-font-mono)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={selectedLog.clientIp}
                    >
                      {selectedLog.clientIp}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--by-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={selectedLog.region}
                    >
                      {selectedLog.region}
                    </span>
                  </div>

                  <div className="by-detail-cell" title={selectedLog.emailAccount}>
                    <span className="by-detail-label">邮箱账号 (脱敏保护)</span>
                    <span
                      className="by-detail-value"
                      style={{
                        color: 'var(--by-text-code)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={selectedLog.emailAccount}
                    >
                      {selectedLog.emailAccount}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--by-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      域名: {selectedLog.emailDomain || selectedLog.emailAccount.split('@')[1] || '-'}
                    </span>
                  </div>

                  <div className="by-detail-cell" title={selectedLog.provider === 'mailcom' ? 'Mail.com 集团 (Chrome RPA 引擎)' : selectedLog.provider}>
                    <span className="by-detail-label">服务商协议 & 引擎</span>
                    <span
                      className="by-detail-value"
                      style={{
                        textTransform: 'capitalize',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {selectedLog.provider === 'mailcom' ? 'Mail.com (Chrome RPA)' : selectedLog.provider}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--by-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      调用模式: {selectedLog.sourceMode === 'api_key' ? 'API Key 调度' : selectedLog.sourceMode === 'batch' ? '批量队列' : '单账号抓取'}
                    </span>
                  </div>

                  <div className="by-detail-cell">
                    <span className="by-detail-label">识别验证码 / 耗时</span>
                    <span
                      className="by-detail-value"
                      style={{
                        color: selectedLog.extractedCode ? 'var(--by-warning)' : 'var(--by-text-muted)',
                        fontFamily: 'var(--by-font-mono)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {selectedLog.extractedCode || '无验证码'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--by-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      耗时: {formatDuration(selectedLog.durationMs)} • 邮件数: {selectedLog.messageCount}
                    </span>
                  </div>
                </div>

                {/* Smart Diagnostic Analysis & AI Root Cause Banner */}
                <div className={`by-smart-diag-banner ${diag.tone}`}>
                  {diag.tone === 'success' ? (
                    <CheckCircle2 size={20} color="var(--by-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : diag.tone === 'warning' ? (
                    <AlertCircle size={20} color="var(--by-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <ShieldAlert size={20} color="var(--by-danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: diag.tone === 'success' ? 'var(--by-success)' : diag.tone === 'warning' ? 'var(--by-warning)' : 'var(--by-danger)' }}>
                        {diag.title}
                      </div>
                      {renderStatusBadge(selectedLog)}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--by-text-primary)', marginBottom: '4px', lineHeight: 1.5 }}>
                      {diag.summary}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={13} color="var(--by-primary)" />
                      <span><strong>建议操作：</strong>{diag.suggestion}</span>
                    </div>
                  </div>
                </div>

                {/* Live Forensics Visual & DOM Snapshot Panel (When Available) */}
                {latestSnapshot && (
                  <div className="by-forensics-panel">
                    {latestSnapshot.screenshotBase64 && (
                      <div
                        className="by-snapshot-thumb"
                        onClick={() => setPreviewScreenshot(latestSnapshot.screenshotBase64)}
                        title="点击查看现场高分辨率截图"
                      >
                        <img src={latestSnapshot.screenshotBase64} alt="现场快照截图" />
                        <div className="by-snapshot-overlay-badge">
                          <Maximize2 size={10} style={{ display: 'inline', marginRight: '3px' }} />
                          现场快照
                        </div>
                      </div>
                    )}

                    <div className="by-forensics-info">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ImageIcon size={15} color="var(--by-info)" />
                          <span>异常现场环境快照取证 (Forensics Snapshot)</span>
                        </div>
                        {latestSnapshot.pageCategory && (
                          <span className="by-badge by-badge-purple" style={{ fontSize: '0.7rem' }}>
                            分类: {latestSnapshot.pageCategory}
                          </span>
                        )}
                      </div>

                      {latestSnapshot.finalUrl && latestSnapshot.finalUrl !== 'N/A' && (
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--by-text-muted)', minWidth: '60px' }}>终点 URL:</span>
                          <span
                            style={{
                              fontFamily: 'var(--by-font-mono)',
                              color: 'var(--by-info)',
                              wordBreak: 'break-all',
                              fontSize: '0.75rem'
                            }}
                          >
                            {latestSnapshot.finalUrl}
                          </span>
                        </div>
                      )}

                      {latestSnapshot.pageTitle && (
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--by-text-muted)', minWidth: '60px' }}>页面标题:</span>
                          <span style={{ color: 'var(--by-text-primary)' }}>{latestSnapshot.pageTitle}</span>
                        </div>
                      )}

                      {latestSnapshot.detectedPrompt && (
                        <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <span style={{ color: 'var(--by-text-muted)', minWidth: '60px' }}>现场提示:</span>
                          <span style={{ color: 'var(--by-warning)', background: 'var(--by-bg-input)', padding: '2px 6px', borderRadius: '4px' }}>
                            {latestSnapshot.detectedPrompt}
                          </span>
                        </div>
                      )}

                      <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', display: 'flex', gap: '12px', marginTop: '2px' }}>
                        <span>Iframe 框架数: {latestSnapshot.framesCount ?? 1}</span>
                        {latestSnapshot.proxy && <span>代理出口: {latestSnapshot.proxy}</span>}
                        {latestSnapshot.concurrentTasks !== undefined && <span>并发任务: {latestSnapshot.concurrentTasks}</span>}
                      </div>
                    </div>
                  </div>
                )}

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
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--by-text-secondary)' }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
                      正在载入该请求的诊断日志...
                    </div>
                  ) : detailTraces.length > 0 ? (
                    <div className="by-trace-timeline">
                      {detailTraces.map((trace) => {
                        const isExpanded = expandedTraceId === trace.id;
                        let parsedMeta: any = null;
                        if (trace.details) {
                          try {
                            parsedMeta = typeof trace.details === 'string' ? JSON.parse(trace.details) : trace.details;
                          } catch {
                            parsedMeta = { raw: trace.details };
                          }
                        }

                        return (
                          <div key={trace.id} className="by-trace-card">
                            <div
                              className="by-trace-card-header"
                              onClick={() => setExpandedTraceId(isExpanded ? null : trace.id)}
                            >
                              {trace.level === 'ERROR' ? (
                                <AlertCircle size={15} color="var(--by-danger)" style={{ flexShrink: 0 }} />
                              ) : trace.level === 'WARN' ? (
                                <AlertCircle size={15} color="var(--by-warning)" style={{ flexShrink: 0 }} />
                              ) : (
                                <CheckCircle2 size={15} color="var(--by-success)" style={{ flexShrink: 0 }} />
                              )}

                              <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)', whiteSpace: 'nowrap' }}>
                                {new Date(trace.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                              </span>

                              <span className={`by-badge ${trace.level === 'ERROR' ? 'by-badge-danger' : trace.level === 'WARN' ? 'by-badge-warning' : 'by-badge-info'}`} style={{ fontSize: '0.7rem' }}>
                                {trace.stage}
                              </span>

                              <span style={{ color: trace.level === 'ERROR' ? 'var(--by-danger)' : 'var(--by-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {trace.message}
                              </span>

                              {parsedMeta && (
                                <button
                                  type="button"
                                  className="by-btn-icon"
                                  style={{ padding: '2px', color: 'var(--by-text-muted)' }}
                                  title={isExpanded ? '收起详情' : '展开参数详情'}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              )}
                            </div>

                            {/* Expandable Step Metadata Drawer */}
                            {isExpanded && parsedMeta && (
                              <div className="by-trace-meta-drawer">
                                {Object.entries(parsedMeta).map(([k, v]) => {
                                  if (k === 'screenshotBase64') return null; // Don't dump huge base64 in text view
                                  return (
                                    <div key={k} className="by-meta-row">
                                      <span className="by-meta-key">{k}:</span>
                                      <span className="by-meta-val">
                                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '16px', background: 'var(--by-bg-input)', border: '1px solid var(--by-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--by-text-muted)', textAlign: 'center' }}>
                      本次执行未产生异常轨迹或已完成自动化回收。
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
                    maxHeight: '140px',
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

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    onClick={handleCopyDiagnosticReport}
                    title="复制格式化排查诊断报告"
                  >
                    {copiedReport ? <Check size={13} color="var(--by-success)" /> : <Copy size={13} />}
                    {copiedReport ? '已复制排查报告' : '导出排查报告'}
                  </button>

                  <button
                    type="button"
                    className="by-btn by-btn-secondary by-btn-sm"
                    onClick={() => setSelectedLog(null)}
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Screenshot Lightbox Preview Modal */}
      {previewScreenshot && (
        <div className="by-modal-overlay" onClick={() => setPreviewScreenshot(null)} style={{ zIndex: 60 }}>
          <div
            className="by-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '1100px', width: '95vw', maxHeight: '92vh', background: '#0b0f19' }}
          >
            <div className="by-modal-header" style={{ borderBottomColor: 'rgba(255,255,255,0.1)' }}>
              <div className="by-modal-title" style={{ color: '#fff', fontSize: '0.95rem' }}>
                现场异常高分辨率快照
              </div>
              <button className="by-btn-icon" onClick={() => setPreviewScreenshot(null)} style={{ color: '#fff' }}>
                <X size={18} />
              </button>
            </div>
            <div className="by-modal-body" style={{ padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                src={previewScreenshot}
                alt="现场高分辨率截图"
                style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
              />
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
