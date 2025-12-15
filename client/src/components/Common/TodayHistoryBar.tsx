import { Clock } from 'lucide-react';
import type { Category } from '../../lib/constants';
import { getCategoryStyle } from '../../lib/utils';

interface WorkLog {
  id: number;
  userId: number;
  categoryId: number;
  categoryNameSnapshot: string;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  isManual?: boolean;
  isEdited?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface TodayHistoryBarProps {
  logs: WorkLog[];
  mergedCategories: Record<number, Category>;
}

export const TodayHistoryBar = ({ logs, mergedCategories }: TodayHistoryBarProps) => {
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getLogType = (log: WorkLog) => {
    if (log.isManual) {
      if (log.isEdited) {
        return { label: '作成済（変更済）', color: 'bg-purple-100 text-purple-700' };
      }
      return { label: '作成済', color: 'bg-green-100 text-green-700' };
    }
    
    if (log.isEdited) {
      return { label: '変更済', color: 'bg-orange-100 text-orange-700' };
    }
    
    return { label: '通常', color: 'bg-gray-100 text-gray-600' };
  };

  // 只显示今天的履历，按开始时间倒序排列（最新的在前）
  const todayLogs = logs
    .filter(log => {
      const logDate = new Date(log.startTime).toDateString();
      const today = new Date().toDateString();
      return logDate === today;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <div className="bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg">
      {/* 标题栏 */}
      <div className="container mx-auto px-2 sm:px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock size={16} />
          <span className="font-medium">本日履歴</span>
          <span className="text-xs text-gray-400">({todayLogs.length}件)</span>
        </div>
      </div>

      {/* 履历内容 - 始终显示 */}
      <div className="border-t border-gray-100">
        <div className="container mx-auto px-2 sm:px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="p-2 text-left">開始</th>
                  <th className="p-2 text-left">タスク</th>
                  <th className="p-2 text-left">時間</th>
                  <th className="p-2 text-left">タイプ</th>
                </tr>
              </thead>
              <tbody>
                {todayLogs.map(log => {
                  const cat = mergedCategories[log.categoryId];
                  const { className: colorClass, style } = getCategoryStyle(cat);
                  const type = getLogType(log);
                  
                  return (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 font-mono text-gray-500">
                        {formatTime(log.startTime)}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center">
                          <span 
                            className={`inline-block w-2 h-2 rounded-full mr-2 ${colorClass.split(' ')[0]}`}
                            style={style?.backgroundColor ? { backgroundColor: style.backgroundColor } : {}}
                          ></span>
                          <span className="text-gray-700 truncate max-w-[120px]">
                            {log.categoryNameSnapshot}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 font-mono text-gray-500">
                        {log.duration && log.duration > 0 ? formatDuration(log.duration) : '進行中'}
                      </td>
                      <td className="p-2">
                        <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full whitespace-nowrap ${type.color}`}>
                          {type.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {todayLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-400">
                      本日の履歴はありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
