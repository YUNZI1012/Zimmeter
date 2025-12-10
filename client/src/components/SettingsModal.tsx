import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category } from '../lib/constants';
import { getCategoryColor } from '../lib/constants';
import { api } from '../lib/axios';
import { X, ArrowUp, ArrowDown, Plus, Trash2, Pencil, Lock } from 'lucide-react';
import { useUserStatus } from '../hooks/useUserStatus';
import { useToast } from '../context/ToastContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  categories: Category[];
  initialPrimary: number[];
  initialSecondary: number[];
}

export const SettingsModal = ({ isOpen, onClose, uid, categories, initialPrimary, initialSecondary }: SettingsModalProps) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: user } = useUserStatus();
  const isAdmin = user?.role === 'ADMIN';

  const [primary, setPrimary] = useState<number[]>(initialPrimary);
  const [secondary, setSecondary] = useState<number[]>(initialSecondary);
  const [activeTab, setActiveTab] = useState<'visibility' | 'order' | 'create'>('visibility');

  // Create/Edit state
  const [targetList, setTargetList] = useState<'primary' | 'secondary'>('secondary');
  const [newLabel, setNewLabel] = useState('');
  const [editCategory, setEditCategory] = useState<Category | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPrimary(initialPrimary);
      setSecondary(initialSecondary);
    }
  }, [isOpen, initialPrimary, initialSecondary]);

  // --- API Mutations ---

  // 1. Save Display Settings (Preferences)
  const settingsMutation = useMutation({
    mutationFn: async (data: { primaryButtons: number[]; secondaryButtons: number[] }) => {
      return api.post('/settings', { preferences: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', uid] });
      showToast('設定を保存しました', 'success');
      onClose();
    },
    onError: (error: any) => {
      const msg = error.response?.data?.details || '設定の保存に失敗しました';
      showToast(msg, 'error');
    }
  });

  // 2. Create Category
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: 'SYSTEM' | 'CUSTOM' }) => {
      return api.post('/categories', data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      // Add to list automatically
      const newId = res.data.id;
      if (targetList === 'primary') {
        setPrimary(prev => [...prev, newId]);
      } else {
        setSecondary(prev => [...prev, newId]);
      }
      setNewLabel('');
      showToast('カテゴリを作成しました', 'success');
    },
    onError: (error: any) => {
        const msg = error.response?.data?.details || error.response?.data?.error || 'カテゴリの作成に失敗しました';
        showToast(msg, 'error');
    }
  });

  // 3. Update Category
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; name: string }) => {
      return api.put(`/categories/${data.id}`, { name: data.name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditCategory(null);
      setNewLabel('');
      showToast('カテゴリを更新しました', 'success');
    },
    onError: () => {
        showToast('カテゴリの更新に失敗しました', 'error');
    }
  });

  // 4. Delete Category
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/categories/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      // Remove from lists
      setPrimary(prev => prev.filter(pid => pid !== id));
      setSecondary(prev => prev.filter(sid => sid !== id));
      showToast('カテゴリを削除しました', 'success');
    },
    onError: () => {
        showToast('カテゴリの削除に失敗しました', 'error');
    }
  });

  // --- Handlers ---

  const handleSaveSettings = () => {
    settingsMutation.mutate({ 
      primaryButtons: primary, 
      secondaryButtons: secondary
    });
  };

  const handleCreateOrUpdate = () => {
    if (!newLabel.trim()) return;

    if (editCategory) {
      updateMutation.mutate({ id: editCategory.id, name: newLabel.trim() });
    } else {
      // AdminならSYSTEM、それ以外はCUSTOM
      const type = isAdmin ? 'SYSTEM' : 'CUSTOM';
      createMutation.mutate({ name: newLabel.trim(), type });
    }
  };

  const handleEditClick = (cat: Category) => {
    setEditCategory(cat);
    setNewLabel(cat.name);
  };

  const handleDeleteClick = (id: number) => {
    if (window.confirm('このカテゴリを削除しますか？\n（過去の履歴データは保持されます）')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCancelEdit = () => {
    setEditCategory(null);
    setNewLabel('');
  };

  const handleChangeVisibility = (catId: number, type: 'primary' | 'secondary' | 'hidden') => {
    const newPrimary = primary.filter(id => id !== catId);
    const newSecondary = secondary.filter(id => id !== catId);

    if (type === 'primary') newPrimary.push(catId);
    if (type === 'secondary') newSecondary.push(catId);

    setPrimary(newPrimary);
    setSecondary(newSecondary);
  };

  const moveItem = (list: number[], index: number, direction: 'up' | 'down') => {
    const newList = [...list];
    if (direction === 'up') {
      if (index === 0) return list;
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    } else {
      if (index === list.length - 1) return list;
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    }
    return newList;
  };

  if (!isOpen) return null;

  // Category Map for easy lookup
  const categoryMap = categories.reduce((acc, c) => ({ ...acc, [c.id]: c }), {} as Record<number, Category>);

  // Preview color
  const { color: previewClass } = getCategoryColor(newLabel || '新規カテゴリ');
  // 簡易的にクラスから色スタイルを生成 (Tailwindクラスをそのまま使う)
  // getCategoryColorは { color: 'bg-blue-100 border-blue-300' } のように返す

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-xl font-bold">設定</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={24}/></button>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-4 border-b mb-4 shrink-0 overflow-x-auto">
            <button 
                className={`pb-2 px-1 whitespace-nowrap ${activeTab === 'visibility' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('visibility')}
            >
                表示・非表示
            </button>
            <button 
                className={`pb-2 px-1 whitespace-nowrap ${activeTab === 'order' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('order')}
            >
                並び順
            </button>
            <button 
                className={`pb-2 px-1 whitespace-nowrap ${activeTab === 'create' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('create')}
            >
                カテゴリ管理
            </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-2">
            {/* 1. Visibility Tab */}
            {activeTab === 'visibility' && (
                <div className="space-y-2">
                    {categories.map(cat => {
                        const isPrimary = primary.includes(cat.id);
                        const isSecondary = secondary.includes(cat.id);
                        const { color: rowColorClass } = getCategoryColor(cat.name);
                        
                        return (
                            <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-md text-sm font-medium ${rowColorClass}`}>
                                        {cat.name}
                                    </span>
                                    {cat.type === 'SYSTEM' && (
                                        <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">SYS</span>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                     <label className="flex items-center gap-1 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name={`setting-${cat.id}`} 
                                            checked={isPrimary} 
                                            onChange={() => handleChangeVisibility(cat.id, 'primary')}
                                            className="w-4 h-4 text-blue-600"
                                        /> 
                                        <span className="text-sm">メイン</span>
                                     </label>
                                     <label className="flex items-center gap-1 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name={`setting-${cat.id}`} 
                                            checked={isSecondary} 
                                            onChange={() => handleChangeVisibility(cat.id, 'secondary')}
                                            className="w-4 h-4 text-blue-600"
                                        /> 
                                        <span className="text-sm">サブ</span>
                                     </label>
                                     <label className="flex items-center gap-1 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name={`setting-${cat.id}`} 
                                            checked={!isPrimary && !isSecondary} 
                                            onChange={() => handleChangeVisibility(cat.id, 'hidden')}
                                            className="w-4 h-4 text-blue-600"
                                        /> 
                                        <span className="text-sm text-gray-500">非表示</span>
                                     </label>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            
            {/* 2. Order Tab */}
            {activeTab === 'order' && (
                <div className="space-y-6">
                    {/* Primary Order */}
                    <div>
                        <h3 className="font-bold text-gray-700 mb-2 pl-1">メインボタン</h3>
                        <div className="space-y-2">
                            {primary.map((catId, index) => {
                                const cat = categoryMap[catId];
                                if (!cat) return null;
                                const { color } = getCategoryColor(cat.name);

                                return (
                                    <div key={catId} className="flex items-center justify-between p-2 border rounded bg-white">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-3 h-3 rounded-full ${color.split(' ')[0]}`}></span>
                                            <span className="font-medium">{cat.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => setPrimary(moveItem(primary, index, 'up'))}
                                                disabled={index === 0}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                            <button 
                                                onClick={() => setPrimary(moveItem(primary, index, 'down'))}
                                                disabled={index === primary.length - 1}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowDown size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Secondary Order */}
                    <div>
                        <h3 className="font-bold text-gray-700 mb-2 pl-1">サブボタン</h3>
                        <div className="space-y-2">
                            {secondary.map((catId, index) => {
                                const cat = categoryMap[catId];
                                if (!cat) return null;
                                const { color } = getCategoryColor(cat.name);

                                return (
                                    <div key={catId} className="flex items-center justify-between p-2 border rounded bg-white">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-3 h-3 rounded-full ${color.split(' ')[0]}`}></span>
                                            <span className="font-medium">{cat.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => setSecondary(moveItem(secondary, index, 'up'))}
                                                disabled={index === 0}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                            <button 
                                                onClick={() => setSecondary(moveItem(secondary, index, 'down'))}
                                                disabled={index === secondary.length - 1}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowDown size={18} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 3. Create/Manage Tab */}
            {activeTab === 'create' && (
                <div className="space-y-8 p-1">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <h3 className="font-bold text-gray-800 border-b border-blue-200 pb-2 mb-4">
                            {editCategory ? 'カテゴリを編集' : '新規カテゴリ作成'}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">カテゴリ名</label>
                                <input 
                                    type="text" 
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="業務名 (例: 開発MTG)"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    ※名前に「メール」「会議」「実装」などのキーワードを含めると自動で色がつきます。
                                </p>
                            </div>

                            {!editCategory && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">追加先</label>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="targetList"
                                                checked={targetList === 'primary'}
                                                onChange={() => setTargetList('primary')}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-gray-700">メインボタン</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="targetList"
                                                checked={targetList === 'secondary'}
                                                onChange={() => setTargetList('secondary')}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-gray-700">サブボタン</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                            
                            <div className="bg-white p-3 rounded-lg border">
                                <p className="text-xs text-gray-500 mb-2">プレビュー</p>
                                <div className={`flex items-center justify-center p-2 rounded-xl border-2 w-full h-16 shadow-sm ${previewClass}`}>
                                    <span className="text-lg font-bold">{newLabel || 'カテゴリ名'}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {editCategory && (
                                    <button
                                        onClick={handleCancelEdit}
                                        className="w-1/3 py-2 bg-gray-500 text-white rounded-lg font-bold hover:bg-gray-600"
                                    >
                                        キャンセル
                                    </button>
                                )}
                                <button
                                    onClick={handleCreateOrUpdate}
                                    disabled={!newLabel.trim()}
                                    className={`flex-1 py-2 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${editCategory ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                                >
                                    {editCategory ? '更新する' : (
                                        <>
                                            <Plus size={20} />
                                            追加する
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Manage List */}
                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-bold text-gray-800">カテゴリ一覧</h3>
                        <div className="space-y-2">
                            {categories.map(cat => {
                                const isSystem = cat.type === 'SYSTEM';
                                // Edit allowed if: (Admin) OR (Custom & User)
                                const canEdit = isAdmin || (!isSystem);

                                return (
                                    <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${getCategoryColor(cat.name).color.split(' ')[0]}`}></div>
                                            <span className="font-medium">{cat.name}</span>
                                            {isSystem && <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">SYS</span>}
                                        </div>
                                        <div className="flex gap-1">
                                            {canEdit ? (
                                                <>
                                                    <button 
                                                        onClick={() => handleEditClick(cat)}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="編集"
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteClick(cat.id)}
                                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="削除"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="p-2 text-gray-300 cursor-not-allowed" title="編集権限がありません">
                                                    <Lock size={18} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="mt-6 flex justify-end gap-2 sticky bottom-0 bg-white pt-2 border-t shrink-0">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">キャンセル</button>
            <button 
                onClick={handleSaveSettings} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={settingsMutation.isPending}
            >
                {settingsMutation.isPending ? '保存中...' : '設定を保存'}
            </button>
        </div>
      </div>
    </div>
  );
};
