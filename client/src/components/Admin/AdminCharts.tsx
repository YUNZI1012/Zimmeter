import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Maximize2, X, Image as ImageIcon } from 'lucide-react';
import { toPng } from 'html-to-image';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { getCategoryColor, type Category } from '../../lib/constants';

interface User {
  id: number;
  uid: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

interface TimeSeriesPoint {
  label: string;
  totalMinutes: number;
}

interface CategoryStat {
  categoryName: string;
  minutes: number;
}

interface StatsResponse {
  timeSeries: TimeSeriesPoint[];
  byCategory: CategoryStat[];
}

type ModeKey = 'day' | 'week' | 'month' | 'year' | 'custom';

interface ChartContentProps {
  chartType: 'bar' | 'pie';
  isLoading: boolean;
  stats: StatsResponse | undefined;
  barData: any[];
  pieData: any[];
  timeRange: 'daily' | 'weekly' | 'last30days' | 'monthly' | 'custom';
  mode: ModeKey;
}

const ChartContent = ({ chartType, isLoading, stats, barData, pieData, timeRange, mode }: ChartContentProps) => {
  const formatXAxis = (value: string) => {
    if (timeRange === 'daily') return value; // Hours: 00, 01...
    
    // Attempt to parse date
    const date = new Date(value);
    if (isNaN(date.getTime())) return value; // Fallback if not a date

    if (mode === 'year') {
        return date.toLocaleDateString('ja-JP', { year: 'numeric' });
    }

    if (mode === 'month') {
        // YYYY-MM
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' });
    }
    
    // Weekly, Last30Days, Custom (Day) -> MM/DD
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  };

  if (chartType === 'bar') {
    return (
      <div className="flex-1 flex flex-col min-h-[300px] overflow-hidden">
        {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
        {!isLoading && !stats && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">ユーザーを選択してください</div>}
        {!isLoading && stats && stats.timeSeries.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">データがありません</div>}
        {!isLoading && barData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%" debounce={50}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
                tickFormatter={formatXAxis}
              />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickFormatter={(value) => Math.abs(value).toString()}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${Math.abs(value)}分`, '時間']}
                labelFormatter={(label) => formatXAxis(label)}
              />
              <Bar dataKey="totalMinutes" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  } else {
    return (
      <div className="flex-1 flex flex-col min-h-[300px] overflow-hidden">
        {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
        {!isLoading && !stats && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">ユーザーを選択してください</div>}
        {!isLoading && stats && stats.byCategory.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">データがありません</div>}
        {!isLoading && pieData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%" debounce={50}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="70%"
                paddingAngle={2}
                dataKey="value"
                isAnimationActive={false}
              >
                {pieData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number, name: string) => [`${value}分`, name]}
              />
              <Legend 
                layout="vertical" 
                verticalAlign="middle" 
                align="right"
                wrapperStyle={{ fontSize: '11px', lineHeight: '14px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }
};

export const AdminWorkLogCharts = ({ 
  selectedUsers = [], 
  timeRange = 'daily',
  chartType = 'bar',
  customStartDate,
  customEndDate
}: {
  selectedUsers?: number[];
  timeRange?: 'daily' | 'weekly' | 'last30days' | 'monthly' | 'custom';
  chartType?: 'bar' | 'pie';
  customStartDate?: string;
  customEndDate?: string;
}) => {
  const mode = useMemo((): ModeKey => {
    if (timeRange === 'daily') return 'day';
    if (timeRange === 'weekly') return 'custom';
    if (timeRange === 'last30days') return 'custom';
    if (timeRange === 'monthly') return 'month';
    
    if (timeRange === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 31) return 'custom'; // Day-level (custom usually implies day in this system)
      if (diffDays <= 366) return 'month';
      return 'year';
    }
    
    return 'day';
  }, [timeRange, customStartDate, customEndDate]);

  const [isExpanded, setIsExpanded] = useState(false);
  
  const { data: users } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<User[]>('/users');
      return res.data;
    },
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<Category[]>('/categories');
      return res.data.map(c => ({
          ...c,
          ...getCategoryColor(c)
      }));
    },
    staleTime: 1000 * 60 * 5,
  });

  const effectiveUserIds = useMemo(() => {
      if (selectedUsers.length > 0) return selectedUsers;
      return [];
  }, [selectedUsers]);

  const { displayLabel, fullLabel, filenameLabel } = useMemo(() => {
    if (effectiveUserIds.length === 0) {
      return { 
        displayLabel: 'ユーザー未選択', 
        fullLabel: 'ユーザー未選択', 
        filenameLabel: 'no_user' 
      };
    }
    if (!users) {
      return { 
        displayLabel: '', 
        fullLabel: '', 
        filenameLabel: '' 
      };
    }

    const selectedUsersList = users.filter(u => effectiveUserIds.includes(u.id));
    const names = selectedUsersList.map(u => u.name);
    const totalCount = names.length;
    
    // Full list for tooltip
    const fullLabel = names.join(', ');
    
    let displayLabel = '';
    let filenameLabel = '';

    if (totalCount <= 10) {
      displayLabel = names.join(', ');
      // Sanitize for filename
      filenameLabel = names.join('_').replace(/\s+/g, '_');
    } else {
      const first10 = names.slice(0, 10);
      displayLabel = `${first10.join(', ')}... (全${totalCount}名)`;
      // Sanitize for filename
      filenameLabel = `${first10.join('_').replace(/\s+/g, '_')}_etc_${totalCount}users`;
    }

    return { displayLabel, fullLabel, filenameLabel };
  }, [users, effectiveUserIds]);

  // Unified Query for Stats (Bar & Pie)
  // Fetches aggregated stats for ALL selected users
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['logsStats', effectiveUserIds, mode, timeRange, customStartDate, customEndDate],
    queryFn: async () => {
      if (effectiveUserIds.length === 0) throw new Error('No user selected');
      
      const params: any = { userIds: effectiveUserIds.join(','), mode };
      
      if (timeRange === 'weekly') {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 7);
        params.start = start.toISOString().slice(0, 10);
        params.end = end.toISOString().slice(0, 10);
      } else if (timeRange === 'last30days') {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        params.start = start.toISOString().slice(0, 10);
        params.end = end.toISOString().slice(0, 10);
      } else if (timeRange === 'custom' && customStartDate && customEndDate) {
        params.mode = 'custom'; // Force API mode to custom to respect start/end dates
        params.start = customStartDate;
        params.end = customEndDate;
      }

      const res = await api.get<StatsResponse>('/logs/stats', { params });
      return res.data;
    },
    enabled: effectiveUserIds.length > 0,
  });

  const pieData = useMemo(() => {
    if (!stats?.byCategory) return [];
    
    return stats.byCategory.map(stat => {
        const category = categories?.find(c => c.name === stat.categoryName);
        const { color: bgClass } = getCategoryColor(category || { name: stat.categoryName });
        
        let fill = '#cbd5e1';
        
        const colorMap: Record<string, string> = {
            'bg-white': '#f8fafc',
            'bg-blue-100': '#60a5fa',
            'bg-green-100': '#4ade80',
            'bg-orange-100': '#fb923c',
            'bg-purple-100': '#c084fc',
            'bg-pink-100': '#f472b6',
            'bg-gray-100': '#94a3b8',
            'bg-teal-50': '#2dd4bf',
            'bg-slate-800': '#1e293b',
            'bg-slate-900': '#0f172a',
        };
        
        const bgClassKey = category?.bgColor || bgClass.split(' ').find(c => c.startsWith('bg-'));
        
        if (bgClassKey && colorMap[bgClassKey]) {
            fill = colorMap[bgClassKey];
        }

        return {
            name: stat.categoryName,
            value: Math.abs(stat.minutes),
            fill
        };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  }, [stats, categories]);

  const barData = useMemo(() => {
    if (!stats?.timeSeries) return [];
    return stats.timeSeries.map(item => ({ ...item, totalMinutes: Math.abs(item.totalMinutes) }));
  }, [stats]);

  const dateRangeLabel = useMemo(() => {
    if (timeRange === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} ~ ${customEndDate}`;
    }
    
    const now = new Date();
    const startDate = new Date();
    
    const formatDate = (d: Date) => {
        return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    };

    if (timeRange === 'daily') {
         startDate.setHours(startDate.getHours() - 24);
         return `${startDate.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} ~ ${now.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    } else if (timeRange === 'weekly') {
         startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === 'last30days') {
         startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === 'monthly') {
         startDate.setFullYear(startDate.getFullYear() - 1);
    }
    
    return `${formatDate(startDate)} ~ ${formatDate(now)}`;
  }, [timeRange, customStartDate, customEndDate]);

  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownloadPng = async () => {
    if (effectiveUserIds.length === 0) {
      alert('ユーザーを選択してください');
      return;
    }

    if (!chartRef.current) return;

    try {
      // Use html-to-image's toPng
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2, // Higher resolution
        filter: (node) => {
            // Exclude elements with data-ignore-capture attribute
            if (node instanceof HTMLElement && node.hasAttribute('data-ignore-capture')) {
                return false;
            }
            return true;
        }
      });

      const link = document.createElement('a');
      link.setAttribute('href', dataUrl);
      
      const chartTypeLabel = chartType === 'bar' ? 'bar_chart' : 'pie_chart';
      const safeUserLabel = filenameLabel;
      const dateStr = new Date().toISOString().slice(0, 10);
      
      link.setAttribute('download', `${chartTypeLabel}_${safeUserLabel}_${dateStr}.png`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
      alert('画像の保存に失敗しました');
    }
  };

  return (
    <>
      <div 
        className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col"
        ref={chartRef}
      >
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <Activity size={20} />
              {chartType === 'bar' ? '棒グラフ' : '円グラフ'}
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end mr-2">
                <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded mb-0.5">
                  {dateRangeLabel}
                </span>
                <span className="text-xs text-gray-400 max-w-[200px] truncate font-medium" title={fullLabel}>
                  {displayLabel || 'Loading...'}
                </span>
              </div>
              <button 
                onClick={() => setIsExpanded(true)}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors text-gray-400 hover:text-blue-600"
                title="拡大表示"
                data-ignore-capture="true"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <ChartContent 
            chartType={chartType || 'bar'}
            isLoading={isLoading}
            stats={stats}
            barData={barData}
            pieData={pieData}
            timeRange={timeRange}
            mode={mode}
          />
        </div>

        <div 
            className="p-4 border-t border-gray-100 bg-gray-50 shrink-0"
            data-ignore-capture="true"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">画像エクスポート</h4>
            <button
              onClick={handleDownloadPng}
              disabled={effectiveUserIds.length === 0}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                effectiveUserIds.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title={effectiveUserIds.length === 0 ? "ユーザーを選択してください" : "現在のグラフを画像として保存"}
            >
              <ImageIcon size={16} />
              PNG保存
            </button>
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2">
                  <Activity size={24} className="text-gray-700" />
                  <h2 className="text-lg font-bold text-gray-800">
                  {chartType === 'bar' ? '棒グラフ' : '円グラフ'} - 拡大表示
                  </h2>
              </div>
              <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-700 mb-1">
                          {dateRangeLabel}
                      </span>
                      <span className="text-sm text-gray-500 max-w-[400px] truncate" title={fullLabel}>
                          User: {displayLabel || 'Loading...'}
                      </span>
                  </div>
                  <button 
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-700 ml-2"
                  >
                    <X size={24} />
                  </button>
              </div>
            </div>
            <div className="flex-1 p-6 min-h-0 bg-white flex flex-col">
              <ChartContent 
                chartType={chartType || 'bar'}
                isLoading={isLoading}
                stats={stats}
                barData={barData}
                pieData={pieData}
                timeRange={timeRange}
                mode={mode}
              />
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={handleDownloadPng} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                <ImageIcon size={18} />
                PNG保存 (通常サイズ)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
