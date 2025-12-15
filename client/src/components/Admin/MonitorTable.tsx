import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Clock, Pencil } from 'lucide-react';
import { getCategoryColor } from '../../lib/constants';
import type { Category } from '../../lib/constants';
import { EditLogModal } from '../EditLogModal';

interface MonitorLog {
  id: number;
  userId: number;
  user: { uid: string; name: string };
  categoryId: number;
  category: { name: string };
  categoryNameSnapshot: string;
  startTime: string;
  duration?: number;
}

interface MonitorTableProps {
  selectedUsers?: number[];
  timeRange?: 'daily' | 'weekly' | 'monthly';
}

export const MonitorTable = ({ selectedUsers = [], timeRange = 'daily' }: MonitorTableProps) => {
  const [editingLog, setEditingLog] = useState<MonitorLog | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['monitorLogs', selectedUsers, timeRange],
    queryFn: async () => {
      const res = await api.get<MonitorLog[]>('/logs/monitor', {
        params: { range: timeRange }
      });
      let filteredLogs = res.data;
      
      // Filter by selected users
      if (selectedUsers.length > 0) {
        filteredLogs = filteredLogs.filter(log => selectedUsers.includes(log.userId));
      }
      
      return filteredLogs;
    },
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

  if (isLoading) return <div className="p-4">Loading monitor...</div>;

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case 'daily': return '直近24時間';
      case 'weekly': return '直近7日間';
      case 'monthly': return '直近12ヶ月';
      default: return '直近24時間';
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
          <span className="text-xs text-gray-400">{logs?.length} records</span>
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
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Task</th>
                <th className="p-3 font-medium text-right">Duration</th>
                <th className="p-3 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs?.map((log) => {
                // 簡易的に色を取得 (カテゴリが存在すればその設定を使用、なければ名前から推測)
                const currentCat = categories?.find(c => c.name === log.categoryNameSnapshot);
                const { color: bgClass } = getCategoryColor(currentCat || { name: log.categoryNameSnapshot });
                
                // bg-xxx-100 -> text-xxx-600 のような簡易変換
                const color = bgClass.includes('slate-800') 
                    ? 'text-slate-700'
                    : bgClass.split(' ')[0].replace('bg-', 'text-').replace('-100', '-600').replace('-50', '-500');
                
                const isLongDuration = !log.duration && (new Date().getTime() - new Date(log.startTime).getTime()) > 1000 * 60 * 60 * 3; // 3時間以上経過

                return (
                  <tr key={log.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-3 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.startTime).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{log.user.name}</div>
                      <div className="text-xs text-gray-400">{log.user.uid}</div>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${color}`}>
                        {log.categoryNameSnapshot}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {log.duration ? (
                         <span>{Math.floor(log.duration / 60)}m</span>
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
              {logs?.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">履歴がありません</td></tr>
              )}
            </tbody>
          </table>
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
