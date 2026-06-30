import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

interface User {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    slideTokens: number;
    createdAt: Date;
    updatedAt: Date;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isSignedIn: boolean;
    refreshSession: () => Promise<void>;
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

    const refreshSession = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/auth/get-session`, {
                credentials: "include",
            });

            if (res.ok) {
                const contentType = res.headers.get("content-type") || "";

                if (contentType.includes("application/json")) {
                    const data = await res.json();
                    setUser(data?.user || null);
                } else {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error("Failed to fetch session:", error);
            setUser(null);
        }
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
            void refreshSession();
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
        try {
            await fetch(`${API_URL}/api/auth/sign-out`, {
                method: "POST",
                credentials: "include",
            });
            setUser(null);
            window.location.href = "/sign-in";
        } catch (error) {
            console.error("Sign out failed:", error);
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
