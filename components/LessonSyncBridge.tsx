"use client";

import { useEffect,useState } from "react";
import { resolveStorageStatus,type StorageMode } from "@/lib/storage-mode";
import { syncLocalLessons } from "@/lib/lesson-store";

export function LessonSyncBridge(){const[mode,setMode]=useState<StorageMode>("demo");const[state,setState]=useState<"idle"|"syncing"|"ok"|"error">("idle");useEffect(()=>{let cancelled=false;async function sync(){const status=await resolveStorageStatus();if(cancelled)return;setMode(status.mode);if(status.mode!=="cloud")return;try{setState("syncing");await syncLocalLessons();if(!cancelled)setState("ok");}catch{if(!cancelled)setState("error");}}void sync();const timer=window.setInterval(()=>void sync(),15000);return()=>{cancelled=true;clearInterval(timer);};},[]);if(mode!=="cloud")return null;return <div aria-live="polite" style={{position:"fixed",right:16,bottom:16,zIndex:80,fontSize:12,padding:"8px 12px",borderRadius:20,background:"white",boxShadow:"0 4px 18px #0002"}}>{state==="syncing"?"Synchronisation…":state==="error"?"Synchronisation différée":"Fiches synchronisées"}</div>}
