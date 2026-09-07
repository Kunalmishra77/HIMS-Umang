"use client"

import { useEffect, useState } from "react"
import { Play, Pause, SkipForward, RotateCcw, Presentation, Building2, Video } from "lucide-react"
import { usePatientLiveStore, type LiveMode } from "@/store/usePatientLiveStore"
import { cn } from "@/lib/utils"

function Btn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-200 hover:bg-white/10 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
      {children}
    </button>
  )
}

function ModeBtn({ icon: Icon, label, active, onSelect }: { icon: React.ElementType; label: string; active: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} title={label} aria-pressed={active}
      className={cn("h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-all", active ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/10")}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

/**
 * Presenter control for demoing the live journey to an audience.
 * Switch between in-person / video, auto-play or step through each stage.
 */
export function DemoControls() {
  const [auto, setAuto] = useState(true)
  const stage = usePatientLiveStore(s => s.stage)
  const mode = usePatientLiveStore(s => s.mode)
  const done = stage === 'done'

  useEffect(() => {
    if (!auto || done) return
    const t = setInterval(() => usePatientLiveStore.getState().advance(), 9000)
    return () => clearInterval(t)
  }, [auto, done])

  const setMode = (m: LiveMode) => {
    const s = usePatientLiveStore.getState()
    s.startVisit(s.token, m, s.apptDate, s.apptTime, s.doctor)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-2xl bg-slate-900/95 backdrop-blur px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] border border-white/10">
      <span className="flex items-center gap-1.5 px-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
        <Presentation className="h-3.5 w-3.5" /> Demo
      </span>
      <span className="h-5 w-px bg-white/15 mx-0.5" />
      <ModeBtn icon={Building2} label="In-person" active={mode === "in_person"} onSelect={() => setMode("in_person")} />
      <ModeBtn icon={Video} label="Video" active={mode === "video"} onSelect={() => setMode("video")} />
      <span className="h-5 w-px bg-white/15 mx-0.5" />
      <Btn onClick={() => setAuto(a => !a)} label={auto ? 'Pause auto-play' : 'Play auto-play'}>{auto ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Btn>
      <Btn onClick={() => usePatientLiveStore.getState().advance()} label="Next stage"><SkipForward className="h-4 w-4" /></Btn>
      <Btn onClick={() => usePatientLiveStore.getState().reset()} label="Restart journey"><RotateCcw className="h-4 w-4" /></Btn>
    </div>
  )
}
