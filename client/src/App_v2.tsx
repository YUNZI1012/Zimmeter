import { useState, useEffect, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Download, History, AlertCircle, Pencil } from 'lucide-react';
import { getCategoryColor } from './lib/constants';
import type { Category } from './lib/constants';
import { api } from './lib/axios';
import { TaskButton } from './components/TaskButton';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { EditLogModal } from './components/EditLogModal';
import { LoginModal } from './components/LoginModal';
import { StatusGuard } from './components/Common/StatusGuard';
import { TimeDecoration } from './components/Common/TimeDecoration';
import { useUserStatus } from './hooks/useUserStatus';
import { useTimer } from './hooks/useTimer';
import { AdminPage } from './pages/AdminPage';
import { ToastProvider, useToast } from './context/ToastContext';

const queryClient = new QueryClient();

// Types for API responses
interface WorkLog {
  id: number;
  userId: number; 
  categoryId: number; // Int
  categoryNameSnapshot: string; 
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
}

interface UserSettings {
  userId: number;
  preferences: {
    primaryButtons?: number[]; // IDs
    secondaryButtons?: number[];
  };
}

function ZimmeterApp() {
  const queryClient = useQueryClient();
  const [uid, setUid] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showIdleAlert, setShowIdleAlert] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'admin'>('main');
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [isAddingLog, setIsAddingLog] = useState(false);

  const { data: userStatus } = useUserStatus(!!uid);
  const { showToast } = useToast();
  const prevUserRef = useRef<typeof userStatus>(undefined);

  // Monitor User Info Changes
  useEffect(() => {
    if (!userStatus) return;
    
    if (prevUserRef.current) {
        const prev = prevUserRef.current;
        // Only if it's the same user session
        if (prev.id === userStatus.id) {
            const hasChanged = 
                prev.name !== userStatus.name || 
                prev.role !== userStatus.role || 
                prev.hourlyRate !== userStatus.hourlyRate;
            
            if (hasChanged) {
                showToast('管理者により情報が更新されました', 'info');
            }
        }
    }
    prevUserRef.current = userStatus;
  }, [userStatus, showToast]);

  // Initialize UID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pUid = params.get('uid');
    if (pUid) {
      setUid(pUid);
      localStorage.setItem('zimmeter_uid', pUid);
    } else {
      const stored = localStorage.getItem('zimmeter_uid');
      if (stored) setUid(stored);
      else setShowLoginModal(true);
    }
  }, []);

  const handleLogin = (username: string) => {
    setUid(username);
    localStorage.setItem('zimmeter_uid', username);
    setShowLoginModal(false);
  };

  // 1. Fetch Categories
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<Category[]>('/categories');
      // Assign colors on frontend
      return res.data.map(c => ({
        ...c,
        ...getCategoryColor(c)
      }));
    },
    enabled: !!uid, 
    refetchInterval: 3000,
  });

  // 2. Fetch Active Log
  const activeLogQuery = useQuery({
    queryKey: ['activeLog', uid],
    queryFn: async () => {
      if (!uid) return null;
      const res = await api.get<WorkLog | null>(`/logs/active`);
      return res.data;
    },
    enabled: !!uid,
    refetchInterval: 3000,
  });

  // Idle Alert
  useEffect(() => {
    if (activeLogQuery.isLoading) return;
    if (activeLogQuery.data) {
        setShowIdleAlert(false);
        return;
    }
    const timer = setTimeout(() => setShowIdleAlert(true), 30000);
    return () => clearTimeout(timer);
  }, [activeLogQuery.data, activeLogQuery.isLoading]);

  // 3. Fetch Settings
  const settingsQuery = useQuery({
    queryKey: ['settings', uid],
    queryFn: async () => {
      if (!uid) return null;
      try {
        const res = await api.get<UserSettings | null>(`/settings`);
        return res.data;
      } catch { return null; }
    },
    enabled: !!uid,
    refetchInterval: 3000,
  });

  // 4. Fetch History
  const historyQuery = useQuery({
      queryKey: ['history', uid],
      queryFn: async () => {
          if (!uid) return [];
          const res = await api.get<WorkLog[]>(`/logs/history`);
          return res.data;
      },
      enabled: !!uid && showHistory,
  });

  // Merge Categories & Settings
  const { primaryButtons, secondaryButtons } = useMemo(() => {
    const allCats = categoriesQuery.data || [];
    const prefs = settingsQuery.data?.preferences || {};
    
    let primaryIds = prefs.primaryButtons || [];
    let secondaryIds = prefs.secondaryButtons || [];

    const sorted = [...allCats].sort((a, b) => a.priority - b.priority);

    // If no settings (or reset), use default logic (based on defaultList)
    if (primaryIds.length === 0 && secondaryIds.length === 0) {
       // defaultList='PRIMARY' -> Main
       // defaultList='HIDDEN'  -> Hidden
       // Otherwise -> Secondary
       primaryIds = sorted.filter(c => c.defaultList === 'PRIMARY').map(c => c.id);
       secondaryIds = sorted
         .filter(c => c.defaultList !== 'PRIMARY' && c.defaultList !== 'HIDDEN')
         .map(c => c.id);
    }

    return {
        // ID順序を維持するために map を使用し、存在しないものは除外する
        primaryButtons: primaryIds
            .map(id => allCats.find(c => c.id === id))
            .filter((c) => !!c) as Category[],
            
        secondaryButtons: secondaryIds
            .map(id => allCats.find(c => c.id === id))
            .filter((c) => !!c) as Category[],
    };
  }, [categoriesQuery.data, settingsQuery.data]);

  const switchMutation = useMutation({
    mutationFn: async (data: { categoryId: number }) => {
      return api.post('/logs/switch', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeLog', uid] });
      queryClient.invalidateQueries({ queryKey: ['history', uid] });
    },
  });

  const handleTaskSwitch = (catId: number) => {
    setShowIdleAlert(false);

    // Prevent consecutive clicks
    if (activeLogQuery.data?.categoryId === catId) return;

    switchMutation.mutate({ categoryId: catId });
  };

  const { formattedTime } = useTimer(activeLogQuery.data?.startTime ?? null);

  if (!uid && !showLoginModal) return <div className="p-10">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-800 font-sans">
        <StatusGuard />
        {/* Header */}
        <header className="bg-white shadow px-4 lg:px-6 h-16 flex justify-between items-center sticky top-0 z-20 whitespace-nowrap">
            <div className="flex items-center gap-2 lg:gap-8 overflow-hidden">
                <div className="flex items-center gap-2 lg:gap-4 shrink-0">
                    <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-gray-700 hidden sm:block">Zimmeter</h1>
                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-500">
                        <span className="truncate max-w-[100px] sm:max-w-none">{uid}</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg shrink-0">
                    <button
                        onClick={() => setActiveTab('main')}
                        className={`px-3 lg:px-4 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                            activeTab === 'main' 
                                ? 'bg-white text-gray-800 shadow-sm' 
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        メイン
                    </button>
                    {userStatus?.role === 'ADMIN' && (
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`px-3 lg:px-4 py-1.5 rounded-md text-xs lg:text-sm font-medium transition-colors ${
                                activeTab === 'admin' 
                                    ? 'bg-white text-gray-800 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            管理画面
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex gap-1 lg:gap-2 shrink-0">
                <button 
                    onClick={() => setShowHistory(!showHistory)}

                    className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${showHistory ? 'bg-blue-50 text-blue-600' : 'text-gray-500'}`}
                    title="履歴"
                >
                    <History size={20} />
                </button>
                <a 
                    href={`${api.defaults.baseURL}/export/csv`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="CSVエクスポート"
                >
                    <Download size={20} />
                </a>
                <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="設定"
                >
                    <Settings size={20} />
                </button>
            </div>
        </header>

        <main className="container mx-auto p-4 md:p-6 pb-32">
            {activeTab === 'admin' ? (
                <AdminPage onBack={() => setActiveTab('main')} />
            ) : (
                <>
                    {/* Status Bar */}
                    <div className="bg-white rounded-2xl shadow-sm p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 border border-gray-100">
                        <div className="flex items-center gap-4 w-full">
                            <div className={`w-3 h-3 rounded-full animate-pulse ${activeLogQuery.data ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                            <div>
                                <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">Current Task</p>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-3xl font-bold text-gray-800">
                                        {activeLogQuery.data ? activeLogQuery.data.categoryNameSnapshot : '計測待機中'}
                                    </h2>
                                    {activeLogQuery.data && (
                                        <button
                                            onClick={() => setEditingLog(activeLogQuery.data)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                            title="修正"
                                        >
                                            <Pencil size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="text-right w-full md:w-auto">
                            <div className="text-5xl font-mono font-light tracking-tight text-slate-700 tabular-nums">
                                {formattedTime}
                            </div>
                        </div>
                    </div>

                    {/* Primary Buttons */}
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Main Actions</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {primaryButtons.map(cat => (
                                <TaskButton
                                    key={cat.id}
                                    category={cat}
                                    isActive={activeLogQuery.data?.categoryId === cat.id}
                                    onClick={() => handleTaskSwitch(cat.id)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Secondary Buttons */}
                    {secondaryButtons.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Other Actions</h3>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {secondaryButtons.map(cat => (
                                    <TaskButton
                                        key={cat.id}
                                        category={cat}
                                        isActive={activeLogQuery.data?.categoryId === cat.id}
                                        onClick={() => handleTaskSwitch(cat.id)}
                                        className="h-16 text-sm"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </main>

        <HistoryModal
            isOpen={showHistory}
            onClose={() => setShowHistory(false)}
            logs={historyQuery.data || []}
            onEdit={(log) => setEditingLog(log)}
            onAdd={() => setIsAddingLog(true)}
            mergedCategories={categoriesQuery.data?.reduce((acc, c) => ({...acc, [c.id]: c}), {}) || {}}
        />

        <EditLogModal
            isOpen={!!editingLog}
            onClose={() => setEditingLog(null)}
            mode="edit"
            log={editingLog}
            categories={categoriesQuery.data || []}
        />

        <EditLogModal
            isOpen={isAddingLog}
            onClose={() => setIsAddingLog(false)}
            mode="create"
            log={null}
            categories={categoriesQuery.data || []}
        />

        {isSettingsOpen && (
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                uid={uid}
                categories={categoriesQuery.data || []}
                initialPrimary={primaryButtons.map(c => c.id)}
                initialSecondary={secondaryButtons.map(c => c.id)}
            />
        )}

        <LoginModal 
            isOpen={showLoginModal}
            onSubmit={handleLogin}
        />

        {showIdleAlert && !activeLogQuery.data && !showLoginModal && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 pointer-events-none transition-opacity duration-500">
                <div className="bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center pointer-events-auto animate-bounce border-2 border-red-100">
                    <div className="bg-red-100 p-3 rounded-full mb-3 text-red-500">
                        <AlertCircle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">業務項目を選択してください。</h3>
                    <p className="text-gray-500 text-sm">計測が開始されていません</p>
                    <button 
                        onClick={() => setShowIdleAlert(false)}
                        className="mt-4 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium"
                    >
                        閉じる
                    </button>
                </div>
            </div>
        )}

        <TimeDecoration />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ZimmeterApp />
      </ToastProvider>
    </QueryClientProvider>
  );
}
