"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    setNote(localStorage.getItem("histopath_offline_note") || "");
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return <aside className="offline-banner"><b>Offline</b><span>Voice and AI are unavailable. Your scratch note stays on this device.</span><textarea value={note} onChange={(event) => { setNote(event.target.value); localStorage.setItem("histopath_offline_note", event.target.value); }} placeholder="Temporary offline note…" /></aside>;
}
