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
  Clock
} from 'lucide-react';
import { backyardApi } from '../api';
import type { AdminUser, BlockedIpItem } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface SettingsViewProps {
  user: AdminUser;
  onUserUpdated: (user: AdminUser) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUserUpdated }) => {
  // 2FA Modal State
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
    fetchBlockedIps();
  }, []);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div className="by-view-header">
        <div>
          <h2 className="by-view-title">
            <Shield size={22} color="var(--by-primary)" />
            <span>安全与系统配置</span>
          </h2>
          <p className="by-view-desc">
            管理管理员 2FA 双因素安全认证、IP 黑名单访问限制、登录凭据与系统底层状态
          </p>
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
          justifyContent: 'space-between'
        }}>
          <span>{statusMessage.text}</span>
          <button className="by-btn-icon" onClick={() => setStatusMessage(null)} style={{ padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="by-two-col-grid">
        {/* Left Column: IP Access Control & 2FA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* IP Block & Access Control Card */}
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
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--by-text-muted)', fontSize: '0.86rem' }}>
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

          {/* 2FA Card */}
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
        </div>

        {/* Right Column: Password & System Environment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Change Password Card */}
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

          {/* System Status Card */}
          <div className="by-card">
            <div className="by-card-header">
              <div>
                <div className="by-card-title">
                  <Server size={18} color="var(--by-purple)" /> 运行时环境与系统信息
                </div>
                <div className="by-card-subtitle">
                  底层持久化引擎与无头浏览器状态
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>数据库引擎</div>
                <div style={{ fontWeight: 600, color: 'var(--by-text-primary)', marginTop: '2px', fontSize: '0.88rem' }}>SQLite 3.53 (Node.js 内置)</div>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>凭据加密规范</div>
                <div style={{ fontWeight: 600, color: 'var(--by-success)', marginTop: '2px', fontSize: '0.88rem' }}>AES-256-GCM 强加密</div>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>Chrome RPA 调度器</div>
                <div style={{ fontWeight: 600, color: 'var(--by-primary)', marginTop: '2px', fontSize: '0.88rem' }}>Playwright Chromium (Headless)</div>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--by-bg-input)', borderRadius: '8px', border: '1px solid var(--by-border)' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>后台管理路径</div>
                <div style={{ fontWeight: 600, color: 'var(--by-purple)', marginTop: '2px', fontFamily: 'var(--by-font-mono)', fontSize: '0.88rem' }}>/backyard</div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              <div className="by-modal-body" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.88rem', color: 'var(--by-text-secondary)', marginBottom: '16px' }}>
                  第 1 步：使用手机身份验证器扫描下方二维码
                </div>

                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: 'var(--by-shadow-lg)'
                  }}
                  dangerouslySetInnerHTML={{ __html: twoFaSetupData.qrSvg }}
                />

                <div style={{ marginTop: '14px', fontSize: '0.8rem', color: 'var(--by-text-muted)' }}>
                  或手动输入密钥:
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--by-bg-input)',
                  border: '1px solid var(--by-border)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  marginTop: '4px'
                }}>
                  <code style={{ fontFamily: 'var(--by-font-mono)', color: 'var(--by-text-code)', fontWeight: 700 }}>
                    {twoFaSetupData.secret}
                  </code>
                  <button
                    type="button"
                    className="by-btn-icon"
                    style={{ padding: '2px' }}
                    onClick={() => handleCopySecret(twoFaSetupData.secret)}
                    title="复制密钥"
                  >
                    {copiedSecret ? <Check size={14} color="var(--by-success)" /> : <Copy size={14} />}
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--by-border)', marginTop: '20px', paddingTop: '16px' }}>
                  <div style={{ fontSize: '0.88rem', color: 'var(--by-text-primary)', fontWeight: 600, marginBottom: '8px' }}>
                    第 2 步：输入 App 生成的 6 位动态验证码
                  </div>

                  <input
                    type="text"
                    className="by-input"
                    placeholder="6 位验证码"
                    maxLength={6}
                    value={enableCode}
                    onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ''))}
                    style={{
                      textAlign: 'center',
                      fontSize: '1.4rem',
                      letterSpacing: '6px',
                      fontWeight: 700,
                      fontFamily: 'var(--by-font-mono)',
                      maxWidth: '220px',
                      margin: '0 auto'
                    }}
                    autoFocus
                    required
                  />

                  {twoFaError && (
                    <div style={{ color: 'var(--by-danger)', fontSize: '0.82rem', marginTop: '8px' }}>
                      {twoFaError}
                    </div>
                  )}
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShow2FAModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={twoFaLoading || enableCode.length !== 6}>
                  {twoFaLoading ? '正在验证...' : '验证并开启'}
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
                <ShieldAlert size={18} color="var(--by-danger)" /> 关闭 2FA 安全认证
              </div>
              <button className="by-btn-icon" onClick={() => setShowDisableModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDisable2FA}>
              <div className="by-modal-body">
                <p style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)', margin: '0 0 14px 0' }}>
                  为了确保安全，关闭 2FA 前请输入当前验证器中的 6 位动态验证码：
                </p>

                <div className="by-input-group">
                  <input
                    type="text"
                    className="by-input"
                    placeholder="6 位动态码"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                    style={{
                      textAlign: 'center',
                      fontSize: '1.4rem',
                      letterSpacing: '6px',
                      fontWeight: 700,
                      fontFamily: 'var(--by-font-mono)'
                    }}
                    autoFocus
                    required
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
                  {disableLoading ? '正在验证...' : '确认关闭 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unblock IP Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(ipToUnblock)}
        title="解除 IP 访问限制"
        message={
          <div>
            确定要解除对 IP <strong style={{ color: 'var(--by-text-code)' }}>{ipToUnblock?.ip}</strong> 的访问限制吗？
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>
              解除后该 IP 将恢复正常抓取和 API 访问。
            </div>
          </div>
        }
        confirmText="确认解除限制"
        cancelText="取消"
        variant="warning"
        loading={unblockLoading}
        onConfirm={handleConfirmUnblockIp}
        onClose={() => setIpToUnblock(null)}
      />
    </div>
  );
};
