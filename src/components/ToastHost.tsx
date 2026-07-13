import { useData } from '../store/DataContext'

/** Renders the current save/sync toast (verified success or error). */
export function ToastHost() {
  const { toast } = useData()
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div
        className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
          toast.ok ? 'bg-accent-2 text-black' : 'bg-red-500 text-white'
        }`}
      >
        {toast.msg}
      </div>
    </div>
  )
}
