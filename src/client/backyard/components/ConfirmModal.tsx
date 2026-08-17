import React from 'react';
import { AlertTriangle, Trash2, ShieldAlert, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose
}) => {
  if (!isOpen) return null;

  const renderIcon = () => {
    switch (variant) {
      case 'danger':
        return <Trash2 size={22} color="var(--by-danger)" />;
      case 'warning':
        return <AlertTriangle size={22} color="var(--by-warning)" />;
      default:
        return <ShieldAlert size={22} color="var(--by-primary)" />;
    }
  };

  const getConfirmBtnClass = () => {
    switch (variant) {
      case 'danger':
        return 'by-btn by-btn-danger';
      case 'warning':
        return 'by-btn by-btn-primary';
      default:
        return 'by-btn by-btn-primary';
    }
  };

  return (
    <div className="by-modal-overlay" style={{ animation: 'fadeIn 0.15s ease' }}>
      <div className="by-modal" style={{ maxWidth: '440px', padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: variant === 'danger' ? 'var(--by-danger-bg)' : 'var(--by-warning-bg)',
            border: `1px solid ${variant === 'danger' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {renderIcon()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--by-text-primary)' }}>
              {title}
            </h3>
            <div style={{ marginTop: '8px', fontSize: '0.86rem', color: 'var(--by-text-secondary)', lineHeight: 1.5 }}>
              {message}
            </div>
          </div>

          <button
            className="by-btn-icon"
            onClick={onClose}
            disabled={loading}
            style={{ marginTop: '-4px', marginRight: '-4px' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="by-modal-footer" style={{ padding: '14px 24px', background: 'var(--by-bg-input)' }}>
          <button
            type="button"
            className="by-btn by-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={getConfirmBtnClass()}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '正在处理...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
