import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Download } from 'lucide-react';

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
                  {u.name} ({u.uid})
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

      <div className="flex-1 grid grid-rows-2 gap-2 p-4 min-h-0 overflow-y-auto">
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h4 className="text-sm font-semibold text-slate-700">時間推移</h4>
            <span className="text-xs text-slate-400">
              合計 {totalMinutesAll} 分
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400 min-h-0">
            {isLoading && <span>読み込み中...</span>}
            {!isLoading && stats && stats.timeSeries.length === 0 && <span>データがありません</span>}
            {!isLoading && stats && stats.timeSeries.length > 0 && (
              <pre className="text-[10px] leading-tight text-left w-full h-full overflow-auto bg-slate-900 text-slate-100 rounded p-2">
                {JSON.stringify(stats.timeSeries, null, 2)}
              </pre>
            )}
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h4 className="text-sm font-semibold text-slate-700">業務項目別 割合</h4>
          </div>
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400 min-h-0">
            {isLoading && <span>読み込み中...</span>}
            {!isLoading && stats && stats.byCategory.length === 0 && <span>データがありません</span>}
            {!isLoading && stats && stats.byCategory.length > 0 && (
              <pre className="text-[10px] leading-tight text-left w-full h-full overflow-auto bg-slate-900 text-slate-100 rounded p-2">
                {JSON.stringify(stats.byCategory, null, 2)}
              </pre>
            )}
          </div>
        </div>
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
