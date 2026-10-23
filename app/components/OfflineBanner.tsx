"use client";

import { useEffect, useState } from "react";
import {
  containsPatientIdentifier,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    const saved = localStorage.getItem("histopath_offline_note") || "";
    if (containsPatientIdentifier(saved)) {
      localStorage.removeItem("histopath_offline_note");
      setError(PATIENT_IDENTIFIER_MESSAGE);
    } else {
      setNote(saved);
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <aside className="offline-banner">
      <b>Offline</b>
      <span>
        Voice and AI are unavailable. Your scratch note stays on this device.
      </span>
      <textarea
        value={note}
        onChange={(event) => {
          const value = event.target.value;
          if (containsPatientIdentifier(value)) {
            setError(PATIENT_IDENTIFIER_MESSAGE);
            return;
          }
          setError("");
          setNote(value);
          localStorage.setItem("histopath_offline_note", value);
        }}
        placeholder="Temporary offline note…"
      />
      {error && <span>{error}</span>}
    </aside>
  );
}
