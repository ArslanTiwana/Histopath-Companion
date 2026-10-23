"use client";

import { createContext, useContext, useState } from "react";

const AuthStateContext = createContext<{
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;
}>({ authenticated: false, setAuthenticated: () => undefined });

export function AuthStateProvider({
  authenticated,
  children,
}: {
  authenticated: boolean;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState(authenticated);
  return (
    <AuthStateContext.Provider
      value={{ authenticated: current, setAuthenticated: setCurrent }}
    >
      {children}
    </AuthStateContext.Provider>
  );
}

export function useAuthState() {
  return useContext(AuthStateContext);
}
