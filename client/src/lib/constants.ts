// client/src/lib/constants.ts

export type CategoryId = number;

export interface Category {
  id: CategoryId;
  name: string;
  type: 'SYSTEM' | 'CUSTOM';
  priority: number;
  defaultList?: 'PRIMARY' | 'SECONDARY' | 'HIDDEN';
  bgColor?: string;
  borderColor?: string;
  // UI helper props (derived)
  color?: string; 
}

export interface ColorPreset {
  bg: string;
  border: string;
  label: string;
  text?: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { bg: 'bg-white', border: 'border-gray-200', label: '白' },
  { bg: 'bg-blue-100', border: 'border-blue-300', label: '青' },
  { bg: 'bg-green-100', border: 'border-green-300', label: '緑' },
  { bg: 'bg-orange-100', border: 'border-orange-300', label: 'オレンジ' },
  { bg: 'bg-purple-100', border: 'border-purple-300', label: '紫' },
  { bg: 'bg-pink-100', border: 'border-pink-300', label: 'ピンク' },
  { bg: 'bg-gray-100', border: 'border-gray-300', label: 'グレー' },
  { bg: 'bg-teal-50', border: 'border-teal-200', label: 'ティール' },
  { bg: 'bg-slate-800', border: 'border-slate-800', text: 'text-white', label: '黒' },
];

// UI Color Mapping Helper
export const getCategoryColor = (category: Partial<Category>): { color: string, borderColor?: string } => {
  // DB保存の設定があればそれを使用
  if (category.bgColor) {
     const border = category.borderColor || 'border-transparent';
     // 黒系などの特別扱い（テキスト色）
     if (category.bgColor.includes('slate-800')) {
         return { color: `${category.bgColor} text-white` };
     }
     return { color: `${category.bgColor} ${border}` };
  }

  const name = category.name || '';
  if (name.includes('メール') || name.includes('チャット')) return { color: 'bg-blue-100 border-blue-300' };
  if (name.includes('実装') || name.includes('検証'))       return { color: 'bg-slate-800 text-white' };
  if (name.includes('会議'))       return { color: 'bg-orange-100 border-orange-300' };
  if (name.includes('資料'))       return { color: 'bg-green-100 border-green-300' };
  if (name.includes('商談') || name.includes('外出'))       return { color: 'bg-purple-100 border-purple-300' };
  if (name.includes('電話'))       return { color: 'bg-pink-100 border-pink-300' };
  if (name.includes('事務'))       return { color: 'bg-gray-100 border-gray-300' };
  if (name.includes('休憩'))       return { color: 'bg-teal-50 border-teal-200' };
  if (name.includes('離席') || name.includes('移動'))       return { color: 'bg-gray-300 border-gray-400' };
  
  return { color: 'bg-white border-gray-200' }; // Default
};

// Role Presets (UI display priority)
// DBのUserSettingがない場合のデフォルト表示順序として使用
export const DEFAULT_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

