import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Clock, Pencil, Download } from 'lucide-react';
import { getCategoryColor } from '../../lib/constants';
import type { Category } from '../../lib/constants';
import { EditLogModal } from '../EditLogModal';

interface MonitorLog {
  id: number;
  userId: number;
  user: { uid: string; name: string; role: string };
  categoryId: number;
  category: { name: string };
  categoryNameSnapshot: string;
  startTime: string;
  endTime?: string | null;
  duration?: number;
  isManual?: boolean;
  isEdited?: boolean;
  updatedAt: string;
}

interface DailyStatus {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  hasLeft: boolean;
  leftAt?: string;
  isFixed: boolean;
}

interface MonitorTableProps {
  selectedUsers?: number[];
  timeRange?: 'daily' | 'weekly' | 'last30days' | 'monthly' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
}

export const MonitorTable = ({ selectedUsers = [], timeRange = 'daily', customStartDate, customEndDate }: MonitorTableProps) => {
  const [editingLog, setEditingLog] = useState<MonitorLog | null>(null);

  // Calculate date range for status fetch
  const getDateRangeForStatus = () => {
    const end = new Date();
    const start = new Date();
    
    if (timeRange === 'daily') {
      start.setDate(end.getDate() - 1); // Get yesterday too
    } else if (timeRange === 'weekly') {
      start.setDate(end.getDate() - 7);
    } else if (timeRange === 'last30days') {
      start.setDate(end.getDate() - 30);
    } else if (timeRange === 'monthly') {
      start.setFullYear(end.getFullYear() - 1); // Yearly view
    } else if (timeRange === 'custom' && customStartDate && customEndDate) {
      return { start: customStartDate, end: customEndDate };
    }
    
    return { 
      start: start.toISOString().split('T')[0], 
      end: end.toISOString().split('T')[0] 
    };
  };

  const statusRange = getDateRangeForStatus();

  const { data: dailyStatuses } = useQuery({
    queryKey: ['dailyStatuses', selectedUsers, statusRange],
    queryFn: async () => {
      const params: any = { 
        start: statusRange.start, 
        end: statusRange.end 
      };
      if (selectedUsers.length > 0) {
        params.userIds = selectedUsers.join(',');
      }
      const res = await api.get<DailyStatus[]>('/status/monitor', { params });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['monitorLogs', selectedUsers, timeRange, customStartDate, customEndDate],
    queryFn: async () => {
      const params: any = { range: timeRange };
      if (selectedUsers.length > 0) {
        params.userIds = selectedUsers.join(',');
      }
      
      if (timeRange === 'last30days') {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        params.range = 'custom';
        params.start = start.toISOString().slice(0, 10);
        params.end = end.toISOString().slice(0, 10);
      } else if (timeRange === 'custom' && customStartDate && customEndDate) {
        params.start = customStartDate;
        params.end = customEndDate;
      }
      
      const res = await api.get<MonitorLog[]>('/logs/monitor', { params });
      return res.data;
    },
    select: (data) => data.filter(log => log.duration !== 0),
    enabled: selectedUsers.length > 0,
    refetchInterval: 30000, // 30秒更新
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<Category[]>('/categories');
      // Assign colors on frontend
      return res.data.map(c => ({
        ...c,
        ...getCategoryColor(c)
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case 'daily': return '直近24時間';
      case 'weekly': return '直近7日間';
      case 'last30days': return '直近30日間';
      case 'monthly': return '年別（直近12ヶ月）';
      case 'custom': return `${customStartDate} ~ ${customEndDate}`;
      default: return '直近24時間';
    }
  };

  const handleDownloadCsv = () => {
    if (!logs || logs.length === 0) {
      alert('データがありません');
      return;
    }

    try {
      // Header
      const header = ["Time", "User", "Role", "UID", "Daily Status", "Task", "Type", "Mod Time", "Duration"];
      
      // Rows
      const rows = logs.map(log => {
        // Determine Daily Status (Strict JST)
        const dateObj = new Date(log.startTime);
        const jstDate = new Date(dateObj.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const y = jstDate.getFullYear();
        const m = String(jstDate.getMonth() + 1).padStart(2, '0');
        const d = String(jstDate.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;
        
        const status = dailyStatuses?.find(s => s.userId === log.userId && s.date === dateKey);
        
        let statusStr = '-';
        if (status) {
            const dateShort = `${Number(m)}.${Number(d)}`;
            if (status.isFixed) statusStr = `${dateShort} 未退社(補正済)`;
            else if (status.hasLeft) statusStr = `${dateShort} 退社済`;
            else statusStr = `${dateShort} 未退社`;
        } else {
            const now = new Date();
            const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
            if (y === jstNow.getFullYear() && Number(m) === jstNow.getMonth()+1 && Number(d) === jstNow.getDate()) {
                statusStr = '勤務中';
            } else {
                const dateShort = `${Number(m)}.${Number(d)}`;
                statusStr = `${dateShort} 未退社`;
            }
        }

        // Determine Type Label and Modification Time logic
        let typeLabel = '通常';
        let modTimeStr = '-';
        
        if (log.isManual) {
            if (log.isEdited) {
                typeLabel = '作成済(変更済)';
                modTimeStr = new Date(log.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
            } else {
                typeLabel = '作成済';
                modTimeStr = new Date(log.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
            }
        } else if (log.isEdited) {
            typeLabel = '変更済';
            modTimeStr = new Date(log.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        }

        return [
          new Date(log.startTime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
          log.user.name,
          log.user.role,
          log.user.uid,
          statusStr,
          `"${log.categoryNameSnapshot.replace(/"/g, '""')}"`, // Escape CSV
          typeLabel,
          modTimeStr,
          log.duration ? `${Math.floor(log.duration / 60)}m` : 'Running'
        ];
      });

      // Combine with BOM for Excel UTF-8 support
      const bom = '\uFEFF';
      const csvContent = bom + [
        header.join(','),
        ...rows.map(r => r.join(','))
      ].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `monitor_logs_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('CSV generation failed:', error);
      alert('CSVの作成に失敗しました');
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <Activity size={20} />
            アクティビティ ({getTimeRangeLabel()})
          </h3>
          <span className="text-xs text-gray-400">{logs?.length || 0} records</span>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto overflow-x-auto min-h-0 scroll-container"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
        >
          <style>{`
            .scroll-container::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .scroll-container::-webkit-scrollbar-track {
              background: #f1f5f9;
              border-radius: 4px;
            }
            .scroll-container::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 4px;
              transition: background 0.2s;
            }
            .scroll-container::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
            .scroll-container::-webkit-scrollbar-corner {
              background: #f1f5f9;
            }
          `}</style>
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-gray-500 bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="p-3 font-medium">Time</th>
                <th className="p-3 font-medium">User / Role</th>
                <th className="p-3 font-medium">Daily Status</th>
                <th className="p-3 font-medium">Task</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium text-right">Duration</th>
                <th className="p-3 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && selectedUsers.length > 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">読み込み中...</td></tr>
              )}
              
              {selectedUsers.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">ユーザーを選択してください</td></tr>
              )}

              {selectedUsers.length > 0 && !isLoading && logs?.map((log) => {
                // 簡易的に色を取得 (カテゴリが存在すればその設定を使用、なければ名前から推測)
                const currentCat = categories?.find(c => c.name === log.categoryNameSnapshot);
                const { color: bgClass } = getCategoryColor(currentCat || { name: log.categoryNameSnapshot });
                
                // bg-xxx-100 -> text-xxx-600 のような簡易変換
                const color = bgClass.includes('slate-800') 
                    ? 'text-slate-700'
                    : bgClass.split(' ')[0].replace('bg-', 'text-').replace('-100', '-600').replace('-50', '-500');
                
                const isLongDuration = !log.duration && (new Date().getTime() - new Date(log.startTime).getTime()) > 1000 * 60 * 60 * 3; // 3時間以上経過

                // Daily Status Logic
                const logDate = new Date(log.startTime);
                // Format YYYY-MM-DD
                const dateKey = logDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '-');
                const status = dailyStatuses?.find(s => s.userId === log.userId && s.date === dateKey);

                let statusText = '-';
                let statusColor = 'text-gray-400';
                
                if (status) {
                    const dateShort = `${logDate.getMonth() + 1}.${logDate.getDate()}`;
                    if (status.isFixed) {
                        statusText = `${dateShort} 退社済(補正済)`;
                        statusColor = 'text-blue-600 font-medium';
                    } else if (status.hasLeft) {
                        statusText = `${dateShort} 退社済`;
                        statusColor = 'text-green-600';
                    } else {
                        statusText = `${dateShort} 未退社`;
                        statusColor = 'text-red-500 font-bold';
                    }
                } else {
                    // Check if it's today
                    const todayKey = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '-');
                    if (dateKey === todayKey) {
                        statusText = '勤務中';
                        statusColor = 'text-blue-500';
                    } else {
                        const dateShort = `${logDate.getMonth() + 1}.${logDate.getDate()}`;
                        statusText = `${dateShort} 未退社`;
                        statusColor = 'text-red-500 font-bold';
                    }
                }

                // Type Label Logic
                let typeLabel = '通常';
                let showModTime = false;
                let typeColor = 'text-gray-500';

                if (log.isManual) {
                    if (log.isEdited) {
                        typeLabel = '作成済(変更済)';
                        showModTime = true;
                        typeColor = 'text-orange-600';
                    } else {
                        typeLabel = '作成済';
                        showModTime = true;
                        typeColor = 'text-blue-600';
                    }
                } else if (log.isEdited) {
                    typeLabel = '変更済';
                    showModTime = true;
                    typeColor = 'text-orange-600';
                }

                return (
                  <tr key={log.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-3 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.startTime).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{log.user.name}</div>
                      <div className="text-xs text-gray-400">Role: {log.user.role}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                        <span className={`text-xs ${statusColor}`}>{statusText}</span>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${color}`}>
                        {log.categoryNameSnapshot}
                      </span>
                    </td>
                    <td className="p-3">
                        <div className={`text-xs font-medium ${typeColor}`}>{typeLabel}</div>
                        {showModTime && (
                            <div className="text-[10px] text-gray-400">
                                {new Date(log.updatedAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {log.endTime ? (
                         <span>{Math.floor((log.duration || 0) / 60)}m</span>
                      ) : (
                         <span className={`inline-flex items-center gap-1 ${isLongDuration ? 'text-red-500 font-bold animate-pulse' : 'text-green-600'}`}>
                           <Clock size={12} />
                           Running
                         </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setEditingLog(log)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="修正"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {selectedUsers.length > 0 && !isLoading && logs?.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">履歴がありません</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">レポート出力</h4>
            <button
              onClick={handleDownloadCsv}
              disabled={!logs || logs.length === 0}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                !logs || logs.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              title={!logs || logs.length === 0 ? "データがありません" : "CSVとしてダウンロード"}
            >
              <Download size={16} />
              CSVダウンロード
            </button>
          </div>
        </div>
      </div>

      <EditLogModal
        isOpen={!!editingLog}
        onClose={() => setEditingLog(null)}
        mode="edit"
        log={editingLog}
        categories={categories || []}
      />
    </>
  );
};
