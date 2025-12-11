import { useState, useMemo } from 'react';
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

const MODES = [
  { key: 'day', label: '日別 (直近30日)' },
  { key: 'week', label: '週別 (直近12週)' },
  { key: 'month', label: '月別 (直近12ヶ月)' },
] as const;

type ModeKey = (typeof MODES)[number]['key'];

import { ChartWrapper } from '../Common/ChartWrapper';

export const AdminWorkLogCharts = () => {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [mode, setMode] = useState<ModeKey>('day');
  
  // CSVダウンロード用の期間state
  // デフォルト: 今月1日 ～ 今日
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

  const effectiveUserId = selectedUserId ?? (users && users.length > 0 ? users[0].id : null);

  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['logsStats', effectiveUserId, mode],
    queryFn: async () => {
      if (!effectiveUserId) throw new Error('No user selected');
      const res = await api.get<StatsResponse>('/logs/stats', {
        params: { userId: effectiveUserId, mode },
      });
      return res.data;
    },
    enabled: !!effectiveUserId,
  });

  const totalMinutesAll = stats?.byCategory.reduce((sum, c) => sum + c.minutes, 0) ?? 0;

  // Pie Chart Data Preparation
  const pieData = useMemo(() => {
    if (!stats?.byCategory) return [];
    
    return stats.byCategory.map(stat => {
        // Resolve color
        const category = categories?.find(c => c.name === stat.categoryName);
        // Fallback to name-based logic if category not found in DB list (e.g. deleted)
        const { color: twClass } = getCategoryColor(category || { name: stat.categoryName });
        
        // Extract hex-like color from tailwind class or map it manually
        // Since we can't easily convert tailwind classes to hex for Recharts in runtime without full map,
        // we will use a simple mapping or try to extract from bgColor if available in DB.
        
        // Strategy:
        // 1. If DB has bgColor (e.g. "bg-blue-100"), map to approximate hex.
        // 2. If no DB, use simple hash or preset palette.
        
        let fill = '#cbd5e1'; // default slate-300
        
        // Tailwind Colors Map (Approximate for graph)
        const colorMap: Record<string, string> = {
            'bg-white': '#f8fafc',
            'bg-blue-100': '#60a5fa', // blue-400
            'bg-green-100': '#4ade80', // green-400
            'bg-orange-100': '#fb923c', // orange-400
            'bg-purple-100': '#c084fc', // purple-400
            'bg-pink-100': '#f472b6', // pink-400
            'bg-gray-100': '#94a3b8', // slate-400
            'bg-teal-50': '#2dd4bf', // teal-400
            'bg-slate-800': '#1e293b', // slate-800
        };
        
        // Try to match from fetched category or just text analysis
        const bgClassKey = category?.bgColor || twClass.split(' ').find(c => c.startsWith('bg-'));
        
        if (bgClassKey && colorMap[bgClassKey]) {
            fill = colorMap[bgClassKey];
        }

        return {
            name: stat.categoryName,
            value: stat.minutes,
            fill
        };
    }).sort((a, b) => b.value - a.value);
  }, [stats, categories]);

  const effectiveUser = users?.find(u => u.id === effectiveUserId);
  const userNameForTitle = effectiveUser ? `${effectiveUser.name} (${effectiveUser.uid})` : 'Unknown User';

  const handleDownload = async () => {
    if (!effectiveUserId) return;
    try {
      // 選択中のユーザーのUIDを取得
      const targetUser = users?.find(u => u.id === effectiveUserId);
      if (!targetUser) return;

      const res = await api.get('/export/csv', {
        params: {
          start: downloadStartDate,
          end: downloadEndDate,
          targetUid: targetUser.uid,
        },
        responseType: 'blob', // バイナリとして受け取る
      });

      // ブラウザでダウンロード発火
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `work_logs_${targetUser.uid}_${downloadStartDate}_${downloadEndDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
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
            業務実績グラフ
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">ユーザー:</span>
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm"
              value={effectiveUserId ?? ''}
              onChange={(e) => setSelectedUserId(Number(e.target.value))}
            >
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`px-2 py-1 rounded text-xs font-medium border ${
                  mode === m.key
                    ? 'bg-blue-50 border-blue-400 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-4 min-h-0 overflow-y-auto">
        <ChartWrapper
            title="時間推移 (分)"
            previewTitle={`${userNameForTitle} - 時間推移 (分)`}
            headerContent={
                <span className="text-xs text-slate-400">
                  合計 {Math.round(totalMinutesAll / 60 * 10) / 10} 時間 ({totalMinutesAll} 分)
                </span>
            }
            isLoading={isLoading}
            className="flex-1 min-h-[300px]"
        >
          {isLoading && <div className="flex h-full items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
          {!isLoading && stats && stats.timeSeries.length === 0 && <div className="flex h-full items-center justify-center text-gray-400 text-xs">データがありません</div>}
          {!isLoading && stats && stats.timeSeries.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.timeSeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      axisLine={false}
                      tickLine={false}
                  />
                  <YAxis 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      axisLine={false}
                      tickLine={false}
                  />
                  <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{ fill: '#f1f5f9' }}
                  />
                  <Bar dataKey="totalMinutes" fill="#3b82f6" radius={[4, 4, 0, 0]} name="業務時間(分)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartWrapper>

        <ChartWrapper 
            title="業務項目別 割合" 
            previewTitle={`${userNameForTitle} - 業務項目別 割合`}
            isLoading={isLoading}
            className="flex-1 min-h-[300px]"
        >
          {isLoading && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">読み込み中...</div>}
          {!isLoading && stats && stats.byCategory.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">データがありません</div>}
          {!isLoading && pieData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                      <Pie
                          data={pieData}
                          cx="40%"
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
                           formatter={(value: number) => [`${value}分`, '時間']}
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
        </ChartWrapper>
      </div>

      {/* CSV Download Area */}
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
}

