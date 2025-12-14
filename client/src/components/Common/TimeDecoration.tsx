import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export const TimeDecoration = () => {
  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 to 20 inclusive
  
  const getHourStatus = (hour: number) => {
    const now = new Date();
    const currentHourNum = now.getHours();
    
    if (hour < currentHourNum) return 'past';
    if (hour === currentHourNum) return 'current';
    return 'future';
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg z-30">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between min-w-0">
          {/* 左侧営業時間标签 */}
          <div className="flex items-center gap-2 text-sm text-gray-600 flex-shrink-0">
            <Clock size={16} />
            <span className="font-medium whitespace-nowrap">営業時間</span>
          </div>
          
          {/* 中央时间区域 - 占据剩余空间并可滚动 */}
          <div className="flex-1 min-w-0 mx-2 sm:mx-4">
            <div className="overflow-x-auto">
              <div className="flex items-center justify-center gap-1 min-w-max py-1">
                {hours.map((hour) => {
                  const status = getHourStatus(hour);
                  const baseClasses = "px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs font-medium transition-all duration-300 whitespace-nowrap flex-shrink-0";
                  
                  let statusClasses = "";
                  if (status === 'past') {
                    statusClasses = "bg-gray-100 text-gray-400";
                  } else if (status === 'current') {
                    statusClasses = "bg-blue-500 text-white shadow-md animate-pulse";
                  } else {
                    statusClasses = "bg-gray-50 text-gray-600 border border-gray-200";
                  }
                  
                  return (
                    <div
                      key={hour}
                      className={`${baseClasses} ${statusClasses}`}
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* 右侧営業中状态 */}
          <div className="text-sm text-gray-500 flex-shrink-0 whitespace-nowrap">
            {currentHour >= 8 && currentHour <= 20 ? '営業中' : '営業外'}
          </div>
        </div>
      </div>
    </div>
  );
};
