import { useAuth } from "@slidesage/ui";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@slidesage/ui/components/dropdown-menu";
import MarketplaceCard from "@slidesage/ui/components/Marketplace/MarketplaceCard";
import { MARKETPLACE_ITEMS, type MarketplaceItem } from "@slidesage/ui/lib/catalog";
import {
	getInstalledMarketplaceThemes,
	installMarketplaceTheme,
	removeMarketplaceTheme,
} from "@slidesage/ui/lib/marketplace-themes";
import { Check, ChevronDown, Palette, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/app/Header";
import { ROUTES } from "@/app/router/paths";

type MarketplaceSort = "popular" | "newest";
const VOTES_STORAGE_PREFIX = "slidesage-marketplace-votes";

function getVoteStorageKey(userId: string | null) {
	return `${VOTES_STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function getVotedMarketplaceIds(userId: string | null) {
	if (typeof window === "undefined") return new Set<string>();

	try {
		const storedIds = JSON.parse(window.localStorage.getItem(getVoteStorageKey(userId)) || "[]");
		const validIds = Array.isArray(storedIds)
			? storedIds.filter((id: unknown): id is string => typeof id === "string")
			: [];
		return new Set<string>(validIds);
	} catch {
		return new Set<string>();
	}
}

function matchesSearch(item: MarketplaceItem, query: string) {
	const searchable = [item.name, item.description, item.author, ...item.tags]
		.join(" ")
		.toLowerCase();
	return searchable.includes(query.trim().toLowerCase());
}

export default function MarketplacePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [sort, setSort] = useState<MarketplaceSort>("popular");
	const [query, setQuery] = useState("");
	const [votedIds, setVotedIds] = useState<Set<string>>(() => getVotedMarketplaceIds(null));
	const [installedThemeIds, setInstalledThemeIds] = useState<Set<string>>(
		() => new Set(getInstalledMarketplaceThemes().map((theme) => theme.marketplaceId)),
	);
	const voterId = user?.id ?? null;

	useEffect(() => {
		setVotedIds(getVotedMarketplaceIds(voterId));
	}, [voterId]);
	const visibleItems = MARKETPLACE_ITEMS.filter((item) => matchesSearch(item, query)).sort(
		(a, b) => {
			if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
			return sort === "popular" ? b.votes - a.votes : b.id.localeCompare(a.id);
		},
	);

	const handleVote = (itemId: string) => {
		setVotedIds((current) => {
			const next = new Set(current);
			if (next.has(itemId)) next.delete(itemId);
			else next.add(itemId);
			window.localStorage.setItem(getVoteStorageKey(voterId), JSON.stringify([...next]));
			return next;
		});
	};

	const handleInstall = (itemId: string) => {
		if (!installMarketplaceTheme(itemId)) return;
		setInstalledThemeIds((current) => new Set(current).add(itemId));
	};

	const handleRemove = (itemId: string) => {
		if (!removeMarketplaceTheme(itemId)) return;
		setInstalledThemeIds((current) => {
			const next = new Set(current);
			next.delete(itemId);
			return next;
		});
	};

	const handleOpen = (itemId: string) => {
		const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === itemId);
		if (!item) return;
		navigate(ROUTES.marketplacePreview(item.id));
	};

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-transparent text-white">
			<Header />
			<main className="min-h-0 flex-1 overflow-y-auto pb-[max(5rem,env(safe-area-inset-bottom))]">
				<section className="px-4 py-8 md:px-8 md:py-12">
					<div className="mx-auto max-w-7xl">
						<div className="grid gap-3 border-b border-white/10 pb-6 md:grid-cols-[auto_minmax(16rem,1fr)_auto] md:items-center">
							<div className="hidden md:flex md:justify-start">
								<button
									type="button"
									disabled
									title="Theme editor coming soon"
									className="flex h-10 items-center justify-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
								>
									<Palette className="h-4 w-4" />
									Contribute a theme
									<span className="text-[9px] uppercase tracking-wider text-blue-300/55">Soon</span>
								</button>
							</div>
							<label className="flex h-11 min-w-0 items-center gap-3 rounded-full border border-white/10 bg-black/20 px-5 text-white/40 transition-colors focus-within:border-blue-400/50 focus-within:bg-black/30 focus-within:ring-2 focus-within:ring-blue-500/10">
								<Search className="h-4 w-4 shrink-0" />
								<span className="sr-only">Search marketplace</span>
								<input
									type="search"
									value={query}
									onInput={(event) => setQuery(event.currentTarget.value)}
									placeholder="Search designs or creators"
									className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
								/>
							</label>
							<div className="flex justify-end">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											aria-label="Sort marketplace"
											className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/15 px-4 text-sm text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20"
										>
											<SlidersHorizontal className="h-3.5 w-3.5" />
											{sort === "popular" ? "Most upvoted" : "Newest"}
											<ChevronDown className="h-3.5 w-3.5 text-white/35" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="end"
										className="min-w-44 rounded-xl border border-white/10 bg-[hsl(222,27%,12%)] p-1 text-white shadow-2xl"
									>
										{(
											[
												{ id: "popular", label: "Most upvoted" },
												{ id: "newest", label: "Newest" },
											] as const
										).map((option) => (
											<DropdownMenuItem
												key={option.id}
												onSelect={() => setSort(option.id)}
												className="my-1 cursor-pointer rounded-lg px-3 py-2.5 text-white/70 focus:bg-white/10 focus:text-white"
											>
												<span className="flex-1">{option.label}</span>
												{sort === option.id && <Check className="h-4 w-4 text-amber-100/70" />}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>

						<div className="mb-7 mt-8 flex justify-end">
							<p className="text-sm text-white/35">{visibleItems.length} themes</p>
						</div>

						{visibleItems.length > 0 ? (
							<div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
								{visibleItems.map((item) => (
									<MarketplaceCard
										key={item.id}
										item={item}
										voted={votedIds.has(item.id)}
										installed={installedThemeIds.has(item.id)}
										onOpen={handleOpen}
										onVote={handleVote}
										onInstall={handleInstall}
										onRemove={handleRemove}
									/>
								))}
							</div>
						) : (
							<div className="border-y border-white/10 py-24 text-center">
								<p className="font-serif text-3xl text-[#f3ead5]">
									No design answers that search yet.
								</p>
								<button
									type="button"
									onClick={() => setQuery("")}
									className="mt-5 text-sm font-medium text-white/50 underline decoration-white/20 underline-offset-4 hover:text-white"
								>
									Clear search
								</button>
							</div>
						)}
					</div>
				</section>
			</main>
		</div>
	);
}
