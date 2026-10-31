import { useState, useEffect } from "react";

export function useCartSession() {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("maktaba_session_id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("maktaba_session_id", id);
    }
    setSessionId(id);
  }, []);

  return sessionId;
}
