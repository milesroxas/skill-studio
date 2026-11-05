/** One line of feedback at the foot of the window, gone after a moment. */
import { cn } from '../lib/utils.ts'

export function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-toast max-w-[min(56ch,calc(100vw-32px))] -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-center text-ui text-pretty text-primary-foreground shadow-popover transition-[opacity,translate] duration-200 ease-out',
        message ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
    >
      {message}
    </div>
  )
}
