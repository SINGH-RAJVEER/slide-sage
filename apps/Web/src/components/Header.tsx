import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/paths";

export default function Header() {
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
        <header className="w-full border-b border-white/10 bg-black/10">
            <div className="flex w-full items-center justify-between px-6 py-5 md:px-10 h-20">
                {/* Left Side: Logo */}
                <div className="flex items-center w-auto md:w-1/3">
                    <Link to={ROUTES.home} aria-label="Go to home">
                        <img
                            src="/icon.png"
                            alt="SlideSage"
                            className="h-12 w-auto object-contain"
                        />
                    </Link>
                </div>

                {/* Center: Tabs */}
                {!isAuthPage && (
                    <div className="flex-1 flex justify-center w-auto md:w-1/3">
                        <nav className="flex items-center gap-2">
                            <Link
                                to={ROUTES.generate}
                                className={cn(
                                    "rounded-lg px-4 py-2.5 text-base font-medium transition-colors",
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
                                    "rounded-lg px-4 py-2.5 text-base font-medium transition-colors",
                                    isActive(ROUTES.presentations)
                                        ? "bg-white/10 text-white"
                                        : "text-white/70 hover:bg-white/5 hover:text-white",
                                )}
                            >
                                Presentations
                            </Link>
                        </nav>
                    </div>
                )}

                {/* Right Side: Profile / Points */}
                <div className="flex items-center justify-end w-auto md:w-1/3 gap-4">
                    {user && (
                        <>
                            <button
                                type="button"
                                onClick={() => navigate(ROUTES.purchase)}
                                className="rounded-full border border-white/10 px-5 py-2 text-base font-medium text-white/90 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                                title="Click to purchase more points"
                            >
                                {`${user.slideTokens?.toFixed(1) ?? "0.0"} points`}
                            </button>

                            <DropdownMenu>
                                <DropdownMenuTrigger className="focus:outline-none rounded-full ring-offset-black focus:ring-2 focus:ring-white/20 transition-all">
                                    <div className="h-10 w-10 overflow-hidden rounded-full border border-white/20 bg-white/10 transition-colors hover:border-white/40 flex items-center justify-center shadow-sm">
                                        {user.image ? (
                                            <img
                                                src={user.image}
                                                alt="Profile"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-base font-semibold text-white/90 uppercase flex-shrink-0">
                                                {getUserInitials()}
                                            </span>
                                        )}
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
