import { X, Pencil, Plus } from 'lucide-react';
import type { Category } from '../lib/constants';
import { getCategoryStyle } from '../lib/utils';

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

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: WorkLog[];
  onEdit: (log: WorkLog) => void;
  onAdd: () => void;
  mergedCategories: Record<number, Category>;
  filterCategoryId: number | null;
  onClearFilter: () => void;
  onItemDoubleClick?: (categoryId: number) => void;
}

export const HistoryModal = ({ 
    isOpen, 
    onClose, 
    logs, 
    onEdit, 
    onAdd, 
    mergedCategories, 
    filterCategoryId, 
    onClearFilter, 
    onItemDoubleClick 
}: HistoryModalProps) => {
  if (!isOpen) return null;

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getLogTypeInfo = (log: WorkLog) => {
    if (log.isManual) {
      if (log.isEdited) {
        return { 
          label: '作成済（変更済）', 
          color: 'bg-purple-100 text-purple-700',
          showTime: true 
        };
      }
      return { 
        label: '作成済', 
        color: 'bg-green-100 text-green-700',
        showTime: false 
      };
    }

    if (log.isEdited) {
      return { 
        label: '変更済', 
        color: 'bg-orange-100 text-orange-700',
        showTime: true 
      };
    }

    return { 
      label: '通常', 
      color: 'bg-gray-100 text-gray-600',
      showTime: false 
    };
  };

    const todayLogs = logs.filter(log => {
    // 時間が0の履歴（終了済みかつ時間が0）は表示しない
    if (log.endTime && (log.duration || 0) === 0) return false;

    const logDate = new Date(log.startTime).toDateString();
    const today = new Date().toDateString();
    const isSameDay = logDate === today;
    const matchesFilter = filterCategoryId ? log.categoryId === filterCategoryId : true;
    return isSameDay && matchesFilter;
  });

  const filterCategory = filterCategoryId ? mergedCategories[filterCategoryId] : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-gray-700">本日の履歴</h2>
              {filterCategory && (
                  <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full text-sm text-blue-700 border border-blue-100 animate-fadeIn">
                      <span className="font-bold">フィルタ: {filterCategory.name}</span>
                      <button 
                        onClick={onClearFilter} 
                        className="p-0.5 hover:bg-blue-100 rounded-full transition-colors"
                        title="フィルタを解除"
                      >
                          <X size={14}/>
                      </button>
                  </div>
              )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAdd}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
              title="追加"
              type="button"
            >
              <Plus size={16} />
              追加
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm text-center">
            <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
              <tr>
                <th className="p-2 rounded-l text-center">開始時刻</th>
                <th className="p-2 text-center">タスク</th>
                <th className="p-2 text-center">時間</th>
                <th className="p-2 text-center">タイプ</th>
                <th className="p-2 rounded-r text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {todayLogs.map(log => {
                 const cat = mergedCategories[log.categoryId];
                 const { className: colorClass, style } = getCategoryStyle(cat);
                 
                 return (
                    <tr 
                        key={log.id} 
                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                        onDoubleClick={() => onItemDoubleClick?.(log.categoryId)}
                    >
                      <td className="p-2 font-mono text-gray-500 text-center">
                        {new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-2 font-medium">
                        <div className="flex items-center justify-center">
                            <span 
                                className={`inline-block w-2 h-2 rounded-full mr-2 ${colorClass.split(' ')[0]}`}
                                style={style?.backgroundColor ? { backgroundColor: style.backgroundColor } : {}}
                            ></span>
                            {log.categoryNameSnapshot}
                        </div>
                      </td>
                      <td className="p-2 text-gray-500 font-mono text-center">
                        {log.endTime ? formatDuration(log.duration || 0) : '進行中'}
                      </td>
                      <td className="p-2 text-xs text-gray-400 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${getLogTypeInfo(log).color}`}>
                            {getLogTypeInfo(log).label}
                          </span>
                          {getLogTypeInfo(log).showTime && log.updatedAt && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(log.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-center">
                            <button
                            onClick={() => onEdit(log)}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="修正"
                            >
                            <Pencil size={16} />
                            </button>
                        </div>
                      </td>
                    </tr>
                 );
              })}
              {todayLogs.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">履歴なし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
