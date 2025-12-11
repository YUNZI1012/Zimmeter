import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/axios';
import { getCategoryColor } from '../lib/constants';
import type { Category } from '../lib/constants';

interface AwayModalProps {
  isOpen: boolean;
  onClose: () => void;
  logId: number; // ID of the away log to patch
}

export const AwayModal = ({ isOpen, onClose, logId }: AwayModalProps) => {
  const queryClient = useQueryClient();
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);

  // Fetch categories
  const { data: categories } = useQuery({
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

  // Filter categories relevant for away reasons (exclude "離席")
  const reasons = categories?.filter(c => !c.name.includes('離席')) || [];

  const mutation = useMutation({
    mutationFn: async (data: { categoryId: number }) => {
      return api.patch(`/logs/${logId}`, { ...data, isManual: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['activeLog'] });
      onClose();
    },
  });

  const handleSave = () => {
    if (!selectedCatId) return;
    mutation.mutate({ categoryId: selectedCatId });
  };

  const handleContinueAway = () => {
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-xl font-bold mb-4">離席内容の確認</h2>
        <p className="mb-4 text-gray-600">先ほどの離席は何をしていましたか？</p>
        
        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto mb-6 p-1">
          {reasons.map(cat => (
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
          <button
              onClick={handleContinueAway}
              className="p-3 rounded-lg border text-left transition-all hover:bg-gray-50 border-gray-200 text-gray-500"
          >
              そのまま離席
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">スキップ</button>
          <button 
            onClick={handleSave} 
            disabled={!selectedCatId || mutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold shadow-sm"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
};
