import React from 'react';
import { Calendar, X } from 'lucide-react';
import { getDateRangePreset, type DatePreset } from '../../../shared/format-utils';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  activePreset?: DatePreset | 'custom' | null;
  onChange: (startDate: string, endDate: string, preset?: DatePreset | 'custom' | null) => void;
  compact?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  startDate,
  endDate,
  activePreset,
  onChange,
  compact = false
}) => {
  const handlePresetClick = (preset: DatePreset) => {
    const range = getDateRangePreset(preset);
    onChange(range.startDate, range.endDate, preset);
  };

  const handleStartDateChange = (val: string) => {
    onChange(val, endDate, 'custom');
  };

  const handleEndDateChange = (val: string) => {
    onChange(startDate, val, 'custom');
  };

  const handleClear = () => {
    onChange('', '', null);
  };

  const hasFilter = Boolean(startDate || endDate);

  return (
    <div className={`by-date-filter-container ${compact ? 'compact' : ''}`}>
      {/* Quick Preset Pills */}
      <div className="by-date-preset-pills">
        <button
          type="button"
          className={`by-date-pill ${activePreset === 'today' ? 'active' : ''}`}
          onClick={() => handlePresetClick('today')}
        >
          今天
        </button>
        <button
          type="button"
          className={`by-date-pill ${activePreset === '24h' ? 'active' : ''}`}
          onClick={() => handlePresetClick('24h')}
        >
          近24小时
        </button>
        <button
          type="button"
          className={`by-date-pill ${activePreset === '7d' ? 'active' : ''}`}
          onClick={() => handlePresetClick('7d')}
        >
          近7天
        </button>
        <button
          type="button"
          className={`by-date-pill ${activePreset === '30d' ? 'active' : ''}`}
          onClick={() => handlePresetClick('30d')}
        >
          近30天
        </button>
      </div>

      {/* Date Pickers */}
      <div className="by-date-inputs">
        <Calendar
          size={13}
          className="by-date-icon"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            try {
              (document.getElementById('by-date-start') as any)?.showPicker?.();
            } catch {}
          }}
        />
        <input
          id="by-date-start"
          type="date"
          className="by-date-input"
          value={startDate}
          placeholder="开始日期"
          onClick={(e) => {
            try {
              (e.currentTarget as any).showPicker?.();
            } catch {}
          }}
          onFocus={(e) => {
            try {
              (e.currentTarget as any).showPicker?.();
            } catch {}
          }}
          onChange={(e) => handleStartDateChange(e.target.value)}
        />
        <span className="by-date-sep">至</span>
        <input
          id="by-date-end"
          type="date"
          className="by-date-input"
          value={endDate}
          placeholder="结束日期"
          onClick={(e) => {
            try {
              (e.currentTarget as any).showPicker?.();
            } catch {}
          }}
          onFocus={(e) => {
            try {
              (e.currentTarget as any).showPicker?.();
            } catch {}
          }}
          onChange={(e) => handleEndDateChange(e.target.value)}
        />
        {hasFilter && (
          <button
            type="button"
            className="by-date-clear-btn"
            title="清空日期筛选"
            onClick={handleClear}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
