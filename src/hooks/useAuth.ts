import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";
import { useAuthContext } from "@/providers/AuthProvider";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const {
    user,
    isLoading,
    isAuthenticated,
    isFirebaseReady,
    logout,
    refresh,
  } = useAuthContext();

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !isAuthenticated) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, isAuthenticated, navigate, redirectPath]);

  const handleLogout = useCallback(() => {
    void logout();
  }, [logout]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated,
      isLoading,
      isFirebaseReady,
      logout: handleLogout,
      refresh,
    }),
    [user, isAuthenticated, isLoading, isFirebaseReady, handleLogout, refresh],
  );
}