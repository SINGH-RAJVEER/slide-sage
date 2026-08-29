import { type ComponentType, type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./dropdown-menu";

export interface HeaderUser {
	name?: string | null;
	email: string;
	slideTokens?: number | null;
}

export interface HeaderRoutes {
	home: string;
	landing: string;
	generate: string;
	research: string;
	presentations: string;
	marketplace: string;
	purchase: string;
	profile: string;
	settings: string;
	auth: string[];
}

export interface HeaderLinkProps {
	to: string;
	className?: string;
	"aria-label"?: string;
	children: ReactNode;
}

interface HeaderProps {
	currentPath: string;
	routes: HeaderRoutes;
	LinkComponent: ComponentType<HeaderLinkProps>;
	user?: HeaderUser | null;
	sticky?: boolean;
	onNavigate: (path: string) => void;
	onSignOut: () => Promise<void>;
}

export function Header({
	currentPath,
	routes,
	LinkComponent,
	user,
	sticky = false,
	onNavigate,
	onSignOut,
}: HeaderProps) {
	const [signingOut, setSigningOut] = useState(false);

	const handleSignOut = async () => {
		if (signingOut) return;
		setSigningOut(true);
		try {
			await onSignOut();
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

	const isAuthPage = routes.auth.some(
		(path) => currentPath === path || currentPath.startsWith(`${path}/`),
	);
	const isActive = (path: string) => {
		if (path === routes.presentations && currentPath === routes.presentations) return true;
		if (
			path === routes.generate &&
			(currentPath === routes.generate || currentPath === routes.research)
		) {
			return true;
		}
		return currentPath.startsWith(path) && path !== routes.home;
	};

	return (
		<header
			className={cn(
				"w-full border-b border-white/10 bg-[hsl(222,27%,12%)]/95 backdrop-blur-md",
				sticky && "sticky top-0 z-50",
			)}
		>
			<div className="grid h-16 w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 md:grid-cols-3 md:px-10">
				<div className="hidden items-center md:flex md:w-full">
					<LinkComponent to={routes.landing} aria-label="SlideSage — landing">
						<img src="/icon.webp" alt="SlideSage" className="h-10 w-auto object-contain" />
					</LinkComponent>
				</div>

				{!isAuthPage && (
					<div className="min-w-0 overflow-x-auto md:col-span-1">
						<nav className="flex min-w-max items-center gap-1 md:mx-auto md:w-max md:gap-2">
							{[
								[routes.generate, "Generate"],
								[routes.presentations, "Presentations"],
								[routes.marketplace, "Marketplace"],
							].map(([path, label]) => (
								<LinkComponent
									key={path}
									to={path as string}
									className={cn(
										"flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors md:min-h-0 md:px-4 md:py-2.5 md:text-base",
										isActive(path as string)
											? "bg-white/10 text-white"
											: "text-white/70 hover:bg-white/5 hover:text-white",
									)}
								>
									{label}
								</LinkComponent>
							))}
						</nav>
					</div>
				)}

				<div className="flex items-center justify-end gap-2 md:w-full md:gap-4">
					{user && (
						<>
							<button
								type="button"
								onClick={() => onNavigate(routes.purchase)}
								className="hidden rounded-full border border-white/10 px-5 py-2 text-base font-medium text-white/90 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 lg:block"
								title="Click to purchase more points"
							>
								{`${user.slideTokens?.toFixed(1) ?? "0.0"} points`}
							</button>

							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label="Open account menu"
									className="rounded-full ring-offset-black transition-all focus:outline-none focus:ring-2 focus:ring-white/20"
								>
									<div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-sm transition-colors hover:border-white/40">
										<span className="flex-shrink-0 text-base font-semibold uppercase text-white/90">
											{getUserInitials()}
										</span>
									</div>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									className="min-w-48 rounded-xl border border-white/10 bg-[hsl(222,27%,12%)] p-2 text-white shadow-2xl"
								>
									{[routes.profile, routes.settings].map((path) => (
										<DropdownMenuItem
											key={path}
											asChild
											className="mx-1 my-1 cursor-pointer rounded-lg text-white/80 focus:bg-white/10 focus:text-white"
										>
											<LinkComponent
												to={path}
												className="flex w-full border-none px-3 py-2 text-sm outline-none transition-colors"
											>
												{path === routes.profile ? "Profile" : "Settings"}
											</LinkComponent>
										</DropdownMenuItem>
									))}
									<DropdownMenuSeparator className="my-0 bg-white/10" />
									<DropdownMenuItem
										disabled={signingOut}
										onSelect={() => void handleSignOut()}
										className="mx-1 mt-2 mb-1 cursor-pointer rounded-lg px-3 py-2 text-sm text-red-400 outline-none transition-colors hover:text-red-300 focus:bg-red-500/10 focus:text-red-300"
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
