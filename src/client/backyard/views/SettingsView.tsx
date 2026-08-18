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
  HardDrive,
  Wifi,
  WifiOff,
  Activity,
  Shuffle,
  Gauge,
  Play,
  Eye,
  EyeOff,
  Radio,
  Network,
  FileText,
  ArrowRight,
  BarChart2
} from 'lucide-react';
import { backyardApi } from '../api';
import type {
  AdminUser,
  BlockedIpItem,
  SystemSettingsPayload,
  SystemConcurrencySettings,
  ProxyNode,
  GlobalProxyConfig,
  ProxyTrafficSummary,
  ProxyTrafficLogItem,
  ProxyStrategy,
  ProxyRoutingMode,
  ProxyProtocol
} from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

interface SettingsViewProps {
  user: AdminUser;
  onUserUpdated: (user: AdminUser) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, onUserUpdated }) => {
  // Active Sub-Tab
  const [activeSubTab, setActiveSubTab] = useState<'concurrency' | 'proxy' | 'security' | 'ip_bans'>('concurrency');

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

  // ================= Proxy Network & Traffic Pool State =================
  const [proxyConfig, setProxyConfig] = useState<GlobalProxyConfig | null>(null);
  const [proxyNodes, setProxyNodes] = useState<ProxyNode[]>([]);
  const [proxySummary, setProxySummary] = useState<ProxyTrafficSummary | null>(null);
  const [loadingProxy, setLoadingProxy] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);

  // Form state for Proxy Config
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyStrategy, setProxyStrategy] = useState<ProxyStrategy>('round_robin');
  const [proxyRoutingMode, setProxyRoutingMode] = useState<ProxyRoutingMode>('direct_first');
  const [proxyFailover, setProxyFailover] = useState(true);

  // Testing & Node Modal states
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingNode, setEditingNode] = useState<ProxyNode | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<ProxyNode | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Add / Edit form state
  const [nodeInputMode, setNodeInputMode] = useState<'structured' | 'raw'>('structured');
  const [nodeName, setNodeName] = useState('');
  const [nodeHost, setNodeHost] = useState('');
  const [nodePort, setNodePort] = useState('');
  const [nodeUser, setNodeUser] = useState('');
  const [nodePass, setNodePass] = useState('');
  const [showNodePassword, setShowNodePassword] = useState(false);
  const [nodeServer, setNodeServer] = useState('');
  const [nodeProtocol, setNodeProtocol] = useState<ProxyProtocol>('http');
  const [nodeWeight, setNodeWeight] = useState(1);
  const [nodeActive, setNodeActive] = useState(true);
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);
  const [nodeFormSaving, setNodeFormSaving] = useState(false);
  const [nodeTestResult, setNodeTestResult] = useState<{ success: boolean; latencyMs: number; exitIp?: string; exitRegion?: string; error?: string } | null>(null);
  const [nodeTesting, setNodeTesting] = useState(false);

  // Batch import form state
  const [batchRawText, setBatchRawText] = useState('');
  const [batchDefaultProtocol, setBatchDefaultProtocol] = useState<ProxyProtocol>('http');
  const [batchImportLoading, setBatchImportLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // Traffic Logs Modal state
  const [showTrafficModal, setShowTrafficModal] = useState(false);
  const [trafficLogs, setTrafficLogs] = useState<ProxyTrafficLogItem[]>([]);
  const [trafficTotal, setTrafficTotal] = useState(0);
  const [trafficPage, setTrafficPage] = useState(1);
  const [trafficPageSize] = useState(10);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficFilterNodeId, setTrafficFilterNodeId] = useState<string>('');

  // Password Reveal state for node servers
  const [revealedServerIds, setRevealedServerIds] = useState<Set<string>>(new Set());

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

  const fetchProxyConfig = async () => {
    try {
      setLoadingProxy(true);
      const res = await backyardApi.getProxyConfig();
      setProxyConfig(res.config);
      setProxyNodes(res.nodes);
      setProxySummary(res.summary);
      if (res.config) {
        setProxyEnabled(res.config.enabled);
        setProxyStrategy(res.config.strategy);
        setProxyRoutingMode(res.config.routingMode || 'direct_first');
        setProxyFailover(res.config.failoverEnabled);
      }
    } catch (err) {
      console.error('Failed to load proxy config:', err);
    } finally {
      setLoadingProxy(false);
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
    fetchProxyConfig();
    fetchBlockedIps();
  }, []);

  // Format bytes helper for dynamic scaling (Bytes -> KB -> MB -> GB)
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getCpuBrand = (model?: string, platform?: string): string => {
    if (!model) return platform === 'win32' ? 'Windows x64' : 'x64 架构';
    if (/intel/i.test(model)) return 'Intel(R)';
    if (/amd/i.test(model)) return 'AMD(R)';
    if (/apple/i.test(model) || /arm/i.test(model)) return 'ARM64';
    return 'x64 架构';
  };

  const maskProxyServer = (server: string, isRevealed: boolean): string => {
    if (isRevealed) return server;
    try {
      const url = new URL(server);
      if (url.password) {
        url.password = '••••••';
        return url.toString();
      }
      return server;
    } catch {
      return server;
    }
  };

  // ================= Concurrency Submit =================
  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSystem(true);
    setStatusMessage(null);
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
      setStatusMessage({ type: 'success', text: res.message || '系统并发设置已成功保存！' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '保存系统设置失败' });
    } finally {
      setSavingSystem(false);
    }
  };

  // ================= Proxy Handlers =================
  const handleSaveProxyConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingProxy(true);
    setStatusMessage(null);
    try {
      const res = await backyardApi.updateProxyConfig({
        enabled: proxyEnabled,
        strategy: proxyStrategy,
        routingMode: proxyRoutingMode,
        failoverEnabled: proxyFailover
      });
      setProxyConfig(res.config);
      setProxySummary(res.summary);
      setStatusMessage({
        type: 'success',
        text: `代理网络与调度配置已成功保存！当前状态: ${proxyEnabled ? '🟢 已启用代理池' : '⚪ 已关闭 (直连 Direct)'} [模式: ${proxyRoutingMode === 'direct_first' ? '直连优先+403兜底' : proxyRoutingMode === 'always' ? '全量代理接管' : '指定服务商'}]`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '保存代理配置失败' });
    } finally {
      setSavingProxy(false);
    }
  };

  const handleToggleGlobalProxy = async () => {
    const nextState = !proxyEnabled;
    setProxyEnabled(nextState);
    try {
      const res = await backyardApi.updateProxyConfig({
        enabled: nextState,
        strategy: proxyStrategy,
        routingMode: proxyRoutingMode,
        failoverEnabled: proxyFailover
      });
      setProxyConfig(res.config);
      setProxySummary(res.summary);
      setStatusMessage({
        type: 'success',
        text: `代理网络已${nextState ? '开启 (流量将自动走代理池)' : '关闭 (系统走直连 Direct)'}`
      });
    } catch (err: any) {
      setProxyEnabled(!nextState);
      setStatusMessage({ type: 'error', text: err.message || '切换代理开关失败' });
    }
  };

  const handleToggleNodeActive = async (node: ProxyNode) => {
    try {
      const res = await backyardApi.updateProxyNode(node.id, { isActive: !node.isActive });
      setProxyNodes((prev) => prev.map((n) => (n.id === node.id ? res.node : n)));
      if (res.summary) setProxySummary(res.summary);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '更新节点状态失败' });
    }
  };

  const handleTestSingleNode = async (nodeId: string) => {
    setTestingNodeId(nodeId);
    try {
      const res = await backyardApi.testProxyNode(nodeId);
      setProxyNodes((prev) => prev.map((n) => (n.id === nodeId ? res.node : n)));
      setStatusMessage({
        type: res.ok ? 'success' : 'error',
        text: res.ok
          ? `节点测速成功！握手延迟: ${res.result.latencyMs}ms, 出口IP: ${res.result.exitIp || '未知'}`
          : `节点测速失败: ${res.result.error || '无法连接'}`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '测速请求异常' });
    } finally {
      setTestingNodeId(null);
    }
  };

  const handleTestAllNodes = async () => {
    setTestingAll(true);
    try {
      const res = await backyardApi.testAllProxyNodes();
      setProxyNodes(res.nodes);
      if (res.summary) setProxySummary(res.summary);
      setStatusMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '批量测速异常' });
    } finally {
      setTestingAll(false);
    }
  };

  const buildStructuredServerUrl = (protocol: string, host: string, port: string, user: string, pass: string): string => {
    if (!host.trim()) return '';
    let cleanHost = host.trim().replace(/^(https?|socks5):\/\//i, '');
    let finalPort = port.trim();
    if (cleanHost.includes(':') && !cleanHost.includes('[')) {
      const parts = cleanHost.split(':');
      cleanHost = parts[0];
      if (!finalPort) finalPort = parts[1];
    }
    finalPort = finalPort || (protocol === 'socks5' ? '1080' : '8080');
    let authPart = '';
    if (user.trim()) {
      authPart = pass ? `${encodeURIComponent(user.trim())}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user.trim())}@`;
    }
    return `${protocol}://${authPart}${cleanHost}:${finalPort}`;
  };

  const handleOpenAddNodeModal = () => {
    setEditingNode(null);
    setNodeInputMode('structured');
    setNodeName('');
    setNodeHost('');
    setNodePort('');
    setNodeUser('');
    setNodePass('');
    setNodeServer('');
    setNodeProtocol('http');
    setNodeWeight(1);
    setNodeActive(true);
    setNodeFormError(null);
    setNodeTestResult(null);
    setShowAddNodeModal(true);
  };

  const handleOpenEditNodeModal = (node: ProxyNode) => {
    setEditingNode(node);
    setNodeName(node.name);
    setNodeServer(node.server);
    setNodeProtocol(node.protocol);
    setNodeWeight(node.weight);
    setNodeActive(node.isActive);
    setNodeFormError(null);
    setNodeTestResult(null);
    try {
      const url = new URL(node.server);
      setNodeHost(url.hostname);
      setNodePort(url.port || '');
      setNodeUser(decodeURIComponent(url.username || ''));
      setNodePass(decodeURIComponent(url.password || ''));
      if (url.protocol.startsWith('socks')) setNodeProtocol('socks5');
      else setNodeProtocol('http');
    } catch {
      setNodeHost(node.server);
      setNodePort('');
      setNodeUser('');
      setNodePass('');
    }
    setNodeInputMode('structured');
    setShowAddNodeModal(true);
  };

  const handleTestInModal = async () => {
    const target = nodeInputMode === 'structured'
      ? buildStructuredServerUrl(nodeProtocol, nodeHost, nodePort, nodeUser, nodePass)
      : nodeServer.trim();

    if (!target) {
      setNodeFormError(nodeInputMode === 'structured' ? '请先填写代理服务器主机与端口' : '请先输入代理服务器地址');
      return;
    }
    setNodeTesting(true);
    setNodeTestResult(null);
    setNodeFormError(null);
    try {
      const res = await backyardApi.testRawProxy(target);
      setNodeTestResult(res.result);
      if (res.parsed?.protocol) setNodeProtocol(res.parsed.protocol);
      if (res.parsed?.name && !nodeName.trim()) setNodeName(res.parsed.name);
    } catch (err: any) {
      setNodeFormError(err.message || '测速失败');
    } finally {
      setNodeTesting(false);
    }
  };

  const handleSaveNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalServer = nodeInputMode === 'structured'
      ? buildStructuredServerUrl(nodeProtocol, nodeHost, nodePort, nodeUser, nodePass)
      : nodeServer.trim();

    if (!finalServer) {
      setNodeFormError(nodeInputMode === 'structured' ? '请填写代理服务器主机与端口' : '请输入代理服务器地址');
      return;
    }
    setNodeFormSaving(true);
    setNodeFormError(null);
    try {
      if (editingNode) {
        const res = await backyardApi.updateProxyNode(editingNode.id, {
          name: nodeName.trim() || undefined,
          server: finalServer,
          protocol: nodeProtocol,
          isActive: nodeActive,
          weight: nodeWeight
        });
        setProxyNodes((prev) => prev.map((n) => (n.id === editingNode.id ? res.node : n)));
        if (res.summary) setProxySummary(res.summary);
      } else {
        const res = await backyardApi.addProxyNode({
          name: nodeName.trim() || undefined,
          server: finalServer,
          protocol: nodeProtocol,
          isActive: nodeActive,
          weight: nodeWeight
        });
        if (res.node) setProxyNodes((prev) => [...prev, res.node!]);
        if (res.summary) setProxySummary(res.summary);
      }
      setShowAddNodeModal(false);
      setStatusMessage({ type: 'success', text: editingNode ? '代理节点已成功更新' : '代理节点已成功添加' });
    } catch (err: any) {
      setNodeFormError(err.message || '保存代理节点失败');
    } finally {
      setNodeFormSaving(false);
    }
  };

  const handleBatchImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchRawText.trim()) return;
    setBatchImportLoading(true);
    setBatchResult(null);
    try {
      const res = await backyardApi.addProxyNode({
        batchText: batchRawText.trim(),
        defaultProtocol: batchDefaultProtocol
      });
      setBatchResult({ imported: res.imported || 0, errors: res.errors || [] });
      if (res.nodes) setProxyNodes(res.nodes);
      if (res.summary) setProxySummary(res.summary);
      setStatusMessage({ type: 'success', text: res.message });
      if ((res.errors || []).length === 0) {
        setShowBatchModal(false);
        setBatchRawText('');
      }
    } catch (err: any) {
      setBatchResult({ imported: 0, errors: [err.message || '批量导入失败'] });
    } finally {
      setBatchImportLoading(false);
    }
  };

  const handleConfirmDeleteNode = async () => {
    if (!nodeToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await backyardApi.deleteProxyNode(nodeToDelete.id);
      setProxyNodes((prev) => prev.filter((n) => n.id !== nodeToDelete.id));
      if (res.summary) setProxySummary(res.summary);
      setNodeToDelete(null);
      setStatusMessage({ type: 'success', text: '代理节点已成功删除' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '删除节点失败' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchTrafficLogs = async (page = 1, nodeId = trafficFilterNodeId) => {
    setTrafficLoading(true);
    try {
      const res = await backyardApi.getProxyTraffic({ page, pageSize: trafficPageSize, proxyId: nodeId || undefined });
      setTrafficLogs(res.items);
      setTrafficTotal(res.total);
      setTrafficPage(res.page);
    } catch (err) {
      console.error('Failed to load traffic logs:', err);
    } finally {
      setTrafficLoading(false);
    }
  };

  const handleOpenTrafficModal = (nodeId = '') => {
    setTrafficFilterNodeId(nodeId);
    setShowTrafficModal(true);
    fetchTrafficLogs(1, nodeId);
  };

  // ================= 2FA Handlers =================
  const handleStart2FASetup = async () => {
    setTwoFaLoading(true);
    setTwoFaError(null);
    setEnableCode('');
    try {
      const data = await backyardApi.setup2FA();
      setTwoFaSetupData(data);
      setShow2FAModal(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '获取 2FA 密钥失败' });
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleConfirmEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaSetupData || enableCode.length !== 6) return;
    setTwoFaLoading(true);
    setTwoFaError(null);
    try {
      await backyardApi.enable2FA(enableCode);
      setShow2FAModal(false);
      onUserUpdated({ ...user, twoFactorEnabled: true });
      setStatusMessage({ type: 'success', text: '🎉 2FA 双因素安全身份验证已成功开启！' });
    } catch (err: any) {
      setTwoFaError(err.message || '验证码错误，请重新输入');
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleConfirmDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableCode.length !== 6) return;
    setDisableLoading(true);
    setDisableError(null);
    try {
      await backyardApi.disable2FA(disableCode);
      setShowDisableModal(false);
      setDisableCode('');
      onUserUpdated({ ...user, twoFactorEnabled: false });
      setStatusMessage({ type: 'success', text: '2FA 双因素安全验证已关闭。' });
    } catch (err: any) {
      setDisableError(err.message || '动态口令错误，无法关闭');
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
      setStatusMessage({ type: 'success', text: `已成功解除 IP (${ipToUnblock.ip}) 的访问限制` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || '解封失败' });
    } finally {
      setUnblockLoading(false);
    }
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
            配置并发算力调度、无头浏览器动态限流、代理网络与流量池、安全 2FA 认证与 IP 防刷访问控制
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
            className={`by-segmented-tab ${activeSubTab === 'proxy' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('proxy')}
          >
            <Globe size={14} />
            <span>代理网络与流量池</span>
            {proxyNodes.filter((n) => n.isActive).length > 0 && (
              <span
                className="by-tab-counter"
                style={{
                  background: proxyEnabled ? 'var(--by-success)' : 'var(--by-text-muted)',
                  color: '#fff'
                }}
              >
                {proxyNodes.filter((n) => n.isActive).length}
              </span>
            )}
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
        <div
          style={{
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
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {statusMessage.text}
          </span>
          <button
            type="button"
            className="by-btn-icon"
            onClick={() => setStatusMessage(null)}
            style={{ color: 'currentColor' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ================= TAB 1: Concurrency & Hardware Tuning ================= */}
      {activeSubTab === 'concurrency' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Hardware Vitals Dashboard Card */}
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

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="by-btn by-btn-secondary"
                  onClick={fetchSystemSettings}
                  disabled={loadingSystem}
                >
                  <RefreshCw size={14} className={loadingSystem ? 'animate-spin' : ''} /> 刷新指标
                </button>
                {recommendations && (
                  <button
                    type="button"
                    className="by-btn by-btn-primary"
                    onClick={() => {
                      setRpaMax(recommendations.rpaConcurrency);
                      setGlobalMax(recommendations.globalConcurrency);
                      setProviderMax(recommendations.providerConcurrency);
                      setAutoTuneApplied(true);
                      setTimeout(() => setAutoTuneApplied(false), 3000);
                    }}
                  >
                    <Sparkles size={14} /> {autoTuneApplied ? '已填入推荐值！' : '一键应用最优推荐配置'}
                  </button>
                )}
              </div>
            </div>

            {/* Vitals Grid */}
            <div className="by-vitals-grid">
              {/* RAM Vitals */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <div className="by-vital-label">
                    <HardDrive size={14} color="var(--by-primary)" />
                    <span>宿主机物理内存</span>
                  </div>
                  <span className="by-vital-badge">{totalMemMb > 0 ? `${(totalMemMb / 1024).toFixed(1)} GB` : '--'} 总量</span>
                </div>
                <div className="by-vital-value">
                  {freeMemMb > 0 ? `${(freeMemMb / 1024).toFixed(1)} GB` : '--'} <span className="by-vital-sub">剩余可用</span>
                </div>
                <div className="by-vital-progress-bg">
                  <div
                    className="by-vital-progress-bar"
                    style={{
                      width: `${hardware ? hardware.memUsagePercent : 0}%`,
                      backgroundColor: hardware && hardware.memUsagePercent > 85 ? 'var(--by-danger)' : hardware && hardware.memUsagePercent > 70 ? 'var(--by-warning)' : 'var(--by-primary)'
                    }}
                  />
                </div>
                <div className="by-vital-footer">
                  <span>已占用: {hardware ? hardware.memUsagePercent : 0}%</span>
                  <span>Node.js: {hardware ? `${hardware.processMemoryMb} MB` : '--'}</span>
                </div>
              </div>

              {/* CPU Vitals */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <div className="by-vital-label">
                    <Cpu size={14} color="var(--by-cyan)" />
                    <span>CPU 架构与负载</span>
                  </div>
                  <span className="by-vital-badge">{hardware?.cpuCount || '--'} 逻辑核心</span>
                </div>
                <div className="by-vital-value">
                  {getCpuBrand(hardware?.cpuModel, hardware?.platform)}
                  <span className="by-vital-sub">运行平台</span>
                </div>
                <div className="by-vital-desc-sub" title={hardware?.cpuModel || '通用多核处理器'}>
                  {hardware?.cpuModel || 'Intel/AMD 通用处理器'}
                </div>
                <div className="by-vital-footer">
                  <span>1/5/15m 负载:</span>
                  <span className="by-mono-text">
                    {hardware?.loadAvg ? hardware.loadAvg.map((n) => n.toFixed(2)).join(', ') : '0.00, 0.00, 0.00'}
                  </span>
                </div>
              </div>

              {/* RPA Concurrency Estimate */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <div className="by-vital-label">
                    <Layers size={14} color="var(--by-purple)" />
                    <span>Web RPA 算力预算</span>
                  </div>
                  <span className="by-vital-badge" style={{ color: 'var(--by-purple)', borderColor: 'rgba(168, 85, 247, 0.3)' }}>单实例 ~300MB</span>
                </div>
                <div className="by-vital-value">
                  {rpaMax} <span className="by-vital-sub">当前配置并发数</span>
                </div>
                <div className="by-vital-progress-bg">
                  <div
                    className="by-vital-progress-bar"
                    style={{
                      width: `${Math.min(100, rpaMemPercentageOfFree)}%`,
                      backgroundColor: isRpaMemDangerous ? 'var(--by-danger)' : isRpaMemWarning ? 'var(--by-warning)' : 'var(--by-purple)'
                    }}
                  />
                </div>
                <div className="by-vital-footer">
                  <span>峰值预估开销:</span>
                  <span style={{ fontWeight: 600, color: isRpaMemDangerous ? 'var(--by-danger)' : isRpaMemWarning ? 'var(--by-warning)' : 'var(--by-warning)' }}>
                    ~{estimatedRpaMemUsageMb} MB
                  </span>
                </div>
              </div>

              {/* Server Health Rating */}
              <div className="by-vital-card">
                <div className="by-vital-header">
                  <div className="by-vital-label">
                    <Sparkles size={14} color="var(--by-success)" />
                    <span>算力健康评级</span>
                  </div>
                  <span className={`by-badge ${recommendations?.healthStatus === 'ultra' ? 'by-badge-success' : recommendations?.healthStatus === 'robust' ? 'by-badge-info' : recommendations?.healthStatus === 'healthy' ? 'by-badge-warning' : 'by-badge-danger'}`}>
                    {recommendations?.healthStatus === 'ultra' ? '极佳 (Ultra)' : recommendations?.healthStatus === 'robust' ? '强劲 (Robust)' : recommendations?.healthStatus === 'healthy' ? '均衡良好 (Healthy)' : '紧凑 (Tight)'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--by-text-secondary)', lineHeight: 1.45, margin: '2px 0' }}>
                  {recommendations?.healthMessage || '系统可用内存充足，推荐保持当前或优化后的并发配置。'}
                </div>
                <div className="by-vital-footer">
                  <span>推荐 RPA: <strong style={{ color: 'var(--by-primary)' }}>{recommendations?.rpaConcurrency ?? 3}</strong></span>
                  <span>推荐全局: <strong style={{ color: 'var(--by-primary)' }}>{recommendations?.globalConcurrency ?? 50}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Sliders Configuration Form */}
          <form onSubmit={handleSaveSystemSettings} className="by-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div className="by-card-title">
                <Sliders size={18} color="var(--by-primary)" />
                并发调度限流器与超时策略自定义
              </div>
              <div className="by-card-subtitle">
                参数修改后点击保存即可在微秒内核实时热生效，无需重启任何服务进程
              </div>
            </div>

            {/* 2-Column Grid on PC */}
            <div className="by-concurrency-two-col-grid">
              {/* Left Column: RPA Concurrency */}
              <div className="by-slider-section">
                <div className="by-slider-header">
                  <div>
                    <div className="by-slider-title">
                      <Globe size={16} color="var(--by-primary)" />
                      <span>1. 无头浏览器 RPA 最大并发</span>
                      <span className="by-badge by-badge-info">核心性能项</span>
                    </div>
                    <div className="by-slider-desc">
                      适用于 @offilive.com 与 @mail.com / @cheerful.com 等自动化抓取
                    </div>
                  </div>

                  <div className="by-slider-val-box">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={rpaMax}
                      onChange={(e) => setRpaMax(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
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
                  className="by-range-slider slider-primary"
                />

                <div className="by-slider-scale">
                  <span>1 (极简)</span>
                  <span>5 (标准)</span>
                  <span>10 (高配)</span>
                  <span>20 (极好)</span>
                </div>

                {/* Estimate Callout Box matching Figure 2 */}
                <div style={{
                  marginTop: 'auto',
                  padding: '10px 14px',
                  background: isRpaMemDangerous ? 'rgba(244, 63, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  border: `1px solid ${isRpaMemDangerous ? 'rgba(244, 63, 94, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                  borderRadius: 'var(--by-radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isRpaMemDangerous ? 'var(--by-danger)' : 'var(--by-warning)', fontWeight: 500 }}>
                    <AlertCircle size={14} />
                    峰值预估 ~{estimatedRpaMemUsageMb} MB (占剩余 {rpaMemPercentageOfFree}%)
                  </span>
                  <span className={`by-badge ${isRpaMemDangerous ? 'by-badge-danger' : isRpaMemWarning ? 'by-badge-warning' : 'by-badge-warning'}`}>
                    {isRpaMemDangerous ? '高负载风险' : isRpaMemWarning ? '开销适中' : '开销适中'}
                  </span>
                </div>
              </div>

              {/* Right Column: Stacked Provider & Global Pool Sliders */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Slider 2: Provider Concurrency */}
                <div className="by-slider-section">
                  <div className="by-slider-header">
                    <div>
                      <div className="by-slider-title">
                        <Zap size={16} color="var(--by-cyan)" />
                        <span>2. 单邮件服务商并发限制</span>
                        <span className="by-badge by-badge-warning">防风控</span>
                      </div>
                      <div className="by-slider-desc">
                        同服务商域名（如 @qmx.com）同时发起的最大并发连接
                      </div>
                    </div>

                    <div className="by-slider-val-box">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={providerMax}
                        onChange={(e) => setProviderMax(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
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

                {/* Slider 3: Global Concurrency Pool */}
                <div className="by-slider-section">
                  <div className="by-slider-header">
                    <div>
                      <div className="by-slider-title">
                        <Globe size={16} color="var(--by-purple)" />
                        <span>3. 全局最大并发任务池</span>
                        <span className="by-badge by-badge-purple">总吞吐</span>
                      </div>
                      <div className="by-slider-desc">
                        全系统同时执行的 IMAP、POP3、Graph 与 RPA 任务总数
                      </div>
                    </div>

                    <div className="by-slider-val-box">
                      <input
                        type="number"
                        min={10}
                        max={200}
                        value={globalMax}
                        onChange={(e) => setGlobalMax(Math.max(10, Math.min(200, Number(e.target.value) || 10)))}
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

            {/* Timeouts Section Container */}
            <div className="by-timeouts-container">
              <div className="by-section-title-row">
                <div className="by-section-title-left">
                  <Clock size={16} color="var(--by-primary)" />
                  <span>任务超时控制与接口安全策略</span>
                </div>
                <div className="by-section-title-hint">
                  针对不同协议引擎细化配置单任务生命周期与防刷缓存
                </div>
              </div>

              <div className="by-timeouts-grid">
                {/* Card 1: RPA Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-cyan"><Clock size={14} /></div>
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
                  <div className="by-timeout-card-desc">适用 OffiLive / Mail.com 网页端 (建议 60~120s)</div>
                </div>

                {/* Card 2: Standard IMAP Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-primary"><Clock size={14} /></div>
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
                  <div className="by-timeout-card-desc">Socket 直连协议 (建议 15~45s)</div>
                </div>

                {/* Card 3: Batch Job Timeout */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-purple"><Clock size={14} /></div>
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
                  <div className="by-timeout-card-desc">大批量导入排队总保护时限 (建议 180~600s)</div>
                </div>

                {/* Card 4: API Key Cooldown */}
                <div className="by-timeout-card">
                  <div className="by-timeout-card-header">
                    <div className="by-timeout-icon-badge badge-success"><Zap size={14} /></div>
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
                  <div className="by-timeout-card-desc">同 Key 间隔内请求直取缓存 (建议 1000~3000ms)</div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
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

      {/* ================= TAB 2: Proxy Network & Traffic Pool ================= */}
      {activeSubTab === 'proxy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: Master Proxy Control Card */}
          <form onSubmit={handleSaveProxyConfig} className="by-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div className="by-card-title">
                  <Globe size={18} color="var(--by-primary)" />
                  全局代理网络与分层调度控制台 (Master Proxy Control)
                </div>
                <div className="by-card-subtitle">
                  控制 RPA 引擎与 IMAP 双协议的代理池调度。支持直连优先 + 403 智能熔断切代理，省流 90%+ 同时彻底解决风控阻断。
                </div>
              </div>

              {/* Master Power Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={handleToggleGlobalProxy}
                  className={`by-btn ${proxyEnabled ? 'by-btn-success' : 'by-btn-secondary'}`}
                  style={{
                    padding: '8px 18px',
                    fontWeight: 600,
                    borderRadius: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.9rem',
                    boxShadow: proxyEnabled ? '0 0 16px rgba(16, 185, 129, 0.3)' : 'none'
                  }}
                >
                  {proxyEnabled ? (
                    <>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fff', boxShadow: '0 0 8px #fff' }} />
                      <span>🟢 代理网络已开启 (走代理池)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={16} />
                      <span>⚪ 代理网络已关闭 (直连 Direct)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Visual Routing Mode Selection (3 Cards) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--by-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} color="var(--by-primary)" /> 代理分层路由模式 (Smart Routing Strategy)
                </span>
                {proxyConfig?.isDirectCooling && (
                  <span className="by-badge by-badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={11} /> ⏱️ 机房直连处于 403 冷却期 (临时全走代理池)
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {/* Mode 1: direct_first */}
                <div
                  onClick={() => setProxyRoutingMode('direct_first')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1.5px solid ${proxyRoutingMode === 'direct_first' ? 'var(--by-primary)' : 'var(--by-border)'}`,
                    background: proxyRoutingMode === 'direct_first' ? 'var(--by-primary-glow)' : 'var(--by-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: proxyRoutingMode === 'direct_first' ? 'var(--by-primary)' : 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Radio size={14} color={proxyRoutingMode === 'direct_first' ? 'var(--by-primary)' : 'var(--by-text-muted)'} />
                      🌟 直连优先 + 403兜底
                    </span>
                    <span className="by-badge by-badge-success" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>🔥 推荐 · 省流 90%+</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', lineHeight: 1.45 }}>
                    第 1 次抓取首选宿主机房原生 IP 直连（零代理成本）；仅在首轮遭遇 403 阻断时，自动无缝切换代理池清洗 IP 重试。
                  </div>
                </div>

                {/* Mode 2: always */}
                <div
                  onClick={() => setProxyRoutingMode('always')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1.5px solid ${proxyRoutingMode === 'always' ? 'var(--by-primary)' : 'var(--by-border)'}`,
                    background: proxyRoutingMode === 'always' ? 'var(--by-primary-glow)' : 'var(--by-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: proxyRoutingMode === 'always' ? 'var(--by-primary)' : 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Radio size={14} color={proxyRoutingMode === 'always' ? 'var(--by-primary)' : 'var(--by-text-muted)'} />
                      🛡️ 全量代理接管
                    </span>
                    <span className="by-badge by-badge-info" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>高匿名</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', lineHeight: 1.45 }}>
                    所有邮件任务 100% 始终走代理网络池，宿主机机房真实 IP 完全隐藏，适合对 IP 纯净度要求极高的场景。
                  </div>
                </div>

                {/* Mode 3: targeted */}
                <div
                  onClick={() => setProxyRoutingMode('targeted')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1.5px solid ${proxyRoutingMode === 'targeted' ? 'var(--by-primary)' : 'var(--by-border)'}`,
                    background: proxyRoutingMode === 'targeted' ? 'var(--by-primary-glow)' : 'var(--by-bg-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: proxyRoutingMode === 'targeted' ? 'var(--by-primary)' : 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Radio size={14} color={proxyRoutingMode === 'targeted' ? 'var(--by-primary)' : 'var(--by-text-muted)'} />
                      🎯 仅强风控服务商
                    </span>
                    <span className="by-badge by-badge-purple" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>定向加速</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', lineHeight: 1.45 }}>
                    仅针对 @mail.com、@cheerful.com 等强风控服务商启用代理池，通用 IMAP 协议（如 @gmx.com）始终走直连。
                  </div>
                </div>
              </div>
            </div>

            {/* Proxy Control Options Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', background: 'var(--by-bg-secondary)', padding: '16px', borderRadius: '10px' }}>
              {/* Strategy Selector */}
              <div>
                <label className="by-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shuffle size={14} color="var(--by-primary)" /> 多节点调度策略 (Load Balancing)
                </label>
                <select
                  className="by-select"
                  value={proxyStrategy}
                  onChange={(e) => setProxyStrategy(e.target.value as ProxyStrategy)}
                  disabled={savingProxy}
                  style={{ width: '100%', height: '38px' }}
                >
                  <option value="round_robin">🔀 轮询均衡 (Round-Robin) - 依次均匀分配每个节点</option>
                  <option value="latency_first">⚡ 最低延迟优先 (Latency First) - 优先挑选测速最快节点</option>
                  <option value="random">🎲 随机调度 (Random) - 随机分配健康节点</option>
                </select>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginTop: '4px' }}>
                  当配置多个代理时，批量并发任务将按所选策略自动调度分配
                </div>
              </div>

              {/* 403 Failover Rotation */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={proxyFailover}
                    onChange={(e) => setProxyFailover(e.target.checked)}
                    disabled={savingProxy}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--by-primary)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--by-text-primary)' }}>
                    🛡️ 403 阻断自动轮换下一个干净节点 (Failover Rotation)
                  </span>
                </label>
                <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)', marginTop: '4px', marginLeft: '26px' }}>
                  当单次抓取遭遇目标 WAF 403 阻断时，重试会自动排除故障节点并无缝切换至下一个全新代理 IP
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
              <button
                type="submit"
                className="by-btn by-btn-primary"
                disabled={savingProxy}
                style={{ minWidth: '140px' }}
              >
                {savingProxy ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>正在保存...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>保存调度配置</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Section 2: 4-Metric Traffic & Health Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {/* Card 1: Total Bandwidth & Saved Ratio */}
            <div className="by-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--by-text-muted)', fontWeight: 600 }}>代理累计总流量</span>
                <span className="by-badge by-badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Activity size={12} /> 流量池
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--by-text-primary)', fontFamily: 'var(--by-font-mono)' }}>
                {formatBytes(proxySummary?.totalBytes || 0)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>已节省代理流量:</span>
                <span className="by-badge by-badge-success" style={{ fontWeight: 700, padding: '2px 6px', fontSize: '0.74rem' }}>
                  🔥 省流 {proxySummary?.savedRatioPercent || 0}% ({formatBytes(proxySummary?.savedBytesEst || 0)})
                </span>
              </div>
            </div>

            {/* Card 2: Today Bandwidth & Direct Count */}
            <div className="by-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--by-text-muted)', fontWeight: 600 }}>今日消耗流量</span>
                <span className="by-badge by-badge-purple" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> 今日实时
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--by-purple)', fontFamily: 'var(--by-font-mono)' }}>
                {formatBytes(proxySummary?.todayBytes || 0)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>今日直连免流次数:</span>
                <strong style={{ color: 'var(--by-success)' }}>{proxySummary?.directRequests || 0} 次</strong>
              </div>
            </div>

            {/* Card 3: Active & Healthy Nodes */}
            <div className="by-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--by-text-muted)', fontWeight: 600 }}>可用健康节点数</span>
                <span className="by-badge by-badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wifi size={12} /> 节点池
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--by-success)', fontFamily: 'var(--by-font-mono)' }}>
                {proxySummary?.healthyNodes || 0} <span style={{ fontSize: '1rem', color: 'var(--by-text-muted)', fontWeight: 400 }}>/ {proxySummary?.totalNodes || 0} 节点</span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--by-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>平均测速延迟:</span>
                <strong style={{ color: 'var(--by-success)' }}>{proxySummary?.avgLatencyMs ? `${proxySummary.avgLatencyMs}ms` : '--'}</strong>
              </div>
            </div>

            {/* Card 4: Protection Mechanism */}
            <div className="by-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--by-text-muted)', fontWeight: 600 }}>403 故障转移机制</span>
                <span className={`by-badge ${proxyFailover ? 'by-badge-success' : 'by-badge-neutral'}`}>
                  {proxyFailover ? '已启用' : '未开启'}
                </span>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: proxyFailover ? 'var(--by-success)' : 'var(--by-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {proxyFailover ? '🛡️ 自动轮换防护中' : '⚪ 未开启自动轮换'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--by-text-muted)' }}>
                遭遇 403 阻断自动排除脏节点，无缝切换新 IP 重试
              </div>
            </div>
          </div>

          {/* Section 3: Proxy Nodes Table & Operations */}
          <div className="by-card" style={{ padding: '0', overflow: 'hidden' }}>
            {/* Table Top Toolbar */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Network size={18} color="var(--by-primary)" />
                  <span>代理节点池列表 ({proxyNodes.length})</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', marginTop: '2px' }}>
                  支持 HTTP、HTTPS、SOCKS5 协议及账号密码鉴权
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="by-btn by-btn-secondary"
                  onClick={() => handleOpenTrafficModal()}
                  style={{ fontSize: '0.82rem' }}
                >
                  <BarChart2 size={14} /> 查看流量流水
                </button>
                <button
                  type="button"
                  className="by-btn by-btn-secondary"
                  onClick={handleTestAllNodes}
                  disabled={testingAll || proxyNodes.length === 0}
                  style={{ fontSize: '0.82rem' }}
                >
                  <Gauge size={14} className={testingAll ? 'animate-spin' : ''} />
                  {testingAll ? '正在批量测速...' : '⚡ 一键全部测速'}
                </button>
                <button
                  type="button"
                  className="by-btn by-btn-secondary"
                  onClick={() => setShowBatchModal(true)}
                  style={{ fontSize: '0.82rem' }}
                >
                  <FileText size={14} /> 📋 智能批量导入
                </button>
                <button
                  type="button"
                  className="by-btn by-btn-primary"
                  onClick={handleOpenAddNodeModal}
                  style={{ fontSize: '0.82rem' }}
                >
                  <Plus size={14} /> 添加代理节点
                </button>
              </div>
            </div>

            {/* Node Table View */}
            <div className="by-table-wrapper mobile-card-view">
              <table className="by-table">
                <thead>
                  <tr>
                    <th>状态 & 别名</th>
                    <th>协议</th>
                    <th>代理服务器地址</th>
                    <th>测速延迟 & 状态</th>
                    <th>真实出口 IP & 归属地</th>
                    <th>累计流量 / 请求</th>
                    <th>启用状态</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProxy && proxyNodes.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                        <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                        正在载入代理节点池...
                      </td>
                    </tr>
                  ) : proxyNodes.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--by-text-muted)' }}>
                        <Globe size={32} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                        <div>暂未添加任何代理节点</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>点击上方【添加代理节点】或【智能批量导入】快速配置代理池</div>
                      </td>
                    </tr>
                  ) : (
                    proxyNodes.map((node) => {
                      const isTesting = testingNodeId === node.id;
                      const isRevealed = revealedServerIds.has(node.id);
                      return (
                        <tr key={node.id} style={{ opacity: node.isActive ? 1 : 0.6 }}>
                          {/* Name */}
                          <td data-label="节点别名">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: !node.isActive
                                    ? 'var(--by-text-muted)'
                                    : node.lastStatus === 'ok'
                                    ? 'var(--by-success)'
                                    : node.lastStatus === 'error'
                                    ? 'var(--by-danger)'
                                    : 'var(--by-warning)',
                                  boxShadow: node.isActive && node.lastStatus === 'ok' ? '0 0 6px var(--by-success)' : 'none'
                                }}
                              />
                              <span style={{ fontWeight: 600, color: 'var(--by-text-primary)' }}>{node.name}</span>
                            </div>
                          </td>

                          {/* Protocol */}
                          <td data-label="协议">
                            <span className="by-badge by-badge-info" style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                              {node.protocol}
                            </span>
                          </td>

                          {/* Server Address */}
                          <td data-label="代理地址">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--by-font-mono)', fontSize: '0.8rem' }}>
                              <span style={{ wordBreak: 'break-all', color: 'var(--by-text-code)' }}>
                                {maskProxyServer(node.server, isRevealed)}
                              </span>
                              {node.server.includes('@') && (
                                <button
                                  type="button"
                                  className="by-btn-icon"
                                  title={isRevealed ? '隐藏密码' : '显示密码'}
                                  onClick={() => {
                                    setRevealedServerIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(node.id)) next.delete(node.id);
                                      else next.add(node.id);
                                      return next;
                                    });
                                  }}
                                  style={{ padding: '2px' }}
                                >
                                  {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                              )}
                              <button
                                type="button"
                                className="by-btn-icon"
                                title="复制代理地址"
                                onClick={() => {
                                  navigator.clipboard.writeText(node.server);
                                  setStatusMessage({ type: 'success', text: '代理地址已复制到剪贴板' });
                                }}
                                style={{ padding: '2px' }}
                              >
                                <Copy size={13} />
                              </button>
                            </div>
                          </td>

                          {/* Latency & Status */}
                          <td data-label="测速状态">
                            {isTesting ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--by-primary)' }}>
                                <RefreshCw size={12} className="animate-spin" /> 测速中...
                              </span>
                            ) : node.lastStatus === 'ok' ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--by-success)' }}>
                                <CheckCircle2 size={13} /> {node.latencyMs > 0 ? `${node.latencyMs}ms` : '正常'}
                              </span>
                            ) : node.lastStatus === 'error' ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--by-danger)' }} title={node.lastError || '连接失败'}>
                                <AlertCircle size={13} /> 握手失败
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)' }}>未测速</span>
                            )}
                          </td>

                          {/* Exit IP & Region */}
                          <td data-label="出口 IP & 归属地">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600, fontFamily: 'var(--by-font-mono)', fontSize: '0.8rem', color: 'var(--by-text-primary)' }}>
                                {node.exitIp || '--'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Globe size={11} /> {node.exitRegion || '未知地区'}
                              </span>
                            </div>
                          </td>

                          {/* Traffic & Requests */}
                          <td data-label="累计流量">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 700, fontFamily: 'var(--by-font-mono)', fontSize: '0.84rem', color: 'var(--by-primary)' }}>
                                {formatBytes(node.totalBytes)}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--by-text-muted)' }}>
                                {node.totalRequests} 次请求 (成功率 {node.totalRequests > 0 ? `${Math.round((node.successRequests / node.totalRequests) * 100)}%` : '--'})
                              </span>
                            </div>
                          </td>

                          {/* Active Toggle Switch */}
                          <td data-label="启用状态">
                            <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={node.isActive}
                                onChange={() => handleToggleNodeActive(node)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: node.isActive ? 'var(--by-success)' : 'var(--by-border)',
                                  borderRadius: '20px',
                                  transition: '0.2s'
                                }}
                              />
                              <span
                                style={{
                                  position: 'absolute',
                                  height: '14px',
                                  width: '14px',
                                  left: node.isActive ? '20px' : '4px',
                                  bottom: '3px',
                                  backgroundColor: '#fff',
                                  borderRadius: '50%',
                                  transition: '0.2s'
                                }}
                              />
                            </label>
                          </td>

                          {/* Actions */}
                          <td data-label="操作" style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="by-btn-icon"
                                title="单节点测速"
                                onClick={() => handleTestSingleNode(node.id)}
                                disabled={isTesting || testingAll}
                                style={{ color: 'var(--by-primary)', padding: '6px' }}
                              >
                                <Gauge size={15} className={isTesting ? 'animate-spin' : ''} />
                              </button>
                              <button
                                type="button"
                                className="by-btn-icon"
                                title="编辑节点"
                                onClick={() => handleOpenEditNodeModal(node)}
                                style={{ color: 'var(--by-text-secondary)', padding: '6px' }}
                              >
                                <Sliders size={15} />
                              </button>
                              <button
                                type="button"
                                className="by-btn-icon"
                                title="删除节点"
                                onClick={() => setNodeToDelete(node)}
                                style={{ color: 'var(--by-danger)', padding: '6px' }}
                              >
                                <Trash2 size={15} />
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
          </div>
        </div>
      )}

      {/* ================= TAB 3: Security & 2FA & Password ================= */}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--by-bg-secondary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: user.twoFactorEnabled ? 'var(--by-success-bg)' : 'var(--by-warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: user.twoFactorEnabled ? 'var(--by-success)' : 'var(--by-warning)' }}>
                    <Lock size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--by-text-primary)' }}>
                      两步验证当前状态
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)' }}>
                      {user.twoFactorEnabled ? '已开启强密码保护' : '未开启，建议启用提升管理安全性'}
                    </div>
                  </div>
                </div>

                <span className={`by-badge ${user.twoFactorEnabled ? 'by-badge-success' : 'by-badge-warning'}`}>
                  {user.twoFactorEnabled ? '已开启保护' : '未开启'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                {user.twoFactorEnabled ? (
                  <button type="button" className="by-btn by-btn-danger" onClick={() => { setDisableCode(''); setDisableError(null); setShowDisableModal(true); }}>
                    关闭 2FA 两步验证
                  </button>
                ) : (
                  <button type="button" className="by-btn by-btn-primary" onClick={handleStart2FASetup} disabled={twoFaLoading}>
                    <QrCode size={15} /> {twoFaLoading ? '正在初始化...' : '立即启用 2FA 保护'}
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
                  <KeyRound size={18} color="var(--by-primary)" /> 修改管理员登录密码
                </div>
                <div className="by-card-subtitle">
                  定期更新管理中枢密码，采用 PBKDF2/Scrypt 加密哈希隔离
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              {pwdError && (
                <div style={{ padding: '10px 14px', background: 'var(--by-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '6px', color: 'var(--by-danger)', fontSize: '0.84rem' }}>
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div style={{ padding: '10px 14px', background: 'var(--by-success-bg)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', color: 'var(--by-success)', fontSize: '0.84rem' }}>
                  {pwdSuccess}
                </div>
              )}

              <div className="by-input-group">
                <label className="by-label">当前原密码</label>
                <input
                  type="password"
                  className="by-input"
                  placeholder="输入当前使用的管理密码"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
              </div>

              <div className="by-input-group">
                <label className="by-label">设置新密码</label>
                <input
                  type="password"
                  className="by-input"
                  placeholder="至少 8 位，需包含大小写字母与数字"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="by-input-group">
                <label className="by-label">确认新密码</label>
                <input
                  type="password"
                  className="by-input"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button type="submit" className="by-btn by-btn-primary" disabled={pwdLoading}>
                  {pwdLoading ? '正在修改...' : '更新密码'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 4: IP Block Management ================= */}
      {activeSubTab === 'ip_bans' && (
        <div className="by-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--by-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ban size={18} color="var(--by-danger)" />
                <span>系统 IP 访问限制名单 ({blockedIps.length})</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--by-text-secondary)', marginTop: '2px' }}>
                被封禁的客户端 IP 将在网关层秒级拦截，彻底阻断其对 API 与中枢的一切探测
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="by-btn by-btn-secondary" onClick={fetchBlockedIps} disabled={loadingIps}>
                <RefreshCw size={14} className={loadingIps ? 'animate-spin' : ''} /> 刷新
              </button>
              <button type="button" className="by-btn by-btn-danger" onClick={() => setShowAddIpModal(true)}>
                <Plus size={14} /> 手动限制 IP
              </button>
            </div>
          </div>

          {/* Blocked IP Table */}
          <div className="by-table-wrapper mobile-card-view">
            <table className="by-table">
              <thead>
                <tr>
                  <th>封禁 IP 地址</th>
                  <th>限制原因</th>
                  <th>封禁时长</th>
                  <th>封禁时间</th>
                  <th>状态</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loadingIps && blockedIps.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-secondary)' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                      正在载入黑名单...
                    </td>
                  </tr>
                ) : blockedIps.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--by-text-muted)' }}>
                      暂无任何被限制的 IP 记录，系统运行良好
                    </td>
                  </tr>
                ) : (
                  blockedIps.map((item) => (
                    <tr key={item.id}>
                      <td data-label="封禁 IP">
                        <span style={{ fontWeight: 600, fontFamily: 'var(--by-font-mono)', color: 'var(--by-danger)' }}>
                          {item.ip}
                        </span>
                      </td>
                      <td data-label="限制原因">
                        <span style={{ fontSize: '0.84rem' }}>{item.reason}</span>
                      </td>
                      <td data-label="封禁时长">
                        <span className="by-badge by-badge-neutral" style={{ fontSize: '0.76rem' }}>
                          {item.durationHours === 0 ? '永久封禁' : `${item.durationHours} 小时`}
                        </span>
                      </td>
                      <td data-label="封禁时间">
                        <span style={{ fontSize: '0.82rem', color: 'var(--by-text-muted)' }}>
                          {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      </td>
                      <td data-label="状态">
                        <span className="by-badge by-badge-danger">生效中 (已拦截)</span>
                      </td>
                      <td data-label="操作" style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="by-btn by-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => setIpToUnblock(item)}
                        >
                          解除限制
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Add / Edit Proxy Node Modal */}
      {showAddNodeModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '560px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="var(--by-primary)" />
                {editingNode ? '编辑代理节点' : '添加代理节点'}
              </div>
              <button className="by-btn-icon" onClick={() => setShowAddNodeModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNodeSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {nodeFormError && (
                  <div style={{ padding: '10px 14px', background: 'var(--by-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '6px', color: 'var(--by-danger)', fontSize: '0.84rem' }}>
                    {nodeFormError}
                  </div>
                )}

                {/* Mode Switcher: Structured Fields vs Raw URL */}
                <div className="by-segmented-tabs" style={{ width: '100%' }}>
                  <button
                    type="button"
                    className={`by-segmented-tab ${nodeInputMode === 'structured' ? 'active' : ''}`}
                    onClick={() => {
                      if (nodeServer.trim() && !nodeHost.trim()) {
                        try {
                          const url = new URL(nodeServer.trim());
                          setNodeHost(url.hostname);
                          setNodePort(url.port || '');
                          setNodeUser(decodeURIComponent(url.username || ''));
                          setNodePass(decodeURIComponent(url.password || ''));
                        } catch {}
                      }
                      setNodeInputMode('structured');
                    }}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Sliders size={13} />
                    <span>📝 分项填写 (主机/端口/账号/密码)</span>
                  </button>
                  <button
                    type="button"
                    className={`by-segmented-tab ${nodeInputMode === 'raw' ? 'active' : ''}`}
                    onClick={() => {
                      const computed = buildStructuredServerUrl(nodeProtocol, nodeHost, nodePort, nodeUser, nodePass);
                      if (computed) setNodeServer(computed);
                      setNodeInputMode('raw');
                    }}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Globe size={13} />
                    <span>🔗 单行快速粘贴 (URL/正则)</span>
                  </button>
                </div>

                <div className="by-input-group">
                  <label className="by-label">节点别名 (可选)</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如：美国住宅 01、香港机房 HK-02 (留空自动生成)"
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    style={{ height: '38px' }}
                  />
                </div>

                {/* MODE 1: Structured Fields (Host, Port, User, Pass) */}
                {nodeInputMode === 'structured' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                      <div className="by-input-group">
                        <label className="by-label">主机 / 域名 / IP (必填)</label>
                        <input
                          type="text"
                          className="by-input"
                          placeholder="如：usvip.arxlabs.io 或 192.168.1.1"
                          value={nodeHost}
                          onChange={(e) => setNodeHost(e.target.value)}
                          required
                          style={{ height: '38px', fontFamily: 'var(--by-font-mono)' }}
                        />
                      </div>
                      <div className="by-input-group">
                        <label className="by-label">端口 (Port)</label>
                        <input
                          type="text"
                          className="by-input"
                          placeholder="如：3010"
                          value={nodePort}
                          onChange={(e) => setNodePort(e.target.value)}
                          required
                          style={{ height: '38px', fontFamily: 'var(--by-font-mono)' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="by-input-group">
                        <label className="by-label">用户名 (Username，选填)</label>
                        <input
                          type="text"
                          className="by-input"
                          placeholder="如：woceshi111-region-xxx"
                          value={nodeUser}
                          onChange={(e) => setNodeUser(e.target.value)}
                          style={{ height: '38px', fontFamily: 'var(--by-font-mono)' }}
                        />
                      </div>
                      <div className="by-input-group">
                        <label className="by-label">密码 (Password，选填)</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showNodePassword ? 'text' : 'password'}
                            className="by-input"
                            placeholder="真实明文密码（请勿复制小圆点 •）"
                            value={nodePass}
                            onChange={(e) => setNodePass(e.target.value)}
                            style={{ height: '38px', paddingRight: '36px', fontFamily: 'var(--by-font-mono)' }}
                          />
                          <button
                            type="button"
                            className="by-btn-icon"
                            title={showNodePassword ? '隐藏密码' : '显示密码'}
                            onClick={() => setShowNodePassword(!showNodePassword)}
                            style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', padding: '4px' }}
                          >
                            {showNodePassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* MODE 2: Raw URL input */}
                {nodeInputMode === 'raw' && (
                  <div className="by-input-group">
                    <label className="by-label">代理服务器地址 (必填)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                      <input
                        type="text"
                        className="by-input"
                        placeholder="http://user:pass@1.2.3.4:8080 或 1.2.3.4:8080:user:pass"
                        value={nodeServer}
                        onChange={(e) => setNodeServer(e.target.value)}
                        required
                        style={{ flex: 1, height: '38px', fontFamily: 'var(--by-font-mono)' }}
                      />
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--by-text-muted)', marginTop: '4px' }}>
                      支持格式：`http://ip:port`、`socks5://ip:port`、`ip:port:user:pass` 等
                    </div>
                  </div>
                )}

                {/* Protocol & Weight */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="by-input-group">
                    <label className="by-label">协议类型</label>
                    <select
                      className="by-select"
                      value={nodeProtocol}
                      onChange={(e) => setNodeProtocol(e.target.value as ProxyProtocol)}
                      style={{ width: '100%', height: '38px' }}
                    >
                      <option value="http">HTTP / HTTPS 隧道代理</option>
                      <option value="socks5">SOCKS5 代理</option>
                    </select>
                  </div>

                  <div className="by-input-group">
                    <label className="by-label">权重 (1~100)</label>
                    <input
                      type="number"
                      className="by-input"
                      min={1}
                      max={100}
                      value={nodeWeight}
                      onChange={(e) => setNodeWeight(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      style={{ width: '100%', height: '38px' }}
                    />
                  </div>
                </div>

                {/* Realtime Address Preview & Test Button */}
                <div style={{ padding: '10px 14px', background: 'var(--by-bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', fontFamily: 'var(--by-font-mono)', color: 'var(--by-text-code)', flex: 1 }}>
                    <span style={{ color: 'var(--by-text-muted)' }}>合成地址: </span>
                    {nodeInputMode === 'structured'
                      ? maskProxyServer(buildStructuredServerUrl(nodeProtocol, nodeHost, nodePort, nodeUser, nodePass), false) || '请填写主机与端口'
                      : maskProxyServer(nodeServer, false) || '请填入代理地址'}
                  </div>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary"
                    onClick={handleTestInModal}
                    disabled={nodeTesting || (nodeInputMode === 'structured' ? !nodeHost.trim() : !nodeServer.trim())}
                    style={{ padding: '0 12px', fontSize: '0.78rem', height: '32px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {nodeTesting ? <RefreshCw size={13} className="animate-spin" /> : <Gauge size={13} />}
                    <span>{nodeTesting ? '测速中' : '测速验证'}</span>
                  </button>
                </div>

                {/* Inline Test Result Feedback */}
                {nodeTestResult && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: nodeTestResult.success ? 'var(--by-success-bg)' : 'var(--by-danger-bg)',
                      border: `1px solid ${nodeTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      {nodeTestResult.success ? (
                        <strong style={{ color: 'var(--by-success)' }}>🟢 测速连通成功！握手延迟: {nodeTestResult.latencyMs}ms</strong>
                      ) : (
                        <strong style={{ color: 'var(--by-danger)' }}>🔴 握手失败: {nodeTestResult.error || '无法建立连接'}</strong>
                      )}
                    </span>
                    {nodeTestResult.exitRegion && (
                      <span style={{ color: 'var(--by-text-muted)', fontSize: '0.76rem' }}>
                        出口: {nodeTestResult.exitRegion}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={nodeActive}
                      onChange={(e) => setNodeActive(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--by-primary)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>立即启用此代理节点</span>
                  </label>
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowAddNodeModal(false)}>
                  取消
                </button>
                <button
                  type="submit"
                  className="by-btn by-btn-primary"
                  disabled={nodeFormSaving || (nodeInputMode === 'structured' ? !nodeHost.trim() : !nodeServer.trim())}
                >
                  {nodeFormSaving ? '正在保存...' : editingNode ? '更新节点' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Import Proxy Nodes Modal */}
      {showBatchModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '640px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--by-primary)" /> 📋 智能多格式批量导入代理
              </div>
              <button className="by-btn-icon" onClick={() => setShowBatchModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBatchImportSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--by-text-secondary)', lineHeight: 1.5, background: 'var(--by-bg-secondary)', padding: '12px', borderRadius: '8px' }}>
                  <strong>💡 智能容错支持（每行一个代理）：</strong>
                  <ul style={{ paddingLeft: '18px', margin: '6px 0 0 0', display: 'flex', flexDirection: 'column', gap: '3px', fontFamily: 'var(--by-font-mono)', fontSize: '0.76rem' }}>
                    <li>1. <code>192.168.1.100:8080:username:password</code></li>
                    <li>2. <code>http://username:password@192.168.1.100:8080</code></li>
                    <li>3. <code>socks5://username:password@192.168.1.100:1080</code></li>
                    <li>4. <code>192.168.1.100:8080</code> (纯 IP 端口)</li>
                  </ul>
                </div>

                <div className="by-input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="by-label" style={{ margin: 0 }}>粘贴代理列表文本</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)' }}>默认协议:</span>
                      <select
                        className="by-select"
                        value={batchDefaultProtocol}
                        onChange={(e) => setBatchDefaultProtocol(e.target.value as ProxyProtocol)}
                        style={{ padding: '0 24px 0 8px', fontSize: '0.78rem', height: '28px' }}
                      >
                        <option value="http">HTTP 隧道</option>
                        <option value="socks5">SOCKS5</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    className="by-input"
                    rows={8}
                    placeholder={`195.114.193.20:8080:user:pass\n171.213.253.237:8080\nsocks5://user:pass@212.107.30.67:1080`}
                    value={batchRawText}
                    onChange={(e) => setBatchRawText(e.target.value)}
                    required
                    style={{ fontFamily: 'var(--by-font-mono)', fontSize: '0.82rem', resize: 'vertical', height: 'auto', minHeight: '140px', padding: '8px 12px' }}
                  />
                </div>

                {batchResult && (
                  <div style={{ padding: '12px', borderRadius: '8px', background: batchResult.errors.length > 0 ? 'var(--by-danger-bg)' : 'var(--by-success-bg)', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600, color: batchResult.errors.length > 0 ? 'var(--by-danger)' : 'var(--by-success)' }}>
                      成功导入 {batchResult.imported} 个节点
                      {batchResult.errors.length > 0 ? `，${batchResult.errors.length} 行解析异常：` : ''}
                    </div>
                    {batchResult.errors.length > 0 && (
                      <div style={{ maxHeight: '80px', overflowY: 'auto', marginTop: '6px', fontSize: '0.76rem', color: 'var(--by-danger)' }}>
                        {batchResult.errors.map((e, idx) => (
                          <div key={idx}>• {e}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowBatchModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-primary" disabled={batchImportLoading || !batchRawText.trim()}>
                  {batchImportLoading ? '正在解析导入...' : '确认批量导入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Traffic Logs Modal */}
      {showTrafficModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '880px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={18} color="var(--by-primary)" /> 📊 代理流量消耗与请求流水
              </div>
              <button className="by-btn-icon" onClick={() => setShowTrafficModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="by-modal-body" style={{ padding: '0' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--by-bg-secondary)' }}>
                <div style={{ fontSize: '0.84rem', color: 'var(--by-text-secondary)' }}>
                  共记录 <strong>{trafficTotal}</strong> 次代理请求流水
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="by-select"
                    value={trafficFilterNodeId}
                    onChange={(e) => {
                      setTrafficFilterNodeId(e.target.value);
                      fetchTrafficLogs(1, e.target.value);
                    }}
                    style={{ padding: '0 28px 0 10px', fontSize: '0.82rem', height: '34px' }}
                  >
                    <option value="">全部代理节点</option>
                    {proxyNodes.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="by-btn by-btn-secondary"
                    onClick={() => fetchTrafficLogs(trafficPage, trafficFilterNodeId)}
                    style={{ padding: '0 12px', fontSize: '0.82rem', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={13} className={trafficLoading ? 'animate-spin' : ''} />
                    <span>刷新</span>
                  </button>
                </div>
              </div>

              <div className="by-table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="by-table">
                  <thead>
                    <tr>
                      <th>请求时间</th>
                      <th>代理节点</th>
                      <th>目标账号</th>
                      <th>流量消耗</th>
                      <th>耗时</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficLoading && trafficLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--by-text-muted)' }}>
                          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px auto' }} />
                          加载流量流水中...
                        </td>
                      </tr>
                    ) : trafficLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--by-text-muted)' }}>
                          暂无代理流量流水记录
                        </td>
                      </tr>
                    ) : (
                      trafficLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--by-text-secondary)' }}>
                            {new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--by-text-primary)' }}>{log.proxyName}</span>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'var(--by-font-mono)', fontSize: '0.8rem', color: 'var(--by-text-code)' }}>
                              {log.emailAccount || '--'}
                            </span>
                          </td>
                          <td>
                            <strong style={{ fontFamily: 'var(--by-font-mono)', fontSize: '0.84rem', color: 'var(--by-primary)' }}>
                              {formatBytes(log.totalBytes)}
                            </strong>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--by-text-muted)' }}>
                            {(log.durationMs / 1000).toFixed(1)}s
                          </td>
                          <td>
                            <span className={`by-badge ${log.status === 'success' || log.status === 'completed' || log.status === 'no_code' ? 'by-badge-success' : 'by-badge-danger'}`} style={{ fontSize: '0.72rem' }}>
                              {log.status === 'success' || log.status === 'completed' || log.status === 'no_code' ? '正常' : '阻断/异常'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {trafficTotal > trafficPageSize && (
                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--by-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--by-text-muted)' }}>
                    第 {trafficPage} 页 / 共 {Math.ceil(trafficTotal / trafficPageSize)} 页
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="by-btn by-btn-secondary"
                      disabled={trafficPage <= 1 || trafficLoading}
                      onClick={() => fetchTrafficLogs(trafficPage - 1, trafficFilterNodeId)}
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      className="by-btn by-btn-secondary"
                      disabled={trafficPage >= Math.ceil(trafficTotal / trafficPageSize) || trafficLoading}
                      onClick={() => fetchTrafficLogs(trafficPage + 1, trafficFilterNodeId)}
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="by-modal-footer">
              <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowTrafficModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Proxy Node Confirm Modal */}
      <ConfirmModal
        isOpen={Boolean(nodeToDelete)}
        title="删除代理节点？"
        message={`确定要删除代理节点【${nodeToDelete?.name}】(${nodeToDelete?.server}) 吗？删除后该节点将不再参与自动轮询。`}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleConfirmDeleteNode}
        onClose={() => setNodeToDelete(null)}
      />

      {/* Reset System Settings Confirm Modal */}
      <ConfirmModal
        isOpen={showResetModal}
        title="恢复默认并发与调度配置？"
        message="确定要将所有无头浏览器 RPA 并发限制、单域名并发池及超时时限恢复为出厂标准配置吗？"
        confirmText="确认恢复默认"
        cancelText="取消"
        variant="warning"
        loading={savingSystem}
        onConfirm={async () => {
          setSavingSystem(true);
          setShowResetModal(false);
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
            setStatusMessage({ type: 'success', text: res.message });
          } catch (err: any) {
            setStatusMessage({ type: 'error', text: err.message || '重置失败' });
          } finally {
            setSavingSystem(false);
          }
        }}
        onClose={() => setShowResetModal(false)}
      />

      {/* Add IP Block Modal */}
      {showAddIpModal && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '440px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ban size={18} color="var(--by-danger)" /> 添加 IP 访问限制
              </div>
              <button className="by-btn-icon" onClick={() => setShowAddIpModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddIpSubmit}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {addIpError && (
                  <div style={{ padding: '10px 14px', background: 'var(--by-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '6px', color: 'var(--by-danger)', fontSize: '0.84rem' }}>
                    {addIpError}
                  </div>
                )}

                <div className="by-input-group">
                  <label className="by-label">客户端 IPv4 / IPv6 地址</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如：212.107.30.67"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    required
                    style={{ fontFamily: 'var(--by-font-mono)' }}
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">封禁原因 / 违规说明</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="如：超高频恶意批量抓取、撞库探测"
                    value={newIpReason}
                    onChange={(e) => setNewIpReason(e.target.value)}
                  />
                </div>

                <div className="by-input-group">
                  <label className="by-label">封禁限制时长</label>
                  <select
                    className="by-select"
                    value={newIpDuration}
                    onChange={(e) => setNewIpDuration(e.target.value)}
                  >
                    <option value="0">永久封禁 (手动解封)</option>
                    <option value="1">1 小时 (临时惩罚)</option>
                    <option value="6">6 小时</option>
                    <option value="24">24 小时 (1 天)</option>
                    <option value="72">72 小时 (3 天)</option>
                    <option value="168">168 小时 (7 天)</option>
                  </select>
                </div>
              </div>

              <div className="by-modal-footer">
                <button type="button" className="by-btn by-btn-secondary" onClick={() => setShowAddIpModal(false)}>
                  取消
                </button>
                <button type="submit" className="by-btn by-btn-danger" disabled={addIpLoading || !newIp.trim()}>
                  {addIpLoading ? '正在限制...' : '确认立即限制'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enable 2FA Setup Modal */}
      {show2FAModal && twoFaSetupData && (
        <div className="by-modal-overlay">
          <div className="by-modal" style={{ maxWidth: '460px' }}>
            <div className="by-modal-header">
              <div className="by-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--by-primary)" /> 激活 2FA 双因素安全保护
              </div>
              <button className="by-btn-icon" onClick={() => setShow2FAModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmEnable2FA}>
              <div className="by-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '0.86rem', color: 'var(--by-text-secondary)' }}>
                  1. 使用 Google Authenticator、1Password 或 Microsoft Authenticator 扫描下方二维码：
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '16px',
                    background: '#fff',
                    borderRadius: '12px',
                    width: 'fit-content',
                    margin: '0 auto',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                  }}
                  dangerouslySetInnerHTML={{ __html: twoFaSetupData.qrSvg }}
                />

                <div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--by-text-secondary)', marginBottom: '6px' }}>
                    或手动在 App 中添加密钥（点击复制）：
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--by-bg-secondary)',
                      borderRadius: '6px',
                      fontFamily: 'var(--by-font-mono)',
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      navigator.clipboard.writeText(twoFaSetupData.secret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                  >
                    <span>{twoFaSetupData.secret}</span>
                    {copiedSecret ? <Check size={14} color="var(--by-success)" /> : <Copy size={14} color="var(--by-text-muted)" />}
                  </div>
                </div>

                <div className="by-input-group">
                  <label className="by-label">2. 输入 App 中生成的 6 位动态验证码</label>
                  <input
                    type="text"
                    className="by-input"
                    placeholder="000000"
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
