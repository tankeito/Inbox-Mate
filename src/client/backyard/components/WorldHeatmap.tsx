import React, { useState, useMemo, useRef, useCallback } from 'react';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import worldAtlasData from 'world-atlas/countries-110m.json';
import { getCountryByNumericOrCode } from '../utils/country-codes';
import { Globe, ZoomIn, ZoomOut, RotateCcw, Activity, Users } from 'lucide-react';
import type { WorldMapStat } from '../types';

interface WorldHeatmapProps {
  worldMapData?: Record<string, WorldMapStat>;
  totalRequests?: number;
  loading?: boolean;
}

interface CountryFeature {
  id: string;
  type: string;
  geometry: any;
  properties: any;
}

const WIDTH = 960;
const HEIGHT = 480;

/**
 * Multi-tier Fallback Country Identifier & Name Resolution
 */
function resolveCountryDetails(c: CountryFeature) {
  // 1. Multi-tier resolution against ISO dictionary
  const meta =
    getCountryByNumericOrCode(c.id) ||
    getCountryByNumericOrCode(c.properties?.iso_n3) ||
    getCountryByNumericOrCode(c.properties?.iso_a2) ||
    getCountryByNumericOrCode(c.properties?.name);

  if (meta) {
    return {
      name: `${meta.nameEn} (${meta.nameZh})`,
      flag: meta.flag,
      code: meta.code
    };
  }

  // 2. TopoJSON feature property fallback
  if (c.properties?.name) {
    return {
      name: c.properties.name,
      flag: '🌐',
      code: String(c.id)
    };
  }

  // 3. Fallback: Never display raw '#148' to user
  return {
    name: '未知地区 (Unknown Region)',
    flag: '🌐',
    code: String(c.id)
  };
}

export const WorldHeatmap: React.FC<WorldHeatmapProps> = ({
  worldMapData = {},
  totalRequests = 0,
  loading = false
}) => {
  const [metric, setMetric] = useState<'requests' | 'ips'>('requests');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Hover Tooltip State
  const [hoveredCountry, setHoveredCountry] = useState<{
    name: string;
    flag: string;
    code: string;
    requests: number;
    ips: number;
    percentage: number;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Generate GeoJSON features from TopoJSON
  const { countries, pathGenerator } = useMemo(() => {
    const geojson = feature(worldAtlasData as any, (worldAtlasData as any).objects.countries) as any;
    const projection = geoNaturalEarth1()
      .scale(153)
      .translate([WIDTH / 2, HEIGHT / 2 + 10]);

    const generator = geoPath().projection(projection);
    return {
      countries: geojson.features as CountryFeature[],
      pathGenerator: generator
    };
  }, []);

  // 2. Max Value calculation for choropleth mapping
  const { maxVal, totalPeriodRequests } = useMemo(() => {
    const values = Object.values(worldMapData).map((s) => (metric === 'requests' ? s.count : s.uniqueIps));
    const max = Math.max(...values, 1);
    const total = Object.values(worldMapData).reduce((acc, s) => acc + s.count, 0) || totalRequests;
    return { maxVal: max, totalPeriodRequests: total };
  }, [worldMapData, metric, totalRequests]);

  // 3. Cloudflare Blue Color Mapping with Multi-tier Match
  const getCountryFill = useCallback(
    (c: CountryFeature) => {
      const details = resolveCountryDetails(c);
      const stat = worldMapData[details.code] || worldMapData[String(c.id)];

      if (!stat || stat.count === 0) {
        return '#cbd5e1'; // Cloudflare Base Inactive Landmass Gray
      }

      const val = metric === 'requests' ? stat.count : stat.uniqueIps;
      const ratio = val / maxVal;

      // Cloudflare Step Palette: #bfdbfe -> #60a5fa -> #2563eb -> #1d4ed8
      if (ratio > 0.75) return '#1d4ed8'; // Deep Royal Blue
      if (ratio > 0.45) return '#2563eb'; // Vivid Cloudflare Blue
      if (ratio > 0.2) return '#60a5fa';  // Medium Sky Blue
      return '#bfdbfe';                   // Light Pastel Blue
    },
    [worldMapData, metric, maxVal]
  );

  // Pan & Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary mouse button
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(3.5, Number((z + 0.35).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.8, Number((z - 0.35).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Touch Support for Mobile
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setPan({
        x: e.touches[0].clientX - touchStartRef.current.x,
        y: e.touches[0].clientY - touchStartRef.current.y
      });
    }
  };

  return (
    <div className="by-card by-map-card" style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
      {/* Header & Controls */}
      <div
        className="by-card-header"
        style={{
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div>
          <div className="by-card-title" style={{ fontSize: '0.96rem' }}>
            <Globe size={16} color="var(--by-primary)" /> 全球访问分布热力图 (World Heatmap)
          </div>
          <div className="by-card-subtitle">
            Cloudflare 真实国家地理热力图，悬停可查看 200+ 国家与地区访问量
          </div>
        </div>

        {/* Metric Selector Toggle */}
        <div className="by-map-controls">
          <button
            type="button"
            className={`by-btn by-btn-sm ${metric === 'requests' ? 'by-btn-primary' : 'by-btn-secondary'}`}
            onClick={() => setMetric('requests')}
            style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Activity size={12} /> 按请求次数
          </button>
          <button
            type="button"
            className={`by-btn by-btn-sm ${metric === 'ips' ? 'by-btn-primary' : 'by-btn-secondary'}`}
            onClick={() => setMetric('ips')}
            style={{ fontSize: '0.74rem', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Users size={12} /> 按独立 IP 数
          </button>
        </div>
      </div>

      {/* Cloudflare Style White Ocean Canvas */}
      <div
        ref={containerRef}
        className="by-world-map-wrapper"
        style={{
          backgroundColor: '#ffffff',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
          userSelect: 'none',
          overflow: 'hidden'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          setHoveredCountry(null);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {/* Loading Skeleton */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255, 255, 255, 0.75)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div className="by-spinner" style={{ width: '24px', height: '24px' }} />
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                加载全球地理热力中...
              </span>
            </div>
          </div>
        )}

        {/* Zoom & Reset Toolbar (Top-Right) */}
        <div className="by-map-zoom-btns">
          <button
            type="button"
            className="by-map-zoom-btn"
            onClick={handleZoomIn}
            title="放大地图 (Zoom In)"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="by-map-zoom-btn"
            onClick={handleZoomOut}
            title="缩小地图 (Zoom Out)"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="by-map-zoom-btn"
            onClick={handleResetZoom}
            title="重置视图 (Reset)"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        {/* SVG World Map */}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="by-world-svg"
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            width: '100%',
            height: '100%'
          }}
        >
          {/* Background Ocean Rect */}
          <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />

          {/* 200+ Sovereign Countries Polygons from TopoJSON */}
          <g>
            {countries.map((c) => {
              const pathD = pathGenerator(c.geometry);
              if (!pathD) return null;

              const details = resolveCountryDetails(c);
              const stat = worldMapData[details.code] || worldMapData[String(c.id)];
              const fill = getCountryFill(c);
              const isHovered = hoveredCountry?.code === details.code;

              return (
                <path
                  key={c.id}
                  d={pathD}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={0.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="by-map-path"
                  style={{
                    filter: isHovered ? 'brightness(0.88) drop-shadow(0 0 4px rgba(37,99,235,0.4))' : undefined,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    if (!containerRect) return;

                    const count = stat?.count || 0;
                    const ips = stat?.uniqueIps || 0;
                    const percentage = totalPeriodRequests > 0
                      ? Number(((count / totalPeriodRequests) * 100).toFixed(1))
                      : (stat?.percentage || 0);

                    setHoveredCountry({
                      name: details.name,
                      flag: details.flag,
                      code: details.code,
                      requests: count,
                      ips,
                      percentage,
                      x: rect.left + rect.width / 2,
                      y: rect.top
                    });
                  }}
                  onMouseLeave={() => setHoveredCountry(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* Cloudflare Jet Black Downward-Arrow Tooltip */}
        {hoveredCountry && (
          <div
            className="by-cf-tooltip"
            style={{
              left: `${hoveredCountry.x}px`,
              top: `${hoveredCountry.y}px`
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <span>{hoveredCountry.flag}</span>
                <span>{hoveredCountry.name}</span>
              </div>
              <div style={{ fontSize: '0.74rem', opacity: 0.9, display: 'flex', gap: '8px', marginTop: '2px' }}>
                <span>
                  请求量: <strong style={{ color: '#38bdf8' }}>{hoveredCountry.requests ? `${hoveredCountry.requests} 次` : 'n/a'}</strong>
                </span>
                {hoveredCountry.requests > 0 && (
                  <>
                    <span>·</span>
                    <span>独立 IP: <strong>{hoveredCountry.ips}</strong></span>
                    <span>·</span>
                    <span>占比: <strong>{hoveredCountry.percentage}%</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cloudflare Style Traffic Histogram Legend Bar (Bottom-Left) */}
      <div className="by-map-legend" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500 }}>0</span>
          <div
            style={{
              width: '140px',
              height: '10px',
              borderRadius: '2px',
              background: 'linear-gradient(90deg, #cbd5e1 0%, #bfdbfe 25%, #60a5fa 55%, #2563eb 80%, #1d4ed8 100%)',
              border: '1px solid #cbd5e1'
            }}
            title="Cloudflare 流量阶梯"
          />
          <span style={{ fontSize: '0.74rem', color: '#0f172a', fontWeight: 600 }}>
            {maxVal} {metric === 'requests' ? '请求' : 'IP'}
          </span>
        </div>

        <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>© OpenStreetMap</span>
          <span>·</span>
          <span>Natural Earth TopoJSON</span>
        </div>
      </div>
    </div>
  );
};
