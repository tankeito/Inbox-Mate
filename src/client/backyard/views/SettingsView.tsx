import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Server,
  RefreshCw,
  X,
  Ban,
  Plus,
  Trash2,
  Globe,
  Clock,
  Zap,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
  Sliders,
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import { backyardApi } from '../api';
import type {
  AdminUser,
  BlockedIpItem,
  SystemSettingsPayload,
  SystemConcurrencySettings
} from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface SettingsViewProps {
  user: AdminUser;
  onUserUpdated: (user: AdminUser) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUserUpdated }) => {
  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState<'concurrency' | 'security' | 'ip_bans'>('concurrency');

  // ================= Concurrency & Hardware Tuning State =================
  const [systemPayload, setSystemPayload] = useState<SystemSettingsPayload | null>(null);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [autoTuneApplied, setAutoTuneApplied] = useState(false);

  // Form State for Concurrency
  const [rpaMax, setRpaMax] = useState<number>(3);
  const [providerMax, setProviderMax] = useState<number>(10);
  const [globalMax, setGlobalMax] = useState<number>(50);
  const [timeoutAccountSec, setTimeoutAccountSec] = useState<number>(30);
  const [timeoutRpaSec, setTimeoutRpaSec] = useState<number>(90);
  const [timeoutJobSec, setTimeoutJobSec] = useState<number>(300);
  const [apiCooldownMs, setApiCooldownMs] = useState<number>(1500);

  // Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // ================= 2FA Modal State =================
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFaSetupData, setTwoFaSetupData] = useState<{ secret: string; uri: string; qrSvg: string } | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Disable 2FA Modal State
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  // Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  // General Notification Banner
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // IP Block Management State
  const [blockedIps, setBlockedIps] = useState<BlockedIpItem[]>([]);
  const [loadingIps, setLoadingIps] = useState(false);
  const [showAddIpModal, setShowAddIpModal] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newIpReason, setNewIpReason] = useState('');
  const [newIpDuration, setNewIpDuration] = useState('0');
  const [addIpLoading, setAddIpLoading] = useState(false);
  const [addIpError, setAddIpError] = useState<string | null>(null);

  // Unblock Confirm Modal State
  const [ipToUnblock, setIpToUnblock] = useState<BlockedIpItem | null>(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  // ================= Loaders =================
  const fetchSystemSettings = async () => {
    try {
      setLoadingSystem(true);
      const res = await backyardApi.getSystemSettings();
      setSystemPayload(res);
      if (res.currentSettings) {
        setRpaMax(res.currentSettings.concurrencyRpaMax);
        setProviderMax(res.currentSettings.concurrencyProviderMax);
        setGlobalMax(res.currentSettings.concurrencyGlobalMax);
        setTimeoutAccountSec(res.currentSettings.timeoutAccountSec);
        setTimeoutRpaSec(res.currentSettings.timeoutRpaSec);
        setTimeoutJobSec(res.currentSettings.timeoutJobSec);
        setApiCooldownMs(res.currentSettings.apiCooldownMs);
      }
    } catch (err: any) {
      console.error('Failed to load system settings:', err);
    } finally {
      setLoadingSystem(false);
    }
  };

  const fetchBlockedIps = async () => {
    try {
      setLoadingIps(true);
      const res = await backyardApi.getBlockedIps();
      setBlockedIps(res.items);
    } catch (err) {
      console.error('Failed to load blocked IPs:', err);
    } finally {
      setLoadingIps(false);
    }
  };

  useEffect(() => {
    fetchSystemSettings();
    fetchBlockedIps();
  }, []);

  // ================= Actions: Concurrency & Tuning =================
  const handleApplySmartRecommendations = () => {
    if (!systemPayload?.recommendations) return;
    const { rpaConcurrency, globalConcurrency, providerConcurrency } = systemPayload.recommendations;
    setRpaMax(rpaConcurrency);
    setGlobalMax(globalConcurrency);
    setProviderMax(providerConcurrency);
    setAutoTuneApplied(true);
    setTimeout(() => setAutoTuneApplied(false), 3000);
    setStatusMessage({
      type: 'success',
      text: `已一键填入服务器最佳算力推荐配置 (RPA: ${rpaConcurrency}, 全局: ${globalConcurrency}, 单服务商: ${providerConcurrency})，点击【保存】即可立即生效！`
    });
  };

  const handleSaveSystemSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSystem(true);
    try {
      const res = await backyardApi.updateSystemSettings({
        concurrencyRpaMax: rpaMax,
        concurrencyProviderMax: providerMax,
        concurrencyGlobalMax: globalMax,
        timeoutAccountSec,
        timeoutRpaSec,
        timeoutJobSec,
        apiCooldownMs
      });
      setSystemPayload(res.payload);
      setStatusMessage({
        type: 'success',
        text: '系统并发与调度配置已成功保存并在调度内核立即热生效（无需重启服务）！'
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '保存系统配置失败' });
    } finally {
      setSavingSystem(false);
    }
  };

  const handleConfirmResetSettings = async () => {
    setResetLoading(true);
    try {
      const res = await backyardApi.resetSystemSettings();
      setSystemPayload(res.payload);
      if (res.settings) {
        setRpaMax(res.settings.concurrencyRpaMax);
        setProviderMax(res.settings.concurrencyProviderMax);
        setGlobalMax(res.settings.concurrencyGlobalMax);
        setTimeoutAccountSec(res.settings.timeoutAccountSec);
        setTimeoutRpaSec(res.settings.timeoutRpaSec);
        setTimeoutJobSec(res.settings.timeoutJobSec);
        setApiCooldownMs(res.settings.apiCooldownMs);
      }
      setShowResetModal(false);
      setStatusMessage({ type: 'success', text: '已恢复系统默认并发与调度配置！' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '重置系统配置失败' });
    } finally {
      setResetLoading(false);
    }
  };

  // ================= Actions: 2FA & Password =================
  const handleStartSetup2FA = async () => {
    setTwoFaLoading(true);
    setTwoFaError(null);
    try {
      const data = await backyardApi.setup2FA();
      setTwoFaSetupData(data);
      setShow2FAModal(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '初始化 2FA 失败' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleConfirmEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enableCode || enableCode.length !== 6) {
      setTwoFaError('请输入 6 位动态验证码');
      return;
    }

    setTwoFaLoading(true);
    setTwoFaError(null);

    try {
      await backyardApi.enable2FA(enableCode.trim());
      setShow2FAModal(false);
      setEnableCode('');
      setTwoFaSetupData(null);
      const me = await backyardApi.getMe();
      onUserUpdated(me.user);
      setStatusMessage({ type: 'success', text: '2FA 双因素安全保护已成功开启！' });
    } catch (err: any) {
      setTwoFaError(err.message || '2FA 验证失败');
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleConfirmDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode || disableCode.length !== 6) {
      setDisableError('请输入当前 6 位动态验证码');
      return;
    }

    setDisableLoading(true);
    setDisableError(null);

    try {
      await backyardApi.disable2FA(disableCode.trim());
      setShowDisableModal(false);
      setDisableCode('');
      const me = await backyardApi.getMe();
      onUserUpdated(me.user);
      setStatusMessage({ type: 'success', text: '2FA 双因素安全认证已关闭' });
    } catch (err: any) {
      setDisableError(err.message || '关闭 2FA 失败');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      setPwdError('请填写原密码与新密码');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('两次输入的新密码不一致');
      return;
    }

    setPwdLoading(true);
    setPwdError(null);
    setPwdSuccess(null);

    try {
      const res = await backyardApi.changePassword(oldPassword, newPassword);
      setPwdSuccess(res.message || '密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwdError(err.message || '密码修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleAddIpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim()) return;

    setAddIpLoading(true);
    setAddIpError(null);

    try {
      const duration = Number(newIpDuration);
      await backyardApi.blockIp({
        ip: newIp.trim(),
        reason: newIpReason.trim() || undefined,
        durationHours: duration > 0 ? duration : null
      });
      setShowAddIpModal(false);
      setNewIp('');
      setNewIpReason('');
      setNewIpDuration('0');
      fetchBlockedIps();
      setStatusMessage({ type: 'success', text: `已成功限制 IP (${newIp}) 的系统访问权限` });
    } catch (err: any) {
      setAddIpError(err.message || '添加 IP 黑名单失败');
    } finally {
      setAddIpLoading(false);
    }
  };

  const handleConfirmUnblockIp = async () => {
    if (!ipToUnblock) return;
    setUnblockLoading(true);
    try {
      await backyardApi.unblockIp(ipToUnblock.id);
      setIpToUnblock(null);
      fetchBlockedIps();
      setStatusMessage({ type: 'success', text: `已解除对 IP (${ipToUnblock.ip}) 的访问限制` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '解除 IP 限制失败' });
    } finally {
      setUnblockLoading(false);
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // Hardware calculations
  const hardware = systemPayload?.hardware;
  const recommendations = systemPayload?.recommendations;
  const freeMemMb = hardware?.freeMemMb || 2048;
  const totalMemMb = hardware?.totalMemMb || 4096;
  const estimatedRpaMemUsageMb = rpaMax * 300;
  const rpaMemPercentageOfFree = freeMemMb > 0 ? Math.round((estimatedRpaMemUsageMb / freeMemMb) * 100) : 0;

  const isRpaMemDangerous = rpaMemPercentageOfFree > 80;
  const isRpaMemWarning = rpaMemPercentageOfFree > 50 && !isRpaMemDangerous;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Sub-Tab Navigation */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <Zap size={22} color="var(--by-primary)" />
            <span>系统控制与全局设定</span>
          </h2>
          <p className="by-view-desc">
            配置并发算力调度、无头浏览器动态限流、硬件感知推荐、安全 2FA 认证与 IP 防刷访问控制
          </p>
        </div>

        {/* Sub-Tab Switcher */}
        <div className="by-segmented-tabs">
          <button
            type="button"
            className={`by-segmented-tab ${activeSubTab === 'concurrency' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('concurrency')}
          >
            <Zap size={14} />
            <span>并发与硬件调优</span>
          </button>
          <button
            type="button"
            className={`by-segmented-tab ${activeSubTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('security')}
          >
            <Shield size={14} />
            <span>安全与 2FA</span>
          </button>
          <button
            type="button"
            className={`by-segmented-tab ${activeSubTab === 'ip_bans' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('ip_bans')}
          >
            <Ban size={14} />
            <span>IP 访问限制</span>
            {blockedIps.length > 0 && <span className="by-tab-counter">{blockedIps.length}</span>}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: statusMessage.type === 'success' ? 'var(--by-success-bg)' : 'var(--by-danger-bg)',
          border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
          color: statusMessage.type === 'success' ? 'var(--by-success)' : 'var(--by-danger)',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {statusMessage.text}
          </span>
          <button className="by-btn-icon" onClick={() => setStatusMessage(null)} style={{ padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ================= TAB 1: Concurrency & Hardware Tuning ================= */}
      {activeSubTab === 'concurrency' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Server Vitals & Smart Recommendations Card */}
          <div className="by-card">
            <div className="by-card-header">
              <div>
                <div className="by-card-title">
                  <Server size={18} color="var(--by-primary)" />
                  服务器硬件态势感知与算力推荐 (Live Server Vitals)
                </div>
                <div className="by-card-subtitle">
                  系统基于宿主机实时可用内存与 CPU 拓扑，智能推导最科学安全的无头浏览器并发上限
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="by-btn by-btn-secondary by-btn-sm"
                  onClick={fetchSystemSettings}
                  disabled={loadingSystem}
                >
                  <RefreshCw size={13} className={loadingSystem ? 'animate-spin' : ''} /> 刷新指标
                </button>
                {recommendations && (
                  <button
                    type="button"
                    className="by-btn by-btn-primary by-btn-sm"
                    onClick={handleApplySmartRecommendations}
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                      borderColor: '#0ea5e9'
                    }}
                  >
                    <Sparkles size={13} className={autoTuneApplied ? 'animate-bounce' : ''} /> 一键应用最优推荐配置
                  </button>
                )}
              </div>
            </div>

            {/* 4-Card Hardware Vitals Grid */}
            <div className="by-vitals-grid">
              {/* RAM Vital Card */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <span className="by-vital-label">
                    <HardDrive size={15} color="var(--by-primary)" />
                    <span>宿主机物理内存</span>
                  </span>
                  <span className="by-vital-badge" style={{ color: 'var(--by-primary)' }}>
                    {hardware ? `${(hardware.totalMemMb / 1024).toFixed(1)} GB 总量` : '--'}
                  </span>
                </div>
                <div className="by-vital-value">
                  {hardware ? `${(hardware.freeMemMb / 1024).toFixed(1)} GB` : '--'}
                  <span className="by-vital-sub">剩余可用</span>
                </div>
                <div className="by-vital-progress-bg">
                  <div
                    className="by-vital-progress-bar"
                    style={{
                      width: `${hardware?.memUsagePercent || 50}%`,
                      background: (hardware?.memUsagePercent || 0) > 85 ? 'var(--by-danger)' : (hardware?.memUsagePercent || 0) > 65 ? 'var(--by-warning)' : 'var(--by-primary)'
                    }}
                  />
                </div>
                <div className="by-vital-footer">
                  <span>已占用: {hardware?.memUsagePercent || 0}%</span>
                  <span>Node.js: {hardware?.processMemoryMb || 0} MB</span>
                </div>
              </div>

              {/* CPU Vital Card */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <span className="by-vital-label">
                    <Cpu size={15} color="var(--by-cyan)" />
                    <span>CPU 架构与负载</span>
                  </span>
                  <span className="by-vital-badge" style={{ color: 'var(--by-cyan)' }}>
                    {hardware ? `${hardware.cpuCount} 逻辑核心` : '--'}
                  </span>
                </div>
                <div className="by-vital-value">
                  {hardware?.cpuModel ? hardware.cpuModel.split(' ')[0] : '多核处理器'}
                  <span className="by-vital-sub">运行平稳</span>
                </div>
                <div className="by-vital-desc-sub">
                  {hardware?.cpuModel || 'CPU Cores Active'}
                </div>
                <div className="by-vital-footer">
                  <span>1/5/15m 负载:</span>
                  <span className="by-mono-text">
                    {hardware?.loadAvg?.join(', ') || '0.12, 0.20, 0.18'}
                  </span>
                </div>
              </div>

              {/* RPA Headless Instance Card */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <span className="by-vital-label">
                    <Layers size={15} color="var(--by-purple)" />
                    <span>Web RPA 算力预算</span>
                  </span>
                  <span className="by-vital-badge" style={{ color: 'var(--by-purple)' }}>
                    单实例 ~300MB
                  </span>
                </div>
                <div className="by-vital-value">
                  {rpaMax}
                  <span className="by-vital-sub">当前配置并发数</span>
                </div>
                <div className="by-vital-footer" style={{ marginTop: 'auto' }}>
                  <span>峰值预估开销:</span>
                  <span style={{ fontWeight: 600, color: isRpaMemDangerous ? 'var(--by-danger)' : isRpaMemWarning ? 'var(--by-warning)' : 'var(--by-success)' }}>
                    ~{estimatedRpaMemUsageMb} MB
                  </span>
                </div>
              </div>

              {/* Health & Recommendation Card */}
              <div className="by-vital-card" style={{
                background: recommendations?.healthStatus === 'ultra' ? 'rgba(14, 165, 233, 0.08)' : recommendations?.healthStatus === 'robust' ? 'rgba(16, 185, 129, 0.08)' : recommendations?.healthStatus === 'tight' ? 'rgba(244, 63, 94, 0.08)' : 'var(--by-bg-input)'
              }}>
                <div className="by-vital-header">
                  <span className="by-vital-label">
                    <Sparkles size={15} color="var(--by-warning)" />
                    <span>算力健康评级</span>
                  </span>
                  <span className={`by-badge ${recommendations?.healthStatus === 'ultra' ? 'by-badge-primary' : recommendations?.healthStatus === 'robust' ? 'by-badge-success' : recommendations?.healthStatus === 'tight' ? 'by-badge-danger' : 'by-badge-warning'}`}>
                    {recommendations?.healthStatus === 'ultra' ? '极速性能 (Ultra)' : recommendations?.healthStatus === 'robust' ? '算力充沛 (Robust)' : recommendations?.healthStatus === 'tight' ? '内存偏紧 (Tight)' : '均衡良好 (Healthy)'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--by-text-primary)', lineHeight: 1.45 }}>
                  {recommendations?.healthMessage || '系统已处于最佳状态，可根据业务流量灵活微调。'}
                </div>
                <div className="by-vital-footer" style={{ marginTop: 'auto' }}>
                  <span>推荐 RPA: <strong style={{ color: 'var(--by-primary)' }}>{recommendations?.rpaConcurrency || 3}</strong></span>
                  <span>推荐全局: <strong style={{ color: 'var(--by-cyan)' }}>{recommendations?.globalConcurrency || 50}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Concurrency Sliders & Custom Parameters Form */}
          <form onSubmit={handleSaveSystemSettings} className="by-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="by-card-header">
              <div>
                <div className="by-card-title">
                  <Sliders size={18} color="var(--by-cyan)" />
                  并发调度限流器与超时策略自定义
                </div>
                <div className="by-card-subtitle">
                  参数修改后点击保存即可在调度内核实时毫秒级生效，无需重启任何服务进程
                </div>
              </div>
            </div>

            {/* 2-Column Concurrency Grid on PC */}
            <div className="by-concurrency-two-col-grid">
              {/* Left Column: RPA Max Concurrency */}
              <div className="by-slider-section">
                <div className="by-slider-header">
                  <div>
                    <div className="by-slider-title">
                      <span>🌐 1. 无头浏览器 RPA 最大并发</span>
                      <span className="by-badge by-badge-primary">核心性能项</span>
                    </div>
                    <div className="by-slider-desc">
                      适用于 <strong>@offilive.com</strong> 与 <strong>@mail.com / @cheerful.com</strong> 等自动化抓取
                    </div>
                  </div>
                  <div className="by-slider-val-box">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={rpaMax}
                      onChange={(e) => setRpaMax(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                      className="by-slider-number-input"
                    />
                    <span className="by-slider-unit">个实例</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={rpaMax}
                  onChange={(e) => setRpaMax(Number(e.target.value))}
                  className={`by-range-slider ${isRpaMemDangerous ? 'slider-danger' : isRpaMemWarning ? 'slider-warning' : 'slider-primary'}`}
                />

                <div className="by-slider-scale">
                  <span>1 (轻载)</span>
                  <span>5 (标准)</span>
                  <span>10 (性能)</span>
                  <span>20 (极限)</span>
                </div>

                {/* Memory Impact Bar */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: isRpaMemDangerous ? 'var(--by-danger-bg)' : isRpaMemWarning ? 'var(--by-warning-bg)' : 'var(--by-bg-input)',
                  border: `1px solid ${isRpaMemDangerous ? 'rgba(244, 63, 94, 0.3)' : isRpaMemWarning ? 'rgba(245, 158, 11, 0.3)' : 'var(--by-border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: isRpaMemDangerous ? 'var(--by-danger)' : isRpaMemWarning ? 'var(--by-warning)' : 'var(--by-text-secondary)',
                  marginTop: 'auto'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isRpaMemDangerous ? <AlertTriangle size={14} /> : isRpaMemWarning ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                    <span>峰值预估 ~{estimatedRpaMemUsageMb} MB (占剩余 {rpaMemPercentageOfFree}%)</span>
                  </span>
                  <span style={{ fontWeight: 600 }}>{isRpaMemDangerous ? '⚠️ 超载预警' : isRpaMemWarning ? 'ℹ️ 开销适中' : '🟢 平稳绿区'}</span>
                </div>
              </div>

              {/* Right Column: Provider Limit & Global Pool */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Slider 2: Provider Concurrency */}
                <div className="by-slider-section" style={{ padding: '14px 16px', gap: '10px' }}>
                  <div className="by-slider-header">
                    <div>
                      <div className="by-slider-title" style={{ fontSize: '0.88rem' }}>
                        <span>⚡ 2. 单邮件服务商并发限制</span>
                        <span className="by-badge by-badge-cyan">防风控</span>
                      </div>
                      <div className="by-slider-desc" style={{ fontSize: '0.74rem' }}>
                        同服务商域名（如 @gmx.com）同时发起的最大并发连接
                      </div>
                    </div>
                    <div className="by-slider-val-box">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={providerMax}
                        onChange={(e) => setProviderMax(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                        className="by-slider-number-input"
                      />
                      <span className="by-slider-unit">连接数</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={providerMax}
                    onChange={(e) => setProviderMax(Number(e.target.value))}
                    className="by-range-slider slider-cyan"
                  />

                  <div className="by-slider-scale">
                    <span>1 (克制)</span>
                    <span>10 (推荐)</span>
                    <span>25 (高速)</span>
                    <span>50 (极限)</span>
                  </div>
                </div>

                {/* Slider 3: Global Concurrency */}
                <div className="by-slider-section" style={{ padding: '14px 16px', gap: '10px' }}>
                  <div className="by-slider-header">
                    <div>
                      <div className="by-slider-title" style={{ fontSize: '0.88rem' }}>
                        <span>🌐 3. 全局最大并发任务池</span>
                        <span className="by-badge by-badge-purple">总吞吐</span>
                      </div>
                      <div className="by-slider-desc" style={{ fontSize: '0.74rem' }}>
                        全系统同时执行的 IMAP、POP3、Graph 与 RPA 总任务数
                      </div>
                    </div>
                    <div className="by-slider-val-box">
                      <input
                        type="number"
                        min={10}
                        max={200}
                        value={globalMax}
                        onChange={(e) => setGlobalMax(Math.min(200, Math.max(10, Number(e.target.value) || 10)))}
                        className="by-slider-number-input"
                      />
                      <span className="by-slider-unit">个任务</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={globalMax}
                    onChange={(e) => setGlobalMax(Number(e.target.value))}
                    className="by-range-slider slider-purple"
                  />

                  <div className="by-slider-scale">
                    <span>10</span>
                    <span>50 (推荐)</span>
                    <span>100</span>
                    <span>200 (大并发)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeout & Security Rules (4 Feature Cards Grid) */}
            <div className="by-timeouts-container">
              <div className="by-section-title-row">
                <div className="by-section-title-left">
                  <Clock size={16} color="var(--by-purple)" />
                  <span>任务超时控制与接口安全策略</span>
                </div>
                <span className="by-section-title-hint">
                  针对不同协议引擎精细化配置单任务生命周期与防刷缓存
                </span>
              </div>

              <div className="by-timeouts-grid">
                {/* Card 1: RPA Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-primary">
                      <Clock size={14} />
                    </div>
                    <div className="by-timeout-card-title">RPA 抓取超时</div>
                  </div>
                  <div className="by-input-with-unit">
                    <input
                      type="number"
                      min={30}
                      max={180}
                      value={timeoutRpaSec}
                      onChange={(e) => setTimeoutRpaSec(Number(e.target.value) || 90)}
                    />
                    <span className="by-unit-tag">秒</span>
                  </div>
                  <div className="by-timeout-card-desc">
                    适用 OffiLive / Mail.com 网页端 (建议 60~120s)
                  </div>
                </div>

                {/* Card 2: IMAP Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-cyan">
                      <Clock size={14} />
                    </div>
                    <div className="by-timeout-card-title">标准 IMAP 超时</div>
                  </div>
                  <div className="by-input-with-unit">
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={timeoutAccountSec}
                      onChange={(e) => setTimeoutAccountSec(Number(e.target.value) || 30)}
                    />
                    <span className="by-unit-tag">秒</span>
                  </div>
                  <div className="by-timeout-card-desc">
                    Socket 直连协议 (建议 15~45s)
                  </div>
                </div>

                {/* Card 3: Batch Job Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-purple">
                      <Clock size={14} />
                    </div>
                    <div className="by-timeout-card-title">批量任务全局超时</div>
                  </div>
                  <div className="by-input-with-unit">
                    <input
                      type="number"
                      min={60}
                      max={600}
                      value={timeoutJobSec}
                      onChange={(e) => setTimeoutJobSec(Number(e.target.value) || 300)}
                    />
                    <span className="by-unit-tag">秒</span>
                  </div>
                  <div className="by-timeout-card-desc">
                    大批量导入排队总保护时限 (建议 180~600s)
                  </div>
                </div>

                {/* Card 4: API Key Cooldown */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-success">
                      <Zap size={14} />
                    </div>
                    <div className="by-timeout-card-title">API Key 冷却缓存</div>
                  </div>
                  <div className="by-input-with-unit">
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      step={100}
                      value={apiCooldownMs}
                      onChange={(e) => setApiCooldownMs(Number(e.target.value) || 0)}
                    />
                    <span className="by-unit-tag">毫秒</span>
                  </div>
                  <div className="by-timeout-card-desc">
                    同 Key 间隔内请求直取缓存 (建议 1000~3000ms)
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar (Sticky & Mobile Responsive) */}
            <div className="by-sticky-action-bar">
              <button
                type="button"
                className="by-btn by-btn-secondary"
                onClick={() => setShowResetModal(true)}
                disabled={savingSystem}
              >
                <RotateCcw size={14} /> 恢复默认配置
              </button>

              <button
                type="submit"
                className="by-btn by-btn-primary"
                disabled={savingSystem}
                style={{ minWidth: '160px' }}
              >
                {savingSystem ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>正在热重载...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>💾 保存并立即热生效</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= TAB 2: Security & 2FA & Password ================= */}
      {activeSubTab === 'security' && (
        <div className="by-two-col-grid">
          {/* Left: 2FA Card */}
          <div className="by-card">
            <div className="by-card-header">
              <div>
                <div className="by-card-title">
                  {user.twoFactorEnabled ? <ShieldCheck size={18} color="var(--by-success)" /> : <ShieldAlert size={18} color="var(--by-warning)" />}
                  2FA 双因素安全身份验证 (TOTP)
                </div>
                <div className="by-card-subtitle">
                  登录需验证 Google Authenticator 或 1Password 中的 6 位动态口令
                </div>
              </div>
            </div>

            <div style={{
              marginTop: '4px',
              padding: '14px',
              borderRadius: '8px',
              background: user.twoFactorEnabled ? 'var(--by-success-bg)' : 'var(--by-warning-bg)',
              border: `1px solid ${user.twoFactorEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontWeight: 700, color: user.twoFactorEnabled ? 'var(--by-success)' : 'var(--by-warning)', fontSize: '0.9rem' }}>
                  当前状态: {user.twoFactorEnabled ? '已开启 2FA 安全防护' : '未开启 2FA (建议立即开启)'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', marginTop: '2px' }}>
                  {user.twoFactorEnabled
                    ? '管理后台享有双重防护，有效抵御密码爆破。'
                    : '支持 Google/Microsoft Authenticator 扫码。'}
                </div>
              </div>

              <div>
                {user.twoFactorEnabled ? (
                  <button className="by-btn by-btn-danger by-btn-sm" onClick={() => { setShowDisableModal(true); setDisableError(null); setDisableCode(''); }}>
                    关闭 2FA
                  </button>
                ) : (
                  <button className="by-btn by-btn-primary by-btn-sm" onClick={handleStartSetup2FA} disabled={twoFaLoading}>
                    {twoFaLoading ? '正在初始化...' : '立即绑定开启'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Change Password Card */}
          <div className="by-card">
            <div className="by-card-header">
              <div>
                <div className="by-card-title">
                  <Lock size={18} color="var(--by-primary)" /> 修改管理员登录密码
                </div>
                <div className="by-card-subtitle">
                  定期更换密码以确保后台及 API 发行系统安全
                </div>
              </div>
            </div>

            {pwdError && (
              <div style={{
                backgroundColor: 'var(--by-danger-bg)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'var(--by-danger)',
                fontSize: '0.84rem',
                marginBottom: '12px'
              }}>
                {pwdError}
              </div>
            )}

            {pwdSuccess && (
              <div style={{
                backgroundColor: 'var(--by-success-bg)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'var(--by-success)',
                fontSize: '0.84rem',
                marginBottom: '12px'
              }}>
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <div className="by-input-group" style={{ marginBottom: 0 }}>
                <label className="by-label">原密码</label>
                <input
                  type="password"
                  className="by-input"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入当前管理员密码"
                  required
                />
              </div>

              <div className="by-input-group" style={{ marginBottom: 0 }}>
                <label className="by-label">新密码</label>
                <input
                  type="password"
                  className="by-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位新密码"
                  required
                />
              </div>

              <div className="by-input-group" style={{ marginBottom: 0 }}>
                <label className="by-label">确认新密码</label>
                <input
                  type="password"
                  className="by-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  required
                />
              </div>

              <button type="submit" className="by-btn by-btn-primary" style={{ marginTop: '4px' }} disabled={pwdLoading}>
                {pwdLoading ? '正在修改...' : '确认更新密码'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 3: IP Access Control & Bans ================= */}
      {activeSubTab === 'ip_bans' && (
        <div className="by-card">
          <div className="by-card-header">
            <div>
              <div className="by-card-title">
                <Ban size={18} color="var(--by-danger)" />
                IP 访问限制与防刷黑名单
              </div>
              <div className="by-card-subtitle">
                受限 IP 无法创建抓取任务或调用 API Key
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="by-btn by-btn-secondary by-btn-sm" onClick={fetchBlockedIps} disabled={loadingIps}>
                <RefreshCw size={13} className={loadingIps ? 'animate-spin' : ''} /> 刷新
              </button>
              <button className="by-btn by-btn-danger by-btn-sm" onClick={() => { setShowAddIpModal(true); setAddIpError(null); }}>
                <Plus size={13} /> 添加受限 IP
              </button>
            </div>
          </div>

          {loadingIps && blockedIps.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--by-text-secondary)' }}>
              <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
              载入 IP 黑名单中...
            </div>
          ) : blockedIps.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--by-text-muted)', fontSize: '0.88rem' }}>
              目前暂无受限 IP（系统运行平稳，无恶意并发滥用）
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {blockedIps.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--by-bg-input)',
                    border: '1px solid var(--by-border)',
                    borderRadius: '8px',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--by-danger)', fontFamily: 'var(--by-font-mono)', fontSize: '0.88rem' }}>
                        {item.ip}
                      </span>
                      <span className="by-badge by-badge-danger" style={{ fontSize: '0.7rem' }}>
                        已封禁
                      </span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', marginTop: '2px' }}>
                      原因: {item.reason || '管理员限制'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', textAlign: 'right' }}>
                      {item.expiresAt ? `到期: ${new Date(item.expiresAt).toLocaleDateString('zh-CN')}` : '永久有效'}
                    </div>
                    <button
                      type="button"
                      className="by-btn by-btn-secondary by-btn-sm"
                      onClick={() => setIpToUnblock(item)}
                      style={{ height: '28px', fontSize: '0.76rem' }}
                    >
                      解封
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Reset Concurrency Settings Modal */}
      <ConfirmModal
        isOpen={showResetModal}
        title="恢复默认并发与调度配置？"
        message="重置后，无头浏览器并发将恢复为 3 个，全局并发为 50 个，并立即在调度内核中热生效。确认恢复吗？"
        confirmText="确认恢复默认"
        cancelText="取消"
        variant="warning"
        loading={resetLoading}
        onConfirm={handleConfirmResetSettings}
        onClose={() => setShowResetModal(false)}
      />

      {/* Add Blocked IP Modal */}
      {showAddIpModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '460px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ban size={18} color="var(--by-danger)" /> 添加 IP 访问限制
              </div>
              <button className="by-btn-icon" onClick={() => setShowAddIpModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddIpSubmit}>
              <div className="by-modal-body">
                <div className="by-input-group">
                  <label className="by-label">IP 地址</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如: 192.168.1.100 或 123.45.67.89"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">限制原因</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如: 异常高频批量使用 / 恶意刷取"
                    value={newIpReason}
                    onChange={(e) => setNewIpReason(e.target.value)}
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">封禁时长</label>
                  <select className="by-select" value={newIpDuration} onChange={(e) => setNewIpDuration(e.target.value)}>
                    <option value="0">永久限制</option>
                    <option value="1">1 小时</option>
                    <option value="24">24 小时 (1 天)</option>
                    <option value="168">7 天</option>
                    <option value="720">30 天</option>
                  </select>
                </div>

                {addIpError && (
                  <div style={{ color: 'var(--by-danger)', fontSize: '0.82rem', marginTop: '6px' }}>
                    {addIpError}
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowAddIpModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-danger" disabled={addIpLoading || !newIp.trim()}>
                  {addIpLoading ? '正在添加...' : '确认封禁该 IP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Setup Modal */}
      {show2FAModal && twoFaSetupData && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '480px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} color="var(--by-primary)" /> 绑定 2FA 身份验证器
              </div>
              <button className="by-btn-icon" onClick={() => setShow2FAModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmEnable2FA}>
              <div className="by-modal-body">
                <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                  <div
                    style={{
                      background: '#fff',
                      padding: '12px',
                      borderRadius: '8px',
                      display: 'inline-block',
                      margin: '0 auto 10px auto'
                    }}
                    dangerouslySetInnerHTML={{ __html: twoFaSetupData.qrSvg }}
                  />
                  <div style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)' }}>
                    请使用 Google Authenticator、1Password 或微软身份验证器扫码
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">或手动输入密钥</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="by-input"
                      value={twoFaSetupData.secret}
                      readOnly
                      style={{ fontFamily: 'var(--by-font-mono)', fontSize: '0.86rem' }}
                    />
                    <button
                      type="button"
                      className="by-btn by-btn-secondary"
                      onClick={() => handleCopySecret(twoFaSetupData.secret)}
                    >
                      {copiedSecret ? <Check size={14} color="var(--by-success)" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">输入验证码完成激活</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="请输入 App 中的 6 位动态数字"
                    value={enableCode}
                    onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    required
                    style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '4px', fontFamily: 'var(--by-font-mono)' }}
                  />
                </div>

                {twoFaError && (
                  <div style={{ color: 'var(--by-danger)', fontSize: '0.82rem', marginTop: '6px' }}>
                    {twoFaError}
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShow2FAModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={twoFaLoading || enableCode.length !== 6}>
                  {twoFaLoading ? '正在激活...' : '确认激活开启'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disable 2FA Modal */}
      {showDisableModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '420px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="var(--by-danger)" /> 关闭 2FA 安全保护
              </div>
              <button className="by-btn-icon" onClick={() => setShowDisableModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDisable2FA}>
              <div className="by-modal-body">
                <div style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', marginBottom: '14px' }}>
                  为了验证您的管理员身份，请在下方输入验证器 App 中的当前 6 位动态口令：
                </div>

                <div className="by-input-group">
                  <label className="by-label">6 位动态口令</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="输入 6 位数字"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    required
                    autoFocus
                    style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '4px', fontFamily: 'var(--by-font-mono)' }}
                  />
                </div>

                {disableError && (
                  <div style={{ color: 'var(--by-danger)', fontSize: '0.82rem', marginTop: '6px' }}>
                    {disableError}
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowDisableModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-danger" disabled={disableLoading || disableCode.length !== 6}>
                  {disableLoading ? '正在关闭...' : '确认关闭 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unblock IP Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(ipToUnblock)}
        title="解除 IP 访问限制？"
        message={`确定要解封 IP (${ipToUnblock?.ip}) 吗？解封后该客户端将恢复正常访问权限。`}
        confirmText="确认解封"
        cancelText="取消"
        variant="primary"
        loading={unblockLoading}
        onConfirm={handleConfirmUnblockIp}
        onClose={() => setIpToUnblock(null)}
      />
    </div>
  );
};
