import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Download } from 'lucide-react';
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

export const AdminWorkLogCharts = ({ 
  selectedUsers = [], 
  timeRange = 'daily',
  chartType = 'bar',
  customStartDate,
  customEndDate
}: {
  selectedUsers?: number[];
  timeRange?: 'daily' | 'weekly' | 'monthly' | 'custom';
  chartType?: 'bar' | 'pie';
  customStartDate?: string;
  customEndDate?: string;
}) => {
  const getModeFromTimeRange = (range: 'daily' | 'weekly' | 'monthly' | 'custom'): ModeKey => {
    switch (range) {
      case 'daily': return 'day';
      case 'weekly': return 'week';
      case 'monthly': return 'month';
      case 'custom': return 'custom';
      default: return 'day';
    }
  };
  
  const [mode, setMode] = useState<ModeKey>(getModeFromTimeRange(timeRange));
  
  useEffect(() => {
    setMode(getModeFromTimeRange(timeRange));
  }, [timeRange]);
  
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [downloadStartDate, setDownloadStartDate] = useState(firstDay.toISOString().slice(0, 10));
  const [downloadEndDate, setDownloadEndDate] = useState(today.toISOString().slice(0, 10));

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
      if (users && users.length > 0) return [users[0].id];
      return [];
  }, [selectedUsers, users]);

  // Unified Query for Stats (Bar & Pie)
  // Fetches aggregated stats for ALL selected users
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['logsStats', effectiveUserIds, mode, customStartDate, customEndDate],
    queryFn: async () => {
      if (effectiveUserIds.length === 0) throw new Error('No user selected');
      
      const params: any = { userIds: effectiveUserIds.join(','), mode };
      if (mode === 'custom' && customStartDate && customEndDate) {
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
    }).sort((a, b) => b.value - a.value);
  }, [stats, categories]);

  const handleDownload = async () => {
    try {
      const res = await api.get('/export/csv', {
        params: {
          userIds: effectiveUserIds.join(','),
          start: downloadStartDate,
          end: downloadEndDate,
        },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `work_logs_${downloadStartDate}_${downloadEndDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
      alert('CSVダウンロードに失敗しました');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <Activity size={20} />
            {chartType === 'bar' ? '棒グラフ' : '円グラフ'}
          </h3>
          <span className="text-xs text-gray-400">
            {selectedUsers.length > 0 ? `${selectedUsers.length} users` : 'Default User'}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {chartType === 'bar' ? (
          <div className="flex-1 flex flex-col min-h-[300px]">
            {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
            {!isLoading && stats && stats.timeSeries.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">データがありません</div>}
            {!isLoading && stats && stats.timeSeries.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.timeSeries.map(item => ({ ...item, totalMinutes: Math.abs(item.totalMinutes) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(value) => Math.abs(value).toString()}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`${Math.abs(value)}分`, '時間']}
                  />
                  <Bar dataKey="totalMinutes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-[300px]">
            {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
            {!isLoading && stats && stats.byCategory.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">データがありません</div>}
            {!isLoading && pieData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius="40%"
                    outerRadius="70%"
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
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
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">CSVダウンロード</h4>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={downloadStartDate}
              onChange={(e) => setDownloadStartDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
            />
            <span className="text-gray-400">～</span>
            <input
              type="date"
              value={downloadEndDate}
              onChange={(e) => setDownloadEndDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
            />
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors ml-auto"
              title="CSVダウンロード"
            >
              <Download size={16} />
              ダウンロード
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
