import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category, ColorPreset } from '../lib/constants';
import { getCategoryColor, COLOR_PRESETS } from '../lib/constants';
import { api } from '../lib/axios';
import { X, ArrowUp, ArrowDown, Plus, Trash2, Pencil, Lock, Check } from 'lucide-react';
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
  const [selectedPreset, setSelectedPreset] = useState<ColorPreset>(COLOR_PRESETS[0]);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<number[]>([]);

  // --- API Mutations ---

  // 1. Save Display Settings (Preferences)
  const settingsMutation = useMutation({
    mutationFn: async (data: { primaryButtons: number[]; secondaryButtons: number[] }) => {
      // Execute pending deletes
      if (pendingDeletes.length > 0) {
        await Promise.all(pendingDeletes.map(id => api.delete(`/categories/${id}`)));
      }
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
    mutationFn: async (data: { 
      name: string; 
      type: 'SYSTEM' | 'CUSTOM'; 
      priority?: number; 
      defaultList?: 'PRIMARY' | 'SECONDARY' | 'HIDDEN';
      bgColor?: string;
      borderColor?: string;
    }) => {
      return api.post('/categories', data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['categories', uid] });
      // Add to list automatically
      const newId = res.data.id;
      if (targetList === 'primary') {
        setPrimary(prev => [...prev, newId]);
      } else {
        setSecondary(prev => [...prev, newId]);
      }
      setNewLabel('');
      setSelectedPreset(COLOR_PRESETS[0]);
      showToast('カテゴリを作成しました', 'success');
      
      // Auto-save is disabled to prevent accidental changes
      // User must click "Save" to persist the layout changes
    },
    onError: (error: any) => {
        const msg = error.response?.data?.details || error.response?.data?.error || 'カテゴリの作成に失敗しました';
        showToast(msg, 'error');
    }
  });

  // 3. Update Category
  const updateMutation = useMutation({
    mutationFn: async (data: { 
      id: number; 
      name?: string; 
      defaultList?: 'PRIMARY' | 'SECONDARY' | 'HIDDEN';
      bgColor?: string;
      borderColor?: string;
    }) => {
      return api.put(`/categories/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', uid] });
      setEditCategory(null);
      setNewLabel('');
      setSelectedPreset(COLOR_PRESETS[0]);
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
      queryClient.invalidateQueries({ queryKey: ['categories', uid] });
      // Remove from lists
      const newPrimary = primary.filter(pid => pid !== id);
      const newSecondary = secondary.filter(sid => sid !== id);
      setPrimary(newPrimary);
      setSecondary(newSecondary);
      showToast('カテゴリを削除しました', 'success');
      
      // Auto-save is disabled
    },
    onError: () => {
        showToast('カテゴリの削除に失敗しました', 'error');
    }
  });

  // 5. Reorder Categories
  const reorderMutation = useMutation({
    mutationFn: async (orders: { id: number; priority: number; defaultList?: string }[]) => {
      // Execute pending deletes first
      if (pendingDeletes.length > 0) {
        await Promise.all(pendingDeletes.map(id => api.delete(`/categories/${id}`)));
      }
      return api.put('/categories/reorder', { orders });
    },
    onSuccess: () => {
      // Force refresh both queries for admin
      queryClient.invalidateQueries({ queryKey: ['categories', uid] });
      queryClient.invalidateQueries({ queryKey: ['settings', uid] });
      showToast('設定を保存しました', 'success');
      onClose();
    },
    onError: () => {
      showToast('順序の更新に失敗しました', 'error');
    }
  });

  // --- Handlers ---

  const handleSaveSettings = () => {
    if (isAdmin) {
      // Admin: Update Global Priorities (Category.priority)
      // 1. Gather all IDs in order: Primary -> Secondary -> Hidden
      
      // Filter out pending deletes
      const activeCategories = categories.filter(c => !pendingDeletes.includes(c.id));
      
      const hiddenIds = activeCategories
        .filter(c => !primary.includes(c.id) && !secondary.includes(c.id))
        .map(c => c.id);

      const allOrderedIds = [...primary, ...secondary, ...hiddenIds];

      // 2. Create update payload
      const updates = allOrderedIds.map((id, index) => {
        let defaultList = 'HIDDEN';
        if (primary.includes(id)) defaultList = 'PRIMARY';
        else if (secondary.includes(id)) defaultList = 'SECONDARY';
        
        return {
            id,
            priority: index * 10,
            defaultList
        };
      });

      // 3. Update Priorities & Visibility
      reorderMutation.mutate(updates);
    } else {
      // User: Save Personal Preferences
      settingsMutation.mutate({ 
        primaryButtons: primary, 
        secondaryButtons: secondary
      });
    }
  };
  
  // ...

  const handleCreateOrUpdate = () => {
    if (!newLabel.trim()) return;

    if (editCategory) {
      updateMutation.mutate({ 
        id: editCategory.id, 
        name: newLabel.trim(),
        bgColor: selectedPreset.bg,
        borderColor: selectedPreset.border
      });
    } else {
      const type = 'CUSTOM';
      const maxPriority = categories.length > 0 ? Math.max(...categories.map(c => c.priority || 0)) : 0;
      const defaultList = 'HIDDEN';
      createMutation.mutate({ 
        name: newLabel.trim(), 
        type, 
        priority: maxPriority + 10,
        defaultList,
        bgColor: selectedPreset.bg,
        borderColor: selectedPreset.border
      });
    }
  };

  const handleEditClick = (cat: Category) => {
    if (cat.type === 'SYSTEM') {
      showToast('システムカテゴリは編集できません', 'error');
      return;
    }
    setEditCategory(cat);
    setNewLabel(cat.name);
    const preset = COLOR_PRESETS.find(p => p.bg === cat.bgColor) || COLOR_PRESETS[0];
    setSelectedPreset(preset);
  };

  const handleDeleteClick = (id: number) => {
    // Prevent deleting SYSTEM categories - only admin in management screen can delete them
    const cat = categories.find(c => c.id === id);
    if (cat && cat.type === 'SYSTEM') {
      showToast('システムカテゴリは削除できません', 'error');
      return;
    }
    if (window.confirm('このカテゴリを削除しますか？\n（保存ボタンを押すと完全に削除されます）')) {
      setPendingDeletes(prev => [...prev, id]);
      
      // Remove from UI lists
      setPrimary(prev => prev.filter(pid => pid !== id));
      setSecondary(prev => prev.filter(sid => sid !== id));

      if (editCategory?.id === id) {
        handleCancelEdit();
      }
    }
  };

  const handleCancelEdit = () => {
    setEditCategory(null);
    setNewLabel('');
    setSelectedPreset(COLOR_PRESETS[0]);
  };

  const handleChangeVisibility = (catId: number, type: 'primary' | 'secondary' | 'hidden') => {
    const newPrimary = primary.filter(id => id !== catId);
    const newSecondary = secondary.filter(id => id !== catId);

    if (type === 'primary') newPrimary.push(catId);
    if (type === 'secondary') newSecondary.push(catId);

    setPrimary(newPrimary);
    setSecondary(newSecondary);
    
    // Auto-save removed
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

  const handleReorder = (listType: 'primary' | 'secondary', newList: number[]) => {
    if (listType === 'primary') {
      setPrimary(newList);
    } else {
      setSecondary(newList);
    }
    
    // Auto-save removed
  };

  if (!isOpen) return null;

  // Category Map for easy lookup
  const categoryMap = categories.reduce((acc, c) => ({ ...acc, [c.id]: c }), {} as Record<number, Category>);

  // Preview color logic
  // If we are editing/creating with a preset, show that preset.
  const previewStyle = selectedPreset 
    ? { className: `${selectedPreset.bg} ${selectedPreset.border} ${selectedPreset.text || 'text-gray-800'}` }
    : { className: getCategoryColor({ name: newLabel }).color };

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
                    {categories.filter(c => !pendingDeletes.includes(c.id)).map(cat => {
                        const isPrimary = primary.includes(cat.id);
                        const isSecondary = secondary.includes(cat.id);
                        const { color: rowColorClass } = getCategoryColor(cat);
                        
                        return (
                            <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-md text-sm font-medium ${rowColorClass}`}>
                                        {cat.name}
                                    </span>
                                    {cat.type === 'SYSTEM' && (
                                        <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">ADMIN</span>
                                    )}
                                </div>
                                <div className="flex gap-4 items-center">
                                     {/* Unified Visibility Control */}
                                     <div className="flex bg-white rounded-lg border overflow-hidden">
                                         {/* Main Button */}
                                         <button
                                             onClick={() => {
                                                 handleChangeVisibility(cat.id, 'primary');
                                             }}
                                             className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                                 isPrimary
                                                     ? 'bg-blue-100 text-blue-700' 
                                                     : 'hover:bg-gray-50 text-gray-600'
                                             }`}
                                         >
                                             メイン
                                         </button>
                                         <div className="w-px bg-gray-200"></div>
                                         
                                         {/* Sub Button */}
                                         <button
                                             onClick={() => {
                                                 handleChangeVisibility(cat.id, 'secondary');
                                             }}
                                             className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                                 isSecondary
                                                     ? 'bg-blue-100 text-blue-700' 
                                                     : 'hover:bg-gray-50 text-gray-600'
                                             }`}
                                         >
                                             サブ
                                         </button>
                                         <div className="w-px bg-gray-200"></div>

                                         {/* Hidden Button */}
                                         <button
                                             onClick={() => {
                                                 handleChangeVisibility(cat.id, 'hidden');
                                             }}
                                             className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                                 (!isPrimary && !isSecondary)
                                                     ? 'bg-gray-200 text-gray-800' 
                                                     : 'hover:bg-gray-50 text-gray-400'
                                             }`}
                                         >
                                             非表示
                                         </button>
                                     </div>
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
                                const { color } = getCategoryColor(cat);

                                return (
                                    <div key={catId} className="flex items-center justify-between p-2 border rounded bg-white">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-3 h-3 rounded-full ${color.split(' ')[0]}`}></span>
                                            <span className="font-medium">{cat.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => handleReorder('primary', moveItem(primary, index, 'up'))}
                                                disabled={index === 0}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleReorder('primary', moveItem(primary, index, 'down'))}
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
                                const { color } = getCategoryColor(cat);

                                return (
                                    <div key={catId} className="flex items-center justify-between p-2 border rounded bg-white">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-3 h-3 rounded-full ${color.split(' ')[0]}`}></span>
                                            <span className="font-medium">{cat.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => handleReorder('secondary', moveItem(secondary, index, 'up'))}
                                                disabled={index === 0}
                                                className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleReorder('secondary', moveItem(secondary, index, 'down'))}
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

                            {/* Color Selection */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">カラー設定</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_PRESETS.map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setSelectedPreset(preset)}
                                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${preset.bg} ${preset.border} ${
                                                selectedPreset.label === preset.label 
                                                ? 'ring-2 ring-blue-500 ring-offset-2 scale-110' 
                                                : 'hover:scale-105'
                                            }`}
                                            title={preset.label}
                                        >
                                            {selectedPreset.label === preset.label && (
                                                <Check size={14} className={preset.text || 'text-gray-800'} />
                                            )}
                                        </button>
                                    ))}
                                </div>
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
                                <div className={`flex items-center justify-center p-2 rounded-xl border-2 w-full h-16 shadow-sm ${previewStyle.className}`}>
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
                            {categories.filter(c => !pendingDeletes.includes(c.id)).map((cat) => {
                                const isSystem = cat.type === 'SYSTEM';
                                // Edit allowed if: (Admin) OR (Custom & User)
                                const canEdit = !isSystem; 
                                const { color: listColor } = getCategoryColor(cat);

                                return (
                                    <div key={cat.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${listColor.split(' ')[0]}`}></div>
                                            <span className="font-medium">{cat.name}</span>
                                            {isSystem && <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">ADMIN</span>}
                                        </div>
                                        <div className="flex gap-1 items-center">
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
                disabled={settingsMutation.isPending || reorderMutation.isPending}
            >
                {settingsMutation.isPending || reorderMutation.isPending ? '保存中...' : '設定を保存'}
            </button>
        </div>
      </div>
    </div>
  );
};
