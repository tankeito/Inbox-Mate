import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Globe,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X
} from 'lucide-react';
import { backyardApi } from '../api';
import type { DiagLogItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatFullDateTime, type DatePreset } from '../../../shared/format-utils';
import { DateRangeFilter } from '../components/DateRangeFilter';

export const DiagnosticsView: React.FC = () => {
  const [logs, setLogs] = useState<DiagLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [level, setLevel] = useState('all');
  const [engine, setEngine] = useState('all');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom' | null>(null);

  const [selectedLog, setSelectedLog] = useState<DiagLogItem | null>(null);

  // Confirm Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setOpError(null);
      const res = await backyardApi.getDiagnostics({
        page,
        pageSize,
        level,
        engine,
        search,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setLogs(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      console.error('Failed to load diagnostics:', err);
      setOpError(err.message || '加载诊断日志失败');
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

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, level, engine, startDate, endDate]);

  const handleConfirmClear = async () => {
    setClearLoading(true);
    setOpError(null);
    try {
      await backyardApi.clearDiagnostics();
      setShowClearModal(false);
      setPage(1);
      fetchLogs();
    } catch (err: any) {
      setOpError(err.message || '清空日志失败');
    } finally {
      setClearLoading(false);
    }
  };

  const renderLevelBadge = (lvl: string) => {
    switch (lvl) {
      case 'ERROR':
        return <span className="by-badge by-badge-danger">ERROR</span>;
      case 'WARN':
        return <span className="by-badge by-badge-warning">WARN</span>;
      case 'INFO':
        return <span className="by-badge by-badge-info">INFO</span>;
      default:
        return <span className="by-badge by-badge-neutral">DEBUG</span>;
    }
  };

  const renderEngineIcon = (eng: string) => {
    switch (eng) {
      case 'web_rpa':
        return <span title="Playwright Chrome RPA"><Monitor size={14} color="var(--by-primary)" /></span>;
      case 'imap_pop3':
        return <span title="IMAP / POP3"><Globe size={14} color="var(--by-success)" /></span>;
      case 'api':
        return <span title="Public API Gateway"><Radio size={14} color="var(--by-purple)" /></span>;
      default:
        return <span title="System Engine"><Server size={14} color="var(--by-text-muted)" /></span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <Activity size={22} color="var(--by-primary)" />
            <span>Chrome RPA 与系统诊断跟踪</span>
          </h2>
          <p className="by-view-desc">
            针对 Mail.com 网页端无头浏览器执行步骤、并发压力、代理状态、登录拦截及 IMAP 异常进行全流程日志排查
          </p>
        </div>
        <div className="by-view-actions">
          <button className="by-btn by-btn-secondary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button className="by-btn by-btn-danger" onClick={() => setShowClearModal(true)} disabled={loading || total === 0}>
            <Trash2 size={15} /> 清空诊断日志
          </button>
        </div>
      </div>

      {opError && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--by-danger-bg)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '8px',
          color: 'var(--by-danger)',
          fontSize: '0.86rem'
        }}>
          {opError}
        </div>
      )}

      {/* Filter Bar */}
      <div className="by-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <input
              type="text"
              className="by-input"
              placeholder="搜索阶段、异常消息、邮箱或详情..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
              style={{ paddingLeft: '36px' }}
            />
            <Search size={16} color="var(--by-text-muted)" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          </div>

          <div style={{ minWidth: '130px', flex: '0 1 auto' }}>
            <select className="by-select" value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
              <option value="all">全部级别</option>
              <option value="ERROR">ERROR 错误</option>
              <option value="WARN">WARN 警告</option>
              <option value="INFO">INFO 信息</option>
              <option value="DEBUG">DEBUG 调试</option>
            </select>
          </div>

          <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
            <select className="by-select" value={engine} onChange={(e) => { setEngine(e.target.value); setPage(1); }}>
              <option value="all">全部引擎</option>
              <option value="web_rpa">Chrome Web RPA</option>
              <option value="imap_pop3">IMAP / POP3</option>
              <option value="api">API 网关</option>
              <option value="system">系统底层</option>
            </select>
          </div>

          <button className="by-btn by-btn-secondary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 筛选
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

      {/* Diagnostics Feed List */}
      <div className="by-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--by-text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
            正在载入实时诊断日志...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--by-text-muted)' }}>
            暂无匹配的诊断跟踪日志
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((item) => {
              const isSelected = selectedLog?.id === item.id;
              let parsedDetails: any = null;
              if (item.details) {
                try {
                  parsedDetails = JSON.parse(item.details);
                } catch {
                  parsedDetails = item.details;
                }
              }

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--by-border)',
                    backgroundColor: isSelected ? 'rgba(14, 165, 233, 0.05)' : 'transparent',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)', whiteSpace: 'nowrap' }}>
                        {formatFullDateTime(item.timestamp)}
                      </span>
                      {renderLevelBadge(item.level)}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>
                        {renderEngineIcon(item.engine)}
                        <code style={{ fontSize: '0.78rem' }}>{item.engine}</code>
                      </span>
                      <span className="by-badge by-badge-neutral" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {item.stage}
                      </span>
                      {item.accountEmail && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--by-text-code)', fontWeight: 600 }}>
                          [{item.accountEmail}]
                        </span>
                      )}
                    </div>

                    {item.details && (
                      <button
                        type="button"
                        className="by-btn-icon"
                        style={{ fontSize: '0.75rem', padding: '2px 8px', color: 'var(--by-primary)', borderRadius: '4px' }}
                        onClick={() => setSelectedLog(isSelected ? null : item)}
                      >
                        {isSelected ? '收起详情' : '详细详情'}
                      </button>
                    )}
                  </div>

                  <div style={{
                    marginTop: '6px',
                    fontSize: '0.88rem',
                    color: item.level === 'ERROR' ? 'var(--by-danger)' : 'var(--by-text-primary)',
                    wordBreak: 'break-word',
                    fontFamily: item.level === 'ERROR' ? 'var(--by-font-mono)' : 'inherit'
                  }}>
                    {item.message}
                  </div>

                  {/* Expanded JSON Context */}
                  {isSelected && parsedDetails && (
                    <div style={{ marginTop: '10px', animation: 'fadeIn 0.15s ease' }}>
                      <pre style={{
                        background: 'var(--by-bg-input)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        color: 'var(--by-text-primary)',
                        overflowX: 'auto',
                        border: '1px solid var(--by-border)',
                        maxHeight: '260px',
                        fontFamily: 'var(--by-font-mono)'
                      }}>
                        {typeof parsedDetails === 'object' ? JSON.stringify(parsedDetails, null, 2) : parsedDetails}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        <div className="by-pagination" style={{ padding: '16px 20px 24px 20px', borderTop: '1px solid var(--by-border)' }}>
          <div className="by-pagination-info">
            共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{total}</span> 条日志 • 第 {page} / {totalPages} 页
          </div>

          <div className="by-pagination-controls">
            <select
              className="by-select by-btn-sm"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ width: 'auto', padding: '0 28px 0 10px', height: '32px', lineHeight: '30px' }}
            >
              <option value="20">20条/页</option>
              <option value="30">30条/页</option>
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

      {/* Confirm Clear Modal (Replaces native browser confirm) */}
      <ConfirmModal
        isOpen={showClearModal}
        title="清空所有诊断日志"
        message="确定要清空所有系统与 Chrome RPA 诊断排查日志吗？清空后历史排查轨迹将不可恢复。"
        confirmText="确认清空日志"
        cancelText="取消"
        variant="danger"
        loading={clearLoading}
        onConfirm={handleConfirmClear}
        onClose={() => setShowClearModal(false)}
      />
    </div>
  );
};
