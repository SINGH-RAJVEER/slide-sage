export { default as authClient } from "./auth-client";
export type { Session } from "./auth-client";
export {
  authMiddleware,
  ensureUserInDbMiddleware,
  getCurrentSessionId,
  getCurrentUserId,
} from "./middleware";
