import { cn } from "@/utils/cn"
import React from "react"

export function Dialog({open, children}:{open:boolean, children:React.ReactNode}){
  if(!open) return null
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
    <div className="bg-white rounded-xl p-4 max-w-md w-[92vw]">{children}</div>
  </div>
}
