import { useState } from 'react';
import { UserList } from '../components/Admin/UserList';
import { ProjectManagement } from '../components/Admin/ProjectManagement';
import { MonitorTable } from '../components/Admin/MonitorTable';
import { UserMultiSelectDropdown } from '../components/Admin/UserMultiSelectDropdown';
import { ArrowLeft, LayoutDashboard, ChevronDown, ChevronUp, Users, FolderOpen, Calendar } from 'lucide-react';
import { AdminWorkLogCharts } from '../components/Admin/AdminCharts';
import { TimeDecoration } from '../components/Common/TimeDecoration';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/axios';

interface AdminPageProps {
  onBack: () => void;
}

type TimeRange = 'daily' | 'weekly' | 'last30days' | 'monthly' | 'custom';

export const AdminPage = ({ onBack }: AdminPageProps) => {
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isProjectManagementOpen, setIsProjectManagementOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  
  const minDate = new Date(today);
  minDate.setFullYear(today.getFullYear() - 10);
  const minDateString = minDate.toISOString().slice(0, 10);
  
  const [customStartDate, setCustomStartDate] = useState(weekAgo.toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(today.toISOString().slice(0, 10));

  // Fetch all users for selection
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

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
              Zimmeter Admin v2
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             {/* Admin specific header actions */}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-6 space-y-6">
        {/* User and Time Range Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* User Selection */}
            <div className="flex-1 min-w-[300px]">
              <UserMultiSelectDropdown
                users={users || []}
                selectedUsers={selectedUsers}
                onSelectionChange={setSelectedUsers}
                placeholder="ユーザーを選択"
              />
            </div>

            {/* Time Range Selection */}
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-600" />
              <label className="text-sm font-medium text-gray-700">時間範囲</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setTimeRange('daily')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    timeRange === 'daily'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  日別（直近24時間）
                </button>
                <button
                  onClick={() => setTimeRange('weekly')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    timeRange === 'weekly'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  週別（直近7日間）
                </button>
                <button
                  onClick={() => setTimeRange('last30days')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    timeRange === 'last30days'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  月別（直近30日）
                </button>
                <button
                  onClick={() => setTimeRange('monthly')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    timeRange === 'monthly'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  年別（直近12ヶ月）
                </button>
              </div>
            </div>
            
            {/* Custom Date Range Inputs */}
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${timeRange === 'custom' ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}>
              <input
                type="date"
                value={customStartDate}
                min={minDateString}
                onFocus={() => setTimeRange('custom')}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setTimeRange('custom');
                }}
                className={`border rounded px-2 py-1 text-xs text-gray-700 ${timeRange === 'custom' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}`}
              />
              <span className="text-gray-400 text-xs">～</span>
              <input
                type="date"
                value={customEndDate}
                min={minDateString}
                onFocus={() => setTimeRange('custom')}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setTimeRange('custom');
                }}
                className={`border rounded px-2 py-1 text-xs text-gray-700 ${timeRange === 'custom' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}`}
              />
            </div>
          </div>
        </div>

        {/* Three Column Layout for Monitor and Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[600px]">
          {/* Monitor Column */}
          <div className="min-h-[500px] lg:min-h-0 h-full">
            <MonitorTable 
              selectedUsers={selectedUsers}
              timeRange={timeRange}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
          </div>

          {/* Bar Chart Column */}
          <div className="min-h-[500px] lg:min-h-0 h-full">
            <AdminWorkLogCharts 
              selectedUsers={selectedUsers}
              timeRange={timeRange}
              chartType="bar"
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
          </div>

          {/* Pie Chart Column */}
          <div className="min-h-[500px] lg:min-h-0 h-full">
            <AdminWorkLogCharts 
              selectedUsers={selectedUsers}
              timeRange={timeRange}
              chartType="pie"
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
          </div>
        </div>

        {/* Project Management - Collapsible Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setIsProjectManagementOpen(!isProjectManagementOpen)}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-gray-600" />
              <h3 className="font-bold text-gray-700">プロジェクト管理</h3>
              <span className="text-xs text-gray-400 bg-blue-100 text-blue-700 px-2 py-1 rounded">最高権限</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">クリックして{isProjectManagementOpen ? '閉じる' : '開く'}</span>
              {isProjectManagementOpen ? (
                <ChevronUp size={20} className="text-gray-600" />
              ) : (
                <ChevronDown size={20} className="text-gray-600" />
              )}
            </div>
          </button>
          
          {isProjectManagementOpen && (
            <div className="h-96 overflow-hidden">
              <ProjectManagement />
            </div>
          )}
        </div>

        {/* User Management - Collapsible Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setIsUserManagementOpen(!isUserManagementOpen)}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Users size={20} className="text-gray-600" />
              <h3 className="font-bold text-gray-700">ユーザー管理</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">クリックして{isUserManagementOpen ? '閉じる' : '開く'}</span>
              {isUserManagementOpen ? (
                <ChevronUp size={20} className="text-gray-600" />
              ) : (
                <ChevronDown size={20} className="text-gray-600" />
              )}
            </div>
          </button>
          
          {isUserManagementOpen && (
            <div className="h-96 overflow-hidden">
              <UserList />
            </div>
          )}
        </div>
      </main>

      <TimeDecoration />
    </div>
  );
};
