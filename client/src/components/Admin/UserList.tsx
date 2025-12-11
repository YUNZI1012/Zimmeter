import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Pencil, UserCheck, Shield, ShieldAlert, Ban } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface User {
  id: number;
  uid: string;
  name: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED' | 'DELETED';
  hourlyRate: number;
}

export const UserList = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<User[]>('/users');
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; role: string; hourlyRate: number }) => {
      return api.put(`/users/${data.id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      showToast(`ユーザー ${variables.name} の情報を更新しました`, 'success');
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (data: { id: number; status: string }) => {
      return api.patch(`/users/${data.id}/status`, { status: data.status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(`ステータスを ${variables.status} に変更しました`, 'success');
    },
  });

  const handleStatusChange = (id: number, currentStatus: string) => {
    let newStatus = '';
    if (currentStatus === 'ACTIVE') newStatus = 'DISABLED';
    else if (currentStatus === 'DISABLED') newStatus = 'ACTIVE';
    
    if (newStatus) {
      if (window.confirm(`ユーザーのステータスを ${newStatus} に変更しますか？`)) {
        statusMutation.mutate({ id, status: newStatus });
      }
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm('本当にこのユーザーを削除(DELETED)しますか？\nこの操作は取り消せません（物理削除はされませんが、ログイン不可となります）。')) {
      statusMutation.mutate({ id, status: 'DELETED' });
    }
  };

  if (isLoading) return <div className="p-4">Loading users...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-gray-700 flex items-center gap-2">
          <UserCheck size={20} />
          ユーザー管理
        </h3>
        <span className="text-xs text-gray-400">{users?.length} users</span>
      </div>
      
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-gray-500 bg-gray-50 border-b sticky top-0 z-10">
            <tr>
              <th className="p-3 font-medium">UID / Name</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Rate</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users?.map((user) => (
              <tr key={user.id} className="hover:bg-blue-50/50 transition-colors">
                <td className="p-3">
                  <div className="font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{user.uid}</div>
                </td>
                <td className="p-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                    user.status === 'DISABLED' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="p-3 font-mono text-gray-600">
                  ¥{user.hourlyRate.toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setEditingUser(user)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="編集"
                    >
                      <Pencil size={16} />
                    </button>
                    
                    {user.status !== 'DELETED' && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(user.id, user.status)}
                          className={`p-1.5 rounded transition-colors ${
                            user.status === 'ACTIVE' 
                              ? 'text-gray-400 hover:text-yellow-600 hover:bg-yellow-50' 
                              : 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                          }`}
                          title={user.status === 'ACTIVE' ? '無効化 (Disable)' : '有効化 (Activate)'}
                        >
                          {user.status === 'ACTIVE' ? <Shield size={16} /> : <ShieldAlert size={16} />}
                        </button>
                        <button 
                          onClick={() => handleDelete(user.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="削除 (Delete)"
                        >
                          <Ban size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-bold mb-4">ユーザー編集</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              updateMutation.mutate({
                id: editingUser.id,
                name: formData.get('name') as string,
                role: formData.get('role') as string,
                hourlyRate: Number(formData.get('hourlyRate')),
              });
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UID</label>
                  <input type="text" value={editingUser.uid} disabled className="w-full p-2 bg-gray-100 rounded border border-gray-200 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input name="name" type="text" defaultValue={editingUser.name} required className="w-full p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select name="role" defaultValue={editingUser.role} className="w-full p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
                  <input name="hourlyRate" type="number" defaultValue={editingUser.hourlyRate} className="w-full p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">キャンセル</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
