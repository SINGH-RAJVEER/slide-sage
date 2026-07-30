import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@slide-sage/ui/components/dropdown-menu";
import { cn } from "@slide-sage/ui/lib/utils";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES } from "@/router/paths";

export default function Header({ sticky = false }: { sticky?: boolean }) {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [signingOut, setSigningOut] = useState(false);

    const handleSignOut = async () => {
        if (signingOut) return;

        setSigningOut(true);
        try {
            await signOut();
        } catch {
            setSigningOut(false);
        }
    };

    const getUserInitials = () => {
        const trimmedName = user?.name?.trim();

        if (trimmedName) {
            const nameParts = trimmedName.split(/\s+/);
            const firstInitial = nameParts[0]?.charAt(0) ?? "";
            const lastInitial =
                nameParts.length > 1 ? (nameParts[nameParts.length - 1]?.charAt(0) ?? "") : "";

            return `${firstInitial}${lastInitial}`.toUpperCase() || "U";
        }

        return user?.email?.charAt(0)?.toUpperCase() || "U";
    };

    const isAuthPage =
        location.pathname === ROUTES.signIn ||
        location.pathname === ROUTES.signUp ||
        location.pathname === ROUTES.forgotPassword ||
        location.pathname === ROUTES.resetPassword ||
        location.pathname.startsWith(`${ROUTES.signIn}/`) ||
        location.pathname.startsWith(`${ROUTES.signUp}/`);

    const isActive = (path: string) => {
        if (path === ROUTES.presentations && location.pathname === ROUTES.presentations)
            return true;
        if (
            path === ROUTES.generate &&
            (location.pathname === ROUTES.generate || location.pathname === ROUTES.research)
        )
            return true;
        return location.pathname.startsWith(path) && path !== ROUTES.home;
    };

    return (
        <header
            className={cn(
                "w-full border-b border-white/10 bg-[hsl(222,27%,12%)]/95 backdrop-blur-md",
                sticky && "sticky top-0 z-50",
            )}
        >
            <div className="grid h-20 w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-4 md:grid-cols-3 md:px-10 md:py-5">
                {/* Left Side: Logo */}
                <div className="flex items-center md:w-full">
                    <Link to={ROUTES.home} aria-label="Go to home">
                        <img
                            src="/icon.png"
                            alt="SlideSage"
                            className="h-10 w-auto object-contain md:h-12"
                        />
                    </Link>
                </div>

                {/* Center: Tabs */}
                {!isAuthPage && (
                    <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <nav className="flex w-max items-center gap-1 md:mx-auto md:gap-2">
                            <Link
                                to={ROUTES.generate}
                                className={cn(
                                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors md:px-4 md:py-2.5 md:text-base",
                                    isActive(ROUTES.generate)
                                        ? "bg-white/10 text-white"
                                        : "text-white/70 hover:bg-white/5 hover:text-white",
                                )}
                            >
                                Generate
                            </Link>
                            <Link
                                to={ROUTES.presentations}
                                className={cn(
                                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors md:px-4 md:py-2.5 md:text-base",
                                    isActive(ROUTES.presentations)
                                        ? "bg-white/10 text-white"
                                        : "text-white/70 hover:bg-white/5 hover:text-white",
                                )}
                            >
                                Presentations
                            </Link>
                            <Link
                                to={ROUTES.marketplace}
                                className={cn(
                                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors md:px-4 md:py-2.5 md:text-base",
                                    isActive(ROUTES.marketplace)
                                        ? "bg-white/10 text-white"
                                        : "text-white/70 hover:bg-white/5 hover:text-white",
                                )}
                            >
                                Marketplace
                            </Link>
                        </nav>
                    </div>
                )}

                {/* Right Side: Profile / Points */}
                <div className="flex items-center justify-end gap-2 md:w-full md:gap-4">
                    {user && (
                        <>
                            <button
                                type="button"
                                onClick={() => navigate(ROUTES.purchase)}
                                className="hidden rounded-full border border-white/10 px-5 py-2 text-base font-medium text-white/90 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 lg:block"
                                title="Click to purchase more points"
                            >
                                {`${user.slideTokens?.toFixed(1) ?? "0.0"} points`}
                            </button>

                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label="Open account menu"
                                    className="focus:outline-none rounded-full ring-offset-black focus:ring-2 focus:ring-white/20 transition-all"
                                >
                                    <div className="h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-white/10 transition-colors hover:border-white/40 flex items-center justify-center shadow-sm">
                                        <span className="text-base font-semibold text-white/90 uppercase flex-shrink-0">
                                            {getUserInitials()}
                                        </span>
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="min-w-48 bg-[hsl(222,27%,12%)] border border-white/10 text-white shadow-2xl rounded-xl p-2"
                                >
                                    <div className="px-3 py-2">
                                        <p className="text-xs font-medium text-white/60 uppercase tracking-wider mb-1">
                                            Signed in as
                                        </p>
                                        <p className="font-normal text-white/90 text-sm truncate">
                                            {user.email}
                                        </p>
                                    </div>
                                    <DropdownMenuSeparator className="bg-white/10 my-1" />
                                    <DropdownMenuItem
                                        asChild
                                        className="cursor-pointer rounded-lg my-1 mx-1 focus:bg-white/10 focus:text-white text-white/80"
                                    >
                                        <Link
                                            to={ROUTES.profile}
                                            className="flex w-full px-3 py-2 text-sm transition-colors outline-none border-none"
                                        >
                                            Profile
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        asChild
                                        className="cursor-pointer rounded-lg my-1 mx-1 focus:bg-white/10 focus:text-white text-white/80"
                                    >
                                        <Link
                                            to={ROUTES.settings}
                                            className="flex w-full px-3 py-2 text-sm transition-colors outline-none border-none"
                                        >
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/10 my-1" />
                                    <DropdownMenuItem
                                        disabled={signingOut}
                                        onSelect={() => void handleSignOut()}
                                        className="cursor-pointer rounded-lg my-1 mx-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 transition-colors outline-none"
                                    >
                                        {signingOut ? "Signing out..." : "Sign Out"}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
