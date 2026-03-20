export const ROUTES = {
    home: "/",
    signIn: "/sign-in",
    signUp: "/sign-up",
    profile: "/profile",
    generate: "/generate",
    research: "/generate/research",
    presentations: "/presentations",
    presentationById: (presentationId: number | string) => `/presentations/${presentationId}`,
    presentation: "/presentation",
    presentationError: "/presentation-error",
    purchase: "/purchase",
} as const;
