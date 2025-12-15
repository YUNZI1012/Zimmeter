import { Square } from 'lucide-react';

interface StopButtonProps {
  isActive: boolean;
  onStop: () => void;
  className?: string;
}

export const StopButton = ({ isActive, onStop, className = "" }: StopButtonProps) => {
  if (!isActive) return null;

  return (
    <button
      onClick={onStop}
      className={`relative group bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl ${className}`}
      title="業務停止"
    >
      <div className="flex flex-col items-center justify-center p-4">
        <Square size={24} className="mb-1" />
        <span className="text-xs font-medium">停止</span>
      </div>
      <div className="absolute inset-0 rounded-xl bg-red-400 opacity-0 group-hover:opacity-20 transition-opacity duration-200"></div>
    </button>
  );
};
