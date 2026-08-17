import React, { useEffect, useState, useMemo } from 'react';
import {
  Globe,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Unlock,
  RefreshCw,
  Search,
  Activity,
  MapPin,
  Clock,
  CheckCircle2,
  Plus,
  X,
  TrendingUp,
  RotateCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { backyardApi } from '../api';
import type {
  IpAnalyticsResponse,
  IpAnalyticsItem,
  CountryStatItem,
  BlockedIpItem
} from '../types';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { WorldHeatmap } from '../components/WorldHeatmap';
import { formatFullDateTime, type DatePreset } from '../../../shared/format-utils';

export const IpAnalyticsView: React.FC = () => {
  const [data, setData] = useState<IpAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ip' | 'country' | 'bans'>('ip');

  // Date Filter State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom' | null>('today');

  // Search & Filter in Tab 1 & Tab 3
  const [ipSearch, setIpSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'banned'>('all');

  // Pagination states
  const [ipPage, setIpPage] = useState(1);
  const [ipPageSize, setIpPageSize] = useState(10);

  const [countryPage, setCountryPage] = useState(1);
  const [countryPageSize, setCountryPageSize] = useState(10);

  const [bansPage, setBansPage] = useState(1);
  const [bansPageSize, setBansPageSize] = useState(10);

  // Banned IPs list in Tab 3
  const [bansList, setBansList] = useState<BlockedIpItem[]>([]);
  const [bansLoading, setBansLoading] = useState(false);

  // Ban Modal State
  const [showBanModal, setShowBanModal] = useState(false);
  const [banTargetIp, setBanTargetIp] = useState('');
  const [banReason, setBanReason] = useState('高频异常请求 / 恶意刷取防护');
  const [banDurationHours, setBanDurationHours] = useState<number>(24);
  const [banLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await backyardApi.getIpAnalytics({
        startDate: startDate || undefined,
        endDate: endDate || undefined
      });
      setData(res);
    } catch (err) {
      console.error('Failed to load IP analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBans = async () => {
    try {
      setBansLoading(true);
      const res = await backyardApi.getBlockedIps({ pageSize: 100 });
      const items: BlockedIpItem[] = Array.isArray(res) ? res : (res?.items || []);
      setBansList(items);
    } catch (err) {
      console.error('Failed to load banned IPs:', err);
      setBansList([]);
    } finally {
      setBansLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [startDate, endDate]);

  useEffect(() => {
    if (activeTab === 'bans') {
      fetchBans();
    }
  }, [activeTab]);

  const handleDateChange = (start: string, end: string, preset?: DatePreset | 'custom' | null) => {
    setStartDate(start);
    setEndDate(end);
    setActivePreset(preset || null);
    setIpPage(1);
    setCountryPage(1);
  };

  const handleOpenBanModal = (ip?: string) => {
    setBanTargetIp(ip || '');
    setBanReason('高频异常请求 / 恶意刷取防护');
    setBanDurationHours(24);
    setBanError(null);
    setShowBanModal(true);
  };

  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banTargetIp.trim()) {
      setBanError('请输入需要封禁的 IP 地址');
      return;
    }
    try {
      setBanLoading(true);
      setBanError(null);
      await backyardApi.blockIp({
        ip: banTargetIp.trim(),
        reason: banReason.trim() || '管理员封禁',
        durationHours: banDurationHours === 0 ? null : banDurationHours
      });
      setShowBanModal(false);
      fetchAnalytics();
      if (activeTab === 'bans') fetchBans();
    } catch (err: any) {
      setBanError(err.message || '封禁 IP 失败');
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnban = async (ip: string) => {
    try {
      await backyardApi.unblockIp(ip);
      fetchAnalytics();
      if (activeTab === 'bans') fetchBans();
    } catch (err: any) {
      alert(err.message || '解封失败');
    }
  };

  // Filtered IP items
  const filteredIpList = useMemo(() => {
    if (!data?.ipList) return [];
    return data.ipList.filter((item) => {
      const matchSearch =
        !ipSearch.trim() ||
        item.ip.toLowerCase().includes(ipSearch.trim().toLowerCase()) ||
        item.countryName.toLowerCase().includes(ipSearch.trim().toLowerCase()) ||
        item.region.toLowerCase().includes(ipSearch.trim().toLowerCase());

      if (!matchSearch) return false;
      if (statusFilter === 'normal') return !item.isBanned;
      if (statusFilter === 'banned') return item.isBanned;
      return true;
    });
  }, [data?.ipList, ipSearch, statusFilter]);

  // Tab 1: IP Access List Pagination
  const totalIps = filteredIpList.length;
  const totalIpPages = Math.ceil(totalIps / ipPageSize) || 1;
  const paginatedIpList = useMemo(() => {
    const start = (ipPage - 1) * ipPageSize;
    return filteredIpList.slice(start, start + ipPageSize);
  }, [filteredIpList, ipPage, ipPageSize]);

  // Tab 2: Country Ranking Pagination
  const totalCountries = data?.countryList?.length || 0;
  const totalCountryPages = Math.ceil(totalCountries / countryPageSize) || 1;
  const paginatedCountryList = useMemo(() => {
    const start = (countryPage - 1) * countryPageSize;
    return (data?.countryList || []).slice(start, start + countryPageSize);
  }, [data?.countryList, countryPage, countryPageSize]);

  // Tab 3: Bans Blacklist Pagination
  const totalBans = bansList.length;
  const totalBanPages = Math.ceil(totalBans / bansPageSize) || 1;
  const paginatedBansList = useMemo(() => {
    const start = (bansPage - 1) * bansPageSize;
    return (bansList || []).slice(start, start + bansPageSize);
  }, [bansList, bansPage, bansPageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Row */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <Globe size={22} color="var(--by-primary)" />
            <span>客户端 IP & 地区访问统计与安全防御中心</span>
          </h2>
          <p className="by-view-desc">
            全域监控客户端请求来源、全球地理热力分布、异常流量溯源与智能 TTL 定时安全封禁拦截
          </p>
        </div>

        <div className="by-view-actions">
          <button
            className="by-btn by-btn-secondary"
            onClick={() => { fetchAnalytics(); if (activeTab === 'bans') fetchBans(); }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button
            className="by-btn by-btn-danger"
            onClick={() => handleOpenBanModal()}
          >
            <ShieldAlert size={15} /> 手动封禁 IP
          </button>
        </div>
      </div>

      {/* 2. Date Range Filter Card */}
      <div className="by-card" style={{ padding: '12px 16px' }}>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          activePreset={activePreset}
          onChange={handleDateChange}
        />
      </div>

      {/* 3. 4 KPI Metric Cards - Strictly 1 Row on PC */}
      <div className="by-stat-grid-4">
        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>总访问请求量</span>
            <Activity size={16} color="var(--by-primary)" />
          </div>
          <div className="by-stat-value">{data?.summary.totalRequests ?? 0}</div>
          <div className="by-stat-sub">周期内累计触发抓取与 API 访问</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>独立客户端 IP 数</span>
            <TrendingUp size={16} color="var(--by-purple)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-purple)' }}>
            {data?.summary.uniqueIps ?? 0}
          </div>
          <div className="by-stat-sub">全球独立访问客户端来源</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>封禁拦截中 IP</span>
            <ShieldAlert size={16} color="var(--by-danger)" />
          </div>
          <div className="by-stat-value" style={{ color: 'var(--by-danger)' }}>
            {data?.summary.activeBansCount ?? 0}
          </div>
          <div className="by-stat-sub">触发 TTL 自动过期或永久封禁</div>
        </div>

        <div className="by-stat-card">
          <div className="by-stat-label">
            <span>最活跃地区 / 国家</span>
            <MapPin size={16} color="var(--by-success)" />
          </div>
          <div className="by-stat-value" style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span>{data?.summary.topCountry?.flag || '🌐'}</span>
            <span title={data?.summary.topCountry?.name || '暂无'}>{data?.summary.topCountry?.name || '暂无'}</span>
          </div>
          <div className="by-stat-sub">
            占比最高来源 ({data?.summary.topCountry?.count ?? 0} 次)
          </div>
        </div>
      </div>

      {/* 4. Main 2-Column Grid: Left Cloudflare TopoJSON World Heatmap / Right Fixed Multitab Data */}
      <div className="by-ip-layout-grid">
        {/* Left Column: Authentic Cloudflare TopoJSON World Heatmap */}
        <WorldHeatmap
          worldMapData={data?.worldMapData}
          totalRequests={data?.summary.totalRequests}
          loading={loading}
        />

        {/* Right Column: Fixed Width Multi-tab Data Panel with Pagination */}
        <div className="by-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%', overflow: 'hidden' }}>
          {/* Tab Navigation */}
          <div className="by-tabs-header">
            <button
              type="button"
              className={`by-tab-btn ${activeTab === 'ip' ? 'active' : ''}`}
              onClick={() => setActiveTab('ip')}
            >
              <Activity size={15} /> IP 访问统计 ({data?.ipList.length ?? 0})
            </button>
            <button
              type="button"
              className={`by-tab-btn ${activeTab === 'country' ? 'active' : ''}`}
              onClick={() => setActiveTab('country')}
            >
              <Globe size={15} /> 地区排行榜 ({data?.countryList.length ?? 0})
            </button>
            <button
              type="button"
              className={`by-tab-btn ${activeTab === 'bans' ? 'active' : ''}`}
              onClick={() => setActiveTab('bans')}
            >
              <ShieldAlert size={15} /> 封禁黑名单 ({data?.summary.activeBansCount ?? bansList.length ?? 0})
            </button>
          </div>

          {/* Tab 1: IP Access List */}
          {activeTab === 'ip' && (
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {/* Search & Filter Toolbar - Fixed height & proper padding */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--by-text-muted)',
                      pointerEvents: 'none'
                    }}
                  />
                  <input
                    type="text"
                    className="by-input"
                    placeholder="搜索 IP 地址或地理位置..."
                    style={{
                      paddingLeft: '30px',
                      paddingRight: ipSearch ? '28px' : '10px',
                      height: '32px',
                      fontSize: '0.82rem'
                    }}
                    value={ipSearch}
                    onChange={(e) => {
                      setIpSearch(e.target.value);
                      setIpPage(1);
                    }}
                  />
                  {ipSearch && (
                    <button
                      type="button"
                      className="by-btn-icon"
                      style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => {
                        setIpSearch('');
                        setIpPage(1);
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <select
                  className="by-select"
                  style={{
                    width: 'auto',
                    minWidth: '100px',
                    height: '32px',
                    fontSize: '0.82rem',
                    padding: '0 24px 0 8px'
                  }}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setIpPage(1);
                  }}
                >
                  <option value="all">全部状态</option>
                  <option value="normal">正常访问</option>
                  <option value="banned">已封禁</option>
                </select>
              </div>

              {/* IP Table - Single Line Formatting */}
              <div className="by-table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table className="by-table by-table-compact">
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>客户端 IP</th>
                      <th style={{ whiteSpace: 'nowrap' }}>地理归属地</th>
                      <th style={{ whiteSpace: 'nowrap' }}>请求次数</th>
                      <th style={{ whiteSpace: 'nowrap' }}>成功率</th>
                      <th style={{ whiteSpace: 'nowrap' }}>最近访问</th>
                      <th style={{ whiteSpace: 'nowrap' }}>安全状态</th>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && !data ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--by-text-muted)' }}>
                          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
                          载入 IP 数据中...
                        </td>
                      </tr>
                    ) : filteredIpList.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--by-text-muted)' }}>
                          暂无匹配的客户端 IP 记录
                        </td>
                      </tr>
                    ) : (
                      paginatedIpList.map((item) => {
                        const cleanRegion = item.region
                          ? item.region.replace(/^本地沙盒 \/ |^本地局域网 \/ |^本地 \/ /g, '')
                          : '';
                        const hasSub = cleanRegion && cleanRegion !== item.countryName;

                        return (
                          <tr key={item.ip}>
                            <td style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 600, color: 'var(--by-text-primary)', whiteSpace: 'nowrap' }}>
                              {item.ip}
                            </td>
                            {/* Single Line Region Rendering */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{item.flag}</span>
                                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--by-text-primary)' }}>
                                  {item.countryName}
                                </span>
                                {hasSub && (
                                  <span style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)' }}>
                                    ({cleanRegion})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--by-primary)', whiteSpace: 'nowrap' }}>
                              {item.requestCount} 次
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span className={`by-badge ${item.successRate >= 90 ? 'by-badge-success' : item.successRate >= 60 ? 'by-badge-warning' : 'by-badge-danger'}`} style={{ fontSize: '0.74rem' }}>
                                {item.successRate}%
                              </span>
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', whiteSpace: 'nowrap' }}>
                              {formatFullDateTime(item.lastSeenAt)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.isBanned ? (
                                <span className="by-badge by-badge-danger" style={{ fontSize: '0.74rem' }}>
                                  <Ban size={11} /> 已封禁
                                </span>
                              ) : (
                                <span className="by-badge by-badge-success" style={{ fontSize: '0.74rem' }}>
                                  <CheckCircle2 size={11} /> 正常
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {item.isBanned ? (
                                <button
                                  type="button"
                                  className="by-btn by-btn-secondary by-btn-sm"
                                  style={{ fontSize: '0.74rem', padding: '3px 8px', color: 'var(--by-success)' }}
                                  onClick={() => handleUnban(item.ip)}
                                >
                                  <Unlock size={12} /> 解封
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="by-btn by-btn-danger by-btn-sm"
                                  style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                                  onClick={() => handleOpenBanModal(item.ip)}
                                >
                                  <Ban size={12} /> 封禁
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tab 1 Pagination Bar */}
              {totalIps > 0 && (
                <div className="by-pagination" style={{ borderTop: '1px solid var(--by-border)', marginTop: 'auto' }}>
                  <div className="by-pagination-info" style={{ fontSize: '0.78rem' }}>
                    共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{totalIps}</span> 条 • 第 {ipPage} / {totalIpPages} 页
                  </div>

                  <div className="by-pagination-controls">
                    <select
                      className="by-pagination-select"
                      value={ipPageSize}
                      onChange={(e) => {
                        setIpPageSize(Number(e.target.value));
                        setIpPage(1);
                      }}
                    >
                      <option value="10">10条/页</option>
                      <option value="20">20条/页</option>
                      <option value="50">50条/页</option>
                    </select>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setIpPage((p) => Math.max(1, p - 1))}
                      disabled={ipPage <= 1 || loading}
                      title={ipPage <= 1 ? '已是第一页' : '上一页'}
                    >
                      <ChevronLeft size={13} /> 上一页
                    </button>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setIpPage((p) => Math.min(totalIpPages, p + 1))}
                      disabled={ipPage >= totalIpPages || loading || totalIpPages <= 1}
                      title={ipPage >= totalIpPages ? '已是最后一页' : '下一页'}
                    >
                      下一页 <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Country Distribution Ranking */}
          {activeTab === 'country' && (
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div className="by-table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table className="by-table by-table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: '45px', whiteSpace: 'nowrap' }}>排名</th>
                      <th style={{ whiteSpace: 'nowrap' }}>国家 / 地区</th>
                      <th style={{ whiteSpace: 'nowrap' }}>请求量</th>
                      <th style={{ whiteSpace: 'nowrap' }}>独立 IP 数</th>
                      <th style={{ whiteSpace: 'nowrap' }}>全域流量占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data?.countryList || data.countryList.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--by-text-muted)' }}>
                          暂无地区分布数据
                        </td>
                      </tr>
                    ) : (
                      paginatedCountryList.map((c, idx) => {
                        const globalIdx = (countryPage - 1) * countryPageSize + idx;
                        return (
                          <tr key={c.countryCode}>
                            <td style={{ fontWeight: 700, color: globalIdx < 3 ? 'var(--by-primary)' : 'var(--by-text-muted)', whiteSpace: 'nowrap' }}>
                              #{globalIdx + 1}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.2rem' }}>{c.flag}</span>
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{c.countryName}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', fontFamily: 'var(--by-font-mono)' }}>{c.countryCode}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--by-primary)', whiteSpace: 'nowrap' }}>
                              {c.requestCount} 次
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {c.uniqueIps} 个
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                                <div style={{ flex: 1, background: 'var(--by-bg-input)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${c.percentage}%`,
                                      background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                                      height: '100%',
                                      borderRadius: '4px'
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, width: '42px', textAlign: 'right' }}>
                                  {c.percentage}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tab 2 Pagination Bar */}
              {totalCountries > 0 && (
                <div className="by-pagination" style={{ borderTop: '1px solid var(--by-border)', marginTop: 'auto' }}>
                  <div className="by-pagination-info" style={{ fontSize: '0.78rem' }}>
                    共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{totalCountries}</span> 个地区 • 第 {countryPage} / {totalCountryPages} 页
                  </div>

                  <div className="by-pagination-controls">
                    <select
                      className="by-pagination-select"
                      value={countryPageSize}
                      onChange={(e) => {
                        setCountryPageSize(Number(e.target.value));
                        setCountryPage(1);
                      }}
                    >
                      <option value="10">10条/页</option>
                      <option value="20">20条/页</option>
                    </select>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setCountryPage((p) => Math.max(1, p - 1))}
                      disabled={countryPage <= 1 || loading}
                      title={countryPage <= 1 ? '已是第一页' : '上一页'}
                    >
                      <ChevronLeft size={13} /> 上一页
                    </button>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setCountryPage((p) => Math.min(totalCountryPages, p + 1))}
                      disabled={countryPage >= totalCountryPages || loading || totalCountryPages <= 1}
                      title={countryPage >= totalCountryPages ? '已是最后一页' : '下一页'}
                    >
                      下一页 <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Ban Blacklist & Security Policies */}
          {activeTab === 'bans' && (
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--by-text-secondary)' }}>
                  当前共有 <strong>{(bansList || []).length}</strong> 条生效中的 IP 封禁拦截策略
                </span>
                <button
                  type="button"
                  className="by-btn by-btn-danger by-btn-sm"
                  onClick={() => handleOpenBanModal()}
                >
                  <Plus size={13} /> 添加封禁 IP
                </button>
              </div>

              <div className="by-table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table className="by-table by-table-compact">
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>受限 IP</th>
                      <th style={{ whiteSpace: 'nowrap' }}>封禁原因</th>
                      <th style={{ whiteSpace: 'nowrap' }}>封禁时间</th>
                      <th style={{ whiteSpace: 'nowrap' }}>自动解封时间 (TTL)</th>
                      <th style={{ whiteSpace: 'nowrap' }}>操作人</th>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bansLoading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--by-text-muted)' }}>
                          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
                          载入黑名单中...
                        </td>
                      </tr>
                    ) : (bansList || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--by-text-muted)' }}>
                          暂无生效中的 IP 封禁记录，系统安全运行中
                        </td>
                      </tr>
                    ) : (
                      paginatedBansList.map((b) => (
                        <tr key={b.id}>
                          <td style={{ fontFamily: 'var(--by-font-mono)', fontWeight: 600, color: 'var(--by-danger)', whiteSpace: 'nowrap' }}>
                            {b.ip}
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)' }}>
                            {b.reason}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', whiteSpace: 'nowrap' }}>
                            {formatFullDateTime(b.createdAt)}
                          </td>
                          <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                            {b.expiresAt ? (
                              <span style={{ color: 'var(--by-warning)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={12} /> {formatFullDateTime(b.expiresAt)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--by-danger)', fontWeight: 600 }}>永久封禁</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)', whiteSpace: 'nowrap' }}>
                            {b.blockedBy}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="by-btn by-btn-secondary by-btn-sm"
                              style={{ fontSize: '0.74rem', padding: '3px 8px', color: 'var(--by-success)' }}
                              onClick={() => handleUnban(b.ip)}
                            >
                              <Unlock size={12} /> 立即解封
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tab 3 Pagination Bar */}
              {totalBans > 0 && (
                <div className="by-pagination" style={{ borderTop: '1px solid var(--by-border)', marginTop: 'auto' }}>
                  <div className="by-pagination-info" style={{ fontSize: '0.78rem' }}>
                    共 <span style={{ fontWeight: 700, color: 'var(--by-text-primary)' }}>{totalBans}</span> 条封禁 • 第 {bansPage} / {totalBanPages} 页
                  </div>

                  <div className="by-pagination-controls">
                    <select
                      className="by-pagination-select"
                      value={bansPageSize}
                      onChange={(e) => {
                        setBansPageSize(Number(e.target.value));
                        setBansPage(1);
                      }}
                    >
                      <option value="10">10条/页</option>
                      <option value="20">20条/页</option>
                    </select>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setBansPage((p) => Math.max(1, p - 1))}
                      disabled={bansPage <= 1 || bansLoading}
                      title={bansPage <= 1 ? '已是第一页' : '上一页'}
                    >
                      <ChevronLeft size={13} /> 上一页
                    </button>

                    <button
                      type="button"
                      className="by-pagination-btn"
                      onClick={() => setBansPage((p) => Math.min(totalBanPages, p + 1))}
                      disabled={bansPage >= totalBanPages || bansLoading || totalBanPages <= 1}
                      title={bansPage >= totalBanPages ? '已是最后一页' : '下一页'}
                    >
                      下一页 <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Ban IP Modal */}
      {showBanModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '480px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--by-danger)' }}>
                <ShieldAlert size={18} /> 封禁客户端 IP 地址
              </div>
              <button className="by-btn-icon" onClick={() => setShowBanModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBanSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {banError && (
                  <div style={{ padding: '8px 12px', background: 'var(--by-danger-bg)', color: 'var(--by-danger)', borderRadius: '6px', fontSize: '0.82rem' }}>
                    {banError}
                  </div>
                )}

                <div>
                  <label className="by-form-label">目标客户端 IP 地址 *</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="例如: 203.0.113.195 或 198.51.100.42"
                    value={banTargetIp}
                    onChange={(e) => setBanTargetIp(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="by-form-label">封禁时长 (智能 TTL 自动到期解封)</label>
                  <select
                    className="by-select"
                    value={banDurationHours}
                    onChange={(e) => setBanDurationHours(Number(e.target.value))}
                  >
                    <option value={1}>1 小时后自动解封 (临时警告)</option>
                    <option value={6}>6 小时后自动解封</option>
                    <option value={12}>12 小时后自动解封</option>
                    <option value={24}>24 小时后自动解封 (推荐)</option>
                    <option value={72}>3 天 (72 小时) 后自动解封</option>
                    <option value={168}>7 天后自动解封</option>
                    <option value={720}>30 天后自动解封</option>
                    <option value={0}>永久封禁 (直至管理员手动解封)</option>
                  </select>
                </div>

                <div>
                  <label className="by-form-label">封禁原因 / 备注说明</label>
                  <textarea
                    className="by-input"
                    rows={2}
                    placeholder="请输入安全封禁原因，例如：异常大批量自动化脚本探测"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowBanModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-danger" disabled={banLoading}>
                  {banLoading ? '提交中...' : '确认执行封禁'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
