import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchSessionWithRetry, isSessionCheckStale, type SessionUser } from "@/lib/session";

export type User = SessionUser;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isSignedIn: boolean;
    refreshSession: (options?: { force?: boolean }) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isSignedIn: false,
    refreshSession: async () => {},
    signOut: async () => {},
});

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const sessionRequestId = useRef(0);
    const sessionRequest = useRef<Promise<void> | null>(null);
    const lastSessionCheckAt = useRef<number | null>(null);
    const signingOut = useRef(false);

    const refreshSession = useCallback((options: { force?: boolean } = {}): Promise<void> => {
        if (signingOut.current) return Promise.resolve();
        const force = options.force === true;
        if (!force && sessionRequest.current) return sessionRequest.current;

        const requestId = ++sessionRequestId.current;
        const request = fetchSessionWithRetry()
            .then((nextUser) => {
                if (!signingOut.current && requestId === sessionRequestId.current) {
                    lastSessionCheckAt.current = Date.now();
                    setUser(nextUser);
                }
            })
            .finally(() => {
                if (sessionRequest.current === request) {
                    sessionRequest.current = null;
                }
            });

        sessionRequest.current = request;
        return request;
    }, []);

    // Fetch current user session on mount
    useEffect(() => {
        const fetchSession = async () => {
            try {
                await refreshSession();
            } finally {
                setLoading(false);
            }
        };

        fetchSession();
    }, [refreshSession]);

    useEffect(() => {
        const handleWindowFocus = () => {
            if (isSessionCheckStale(lastSessionCheckAt.current)) {
                void refreshSession();
            }
        };

        window.addEventListener("focus", handleWindowFocus);
        return () => {
            window.removeEventListener("focus", handleWindowFocus);
        };
    }, [refreshSession]);

    useEffect(() => {
        const handlePointsUpdated = (event: Event) => {
            const slideTokens = (event as CustomEvent<{ slideTokens?: unknown }>).detail
                ?.slideTokens;
            if (typeof slideTokens !== "number" || !Number.isFinite(slideTokens)) return;

            setUser((currentUser) =>
                currentUser
                    ? {
                          ...currentUser,
                          slideTokens,
                      }
                    : currentUser,
            );
        };

        window.addEventListener("slide-sage:points-updated", handlePointsUpdated);
        return () => {
            window.removeEventListener("slide-sage:points-updated", handlePointsUpdated);
        };
    }, []);

    const signOut = async () => {
        signingOut.current = true;
        sessionRequestId.current += 1;

        try {
            const { authClient } = await import("@/lib/auth-client");
            const { error } = await authClient.signOut();
            if (error) throw new Error(error.message || "Sign out failed");

            setUser(null);
            window.location.replace("/sign-in");
        } catch (error) {
            signingOut.current = false;
            console.error("Sign out failed:", error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isSignedIn: user !== null,
                refreshSession,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
