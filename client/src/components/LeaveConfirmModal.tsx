import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { LogOut, X } from 'lucide-react';

interface LeaveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LeaveConfirmModal = ({ isOpen, onClose, onConfirm }: LeaveConfirmModalProps) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all border-2 border-orange-100">
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-orange-100 rounded-full flex items-center justify-center mb-4 text-orange-600">
                    <LogOut size={32} />
                  </div>
                  
                  <Dialog.Title as="h3" className="text-xl font-bold leading-6 text-gray-900 mb-2">
                    退社しますか？
                  </Dialog.Title>

                  <p className="text-sm text-gray-500 mb-8">
                    本日の業務を終了し、退社記録を保存します。<br/>
                    この操作は後から修正可能です。
                  </p>

                  <div className="flex gap-3 w-full">
                    <button
                      type="button"
                      className="flex-1 inline-flex justify-center items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition-colors"
                      onClick={onClose}
                    >
                      <X size={18} />
                      <span>キャンセル</span>
                    </button>
                    <button
                      type="button"
                      className="flex-1 inline-flex justify-center items-center gap-2 rounded-lg border border-transparent bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 transition-colors shadow-lg hover:shadow-xl"
                      onClick={() => {
                        onConfirm();
                        onClose();
                      }}
                    >
                      <LogOut size={18} />
                      <span>退社する</span>
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
