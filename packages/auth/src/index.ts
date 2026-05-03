export type { Env, Session } from "./auth-client";
export { createAuth } from "./auth-client";
export {
    authMiddleware,
    ensureUserInDbMiddleware,
    getCurrentSessionId,
    getCurrentUserId,
} from "./middleware";
