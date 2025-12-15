import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/axios';
import type { Category } from '../lib/constants';
import { useToast } from '../context/ToastContext';

interface WorkLog {
  id: number;
  categoryId: number;
  categoryNameSnapshot: string;
}

interface EditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'edit' | 'create';
  log: WorkLog | null;
  categories: Category[];
  uid?: string;
}

export const EditLogModal = ({ isOpen, onClose, mode, log, categories, uid }: EditLogModalProps) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && log) {
      setSelectedCatId(log.categoryId);
      return;
    }

    if (mode === 'create') {
      setSelectedCatId(null);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const hh = pad(now.getHours());
      const mm = pad(now.getMinutes());
      setStartTime(`${hh}:${mm}`);
    }
  }, [isOpen, mode, log]);

  const updateMutation = useMutation({
    mutationFn: async (data: { categoryId: number }) => {
      if (!log) return;
      return api.patch(`/logs/${log.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history', uid] });
      queryClient.invalidateQueries({ queryKey: ['activeLog', uid] });
      onClose();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.details || error.response?.data?.error || '履歴の更新に失敗しました';
      showToast(msg, 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { categoryId: number; startTime: string }) => {
      return api.post('/logs/manual', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history', uid] });
      queryClient.invalidateQueries({ queryKey: ['activeLog', uid] });
      onClose();
    },
    onError: (error: any) => {
      const status = error.response?.status;
      const data = error.response?.data;
      const serverMsg =
        (typeof data === 'string' ? data : (data?.message || data?.details || data?.error)) ||
        (status ? `HTTP ${status}` : null);
      showToast(serverMsg || '履歴の追加に失敗しました', 'error');
    },
  });

  const handleSave = () => {
    if (!selectedCatId) {
      showToast('カテゴリを選択してください', 'error');
      return;
    }

    if (mode === 'edit') {
      updateMutation.mutate({ categoryId: selectedCatId });
      return;
    }

    const today = new Date();
    const [sh, sm] = startTime.split(':').map(Number);

    if ([sh, sm].some(v => Number.isNaN(v))) {
      showToast('開始時刻を正しく入力してください', 'error');
      return;
    }

    const start = new Date(today);
    start.setHours(sh, sm, 0, 0);

    createMutation.mutate({
      categoryId: selectedCatId,
      startTime: start.toISOString(),
    });
  };

  if (!isOpen || (mode === 'edit' && !log)) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-xl font-bold mb-4">{mode === 'edit' ? '履歴の修正' : '履歴の追加'}</h2>
        <p className="mb-4 text-gray-600">{mode === 'edit' ? '正しい作業内容を選択してください。' : '追加する作業内容と時間を入力してください。'}</p>

        {mode === 'create' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">開始時刻</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full p-2 border rounded-lg bg-white"
            />
            <p className="text-xs text-gray-500 mt-1">前の項目の開始時間との差が計算時間になります</p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto mb-6 p-1">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                  selectedCatId === cat.id 
                  ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-500 font-bold' 
                  : 'hover:bg-gray-50 border-gray-200'
              }`}
            >
              <span 
                className={`inline-block w-2 h-2 rounded-full mr-2 ${cat.color?.split(' ')[0] || 'bg-gray-400'}`}
              ></span>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">キャンセル</button>
          <button 
            onClick={handleSave} 
            disabled={!selectedCatId || (mode === 'create' && !startTime) || updateMutation.isPending || createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold shadow-sm"
          >
            {(updateMutation.isPending || createMutation.isPending) ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
