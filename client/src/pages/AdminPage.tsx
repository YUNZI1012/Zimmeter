import { useState } from 'react';
import { UserList } from '../components/Admin/UserList';
import { MonitorTable } from '../components/Admin/MonitorTable';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { AdminWorkLogCharts } from '../components/Admin/AdminWorkLogCharts';
import { TimeDecoration } from '../components/Common/TimeDecoration';

interface AdminPageProps {
  onBack: () => void;
}

export const AdminPage = ({ onBack }: AdminPageProps) => {
  const [rightTab, setRightTab] = useState<'monitor' | 'graph'>('monitor');
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-slate-900 text-white shadow-lg px-4 lg:px-6 h-16 flex items-center sticky top-0 z-20 whitespace-nowrap">
        <div className="flex justify-between items-center container mx-auto h-full">
          <div className="flex items-center gap-4 shrink-0">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-300 hover:text-white"
              title="戻る"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg lg:text-xl font-bold tracking-tight flex items-center gap-2">
              <LayoutDashboard className="text-blue-400" size={20} />
              Zimmeter Admin
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             {/* Admin specific header actions */}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[calc(100vh-120px)]">
          <div className="h-[600px] lg:h-full overflow-hidden flex flex-col">
            <UserList />
          </div>
          <div className="h-[600px] lg:h-full overflow-hidden flex flex-col">
            <div className="border-b border-gray-200 mb-2 flex items-center justify-between px-2 pt-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRightTab('monitor')}
                  className={`${rightTab === 'monitor' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'} px-2 pb-1 text-sm font-medium`}
                >
                  モニター
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('graph')}
                  className={`${rightTab === 'graph' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'} px-2 pb-1 text-sm font-medium`}
                >
                  グラフ
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {rightTab === 'monitor' ? (
                <MonitorTable />
              ) : (
                <AdminWorkLogCharts />
              )}
            </div>
          </div>
        </div>
      </main>

      <TimeDecoration />
    </div>
  );
};
