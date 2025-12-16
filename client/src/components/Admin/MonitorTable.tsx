import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/axios';
import { Activity, Clock, Pencil, Download } from 'lucide-react';
import { getCategoryColor } from '../../lib/constants';
import type { Category } from '../../lib/constants';
import { EditLogModal } from '../EditLogModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MonitorLog {
  id: number;
  userId: number;
  user: { uid: string; name: string };
  categoryId: number;
  category: { name: string };
  categoryNameSnapshot: string;
  startTime: string;
  duration?: number;
}

interface MonitorTableProps {
  selectedUsers?: number[];
  timeRange?: 'daily' | 'weekly' | 'last30days' | 'monthly' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
}

export const MonitorTable = ({ selectedUsers = [], timeRange = 'daily', customStartDate, customEndDate }: MonitorTableProps) => {
  const [editingLog, setEditingLog] = useState<MonitorLog | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['monitorLogs', selectedUsers, timeRange, customStartDate, customEndDate],
    queryFn: async () => {
      const params: any = { range: timeRange };
      if (selectedUsers.length > 0) {
        params.userIds = selectedUsers.join(',');
      }
      
      if (timeRange === 'last30days') {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        params.range = 'custom';
        params.start = start.toISOString().slice(0, 10);
        params.end = end.toISOString().slice(0, 10);
      } else if (timeRange === 'custom' && customStartDate && customEndDate) {
        params.start = customStartDate;
        params.end = customEndDate;
      }
      
      const res = await api.get<MonitorLog[]>('/logs/monitor', { params });
      return res.data;
    },
    enabled: selectedUsers.length > 0,
    refetchInterval: 30000, // 30秒更新
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<Category[]>('/categories');
      // Assign colors on frontend
      return res.data.map(c => ({
        ...c,
        ...getCategoryColor(c)
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case 'daily': return '直近24時間';
      case 'weekly': return '直近7日間';
      case 'last30days': return '直近30日間';
      case 'monthly': return '年別（直近12ヶ月）';
      case 'custom': return `${customStartDate} ~ ${customEndDate}`;
      default: return '直近24時間';
    }
  };

  const handleDownloadPdf = async () => {
    if (!logs || logs.length === 0) {
      alert('データがありません');
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Load Japanese font (IPAex Gothic)
      const fontUrl = '/fonts/ipaexg.ttf';
      const fontName = 'IPAexGothic';
      
      try {
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error('Font download failed');
        const buffer = await response.arrayBuffer();
        
        // Convert ArrayBuffer to Base64
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const fontBase64 = window.btoa(binary);
        
        doc.addFileToVFS('ipaexg.ttf', fontBase64);
        doc.addFont('ipaexg.ttf', fontName, 'normal');
        doc.setFont(fontName);
      } catch (fontError) {
        console.warn('Failed to load Japanese font, text may be garbled:', fontError);
      }

      // Title
      doc.setFontSize(16);
      doc.text(`Activity Log (${getTimeRangeLabel()})`, 14, 20);
      
      const tableColumn = ["Time", "User", "UID", "Task", "Duration"];
      const tableRows: any[] = [];

      logs.forEach(log => {
        const logData = [
          new Date(log.startTime).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          log.user.name,
          log.user.uid,
          log.categoryNameSnapshot,
          log.duration ? `${Math.floor(log.duration / 60)}m` : 'Running'
        ];
        tableRows.push(logData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        styles: { 
          fontSize: 8,
          font: fontName, // Use the custom font
          fontStyle: 'normal'
        }, 
        headStyles: { 
            fillColor: [59, 130, 246],
            font: fontName // Ensure header uses font too
        }, 
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`monitor_logs_${dateStr}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('PDFの作成に失敗しました');
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <Activity size={20} />
            アクティビティ ({getTimeRangeLabel()})
          </h3>
          <span className="text-xs text-gray-400">{logs?.length || 0} records</span>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto overflow-x-auto min-h-0 scroll-container"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
        >
          <style>{`
            .scroll-container::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            .scroll-container::-webkit-scrollbar-track {
              background: #f1f5f9;
              border-radius: 4px;
            }
            .scroll-container::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 4px;
              transition: background 0.2s;
            }
            .scroll-container::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
            .scroll-container::-webkit-scrollbar-corner {
              background: #f1f5f9;
            }
          `}</style>
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-gray-500 bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="p-3 font-medium">Time</th>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Task</th>
                <th className="p-3 font-medium text-right">Duration</th>
                <th className="p-3 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && selectedUsers.length > 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">読み込み中...</td></tr>
              )}
              
              {selectedUsers.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">ユーザーを選択してください</td></tr>
              )}

              {selectedUsers.length > 0 && !isLoading && logs?.map((log) => {
                // 簡易的に色を取得 (カテゴリが存在すればその設定を使用、なければ名前から推測)
                const currentCat = categories?.find(c => c.name === log.categoryNameSnapshot);
                const { color: bgClass } = getCategoryColor(currentCat || { name: log.categoryNameSnapshot });
                
                // bg-xxx-100 -> text-xxx-600 のような簡易変換
                const color = bgClass.includes('slate-800') 
                    ? 'text-slate-700'
                    : bgClass.split(' ')[0].replace('bg-', 'text-').replace('-100', '-600').replace('-50', '-500');
                
                const isLongDuration = !log.duration && (new Date().getTime() - new Date(log.startTime).getTime()) > 1000 * 60 * 60 * 3; // 3時間以上経過

                return (
                  <tr key={log.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="p-3 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.startTime).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{log.user.name}</div>
                      <div className="text-xs text-gray-400">{log.user.uid}</div>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${color}`}>
                        {log.categoryNameSnapshot}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">
                      {log.duration ? (
                         <span>{Math.floor(log.duration / 60)}m</span>
                      ) : (
                         <span className={`inline-flex items-center gap-1 ${isLongDuration ? 'text-red-500 font-bold animate-pulse' : 'text-green-600'}`}>
                           <Clock size={12} />
                           Running
                         </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setEditingLog(log)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="修正"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {selectedUsers.length > 0 && !isLoading && logs?.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">履歴がありません</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">レポート出力</h4>
            <button
              onClick={handleDownloadPdf}
              disabled={!logs || logs.length === 0}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                !logs || logs.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
              title={!logs || logs.length === 0 ? "データがありません" : "PDFとしてダウンロード"}
            >
              <Download size={16} />
              PDFダウンロード
            </button>
          </div>
        </div>
      </div>

      <EditLogModal
        isOpen={!!editingLog}
        onClose={() => setEditingLog(null)}
        mode="edit"
        log={editingLog}
        categories={categories || []}
      />
    </>
  );
};
