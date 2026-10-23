"use client";

import { useEffect, useState } from "react";
import {
  containsPatientIdentifier,
  PATIENT_IDENTIFIER_MESSAGE,
} from "@/src/lib/privacy";
import { z } from "zod";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  function saveNote(value: string) {
    if (containsPatientIdentifier(value)) {
      setError(PATIENT_IDENTIFIER_MESSAGE);
      return;
    }
    setError("");
    setNote(value);
    localStorage.setItem("histopath_offline_note", value);
  }
  const actions = useRegisterActions(
    "global",
    [
      defineAction({
        id: "set_offline_note",
        description: "Set the temporary device-only offline note.",
        args: z.object({ text: z.string() }),
        screens: ["global"],
        risk: "safe",
        describe: () => "Update offline note",
        run: ({ text }) => saveNote(text),
      }),
    ] as AnyAction[],
    () => ({ screenId: "global" }),
  );
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
        Recent cases you already opened remain read-only. Voice, AI, saving and
        stage changes need a connection. Your scratch note stays on this device.
      </span>
      <textarea
        data-action="set_offline_note"
        value={note}
        onChange={(event) =>
          void actions.run("set_offline_note", { text: event.target.value })
        }
        placeholder="Temporary offline note…"
      />
      {error && <span>{error}</span>}
    </aside>
  );
}
