import { Palette, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import MarketplaceCard from "@/components/Marketplace/MarketplaceCard";
import { getInstalledMarketplaceThemes, installMarketplaceTheme } from "@/lib/marketplace-themes";
import {
    createMarketplacePreviewPresentation,
    MARKETPLACE_ITEMS,
    type MarketplaceItem,
} from "@/modules/marketplace/catalog";
import { ROUTES } from "@/router/paths";

type MarketplaceSort = "popular" | "newest";

function matchesSearch(item: MarketplaceItem, query: string) {
    const searchable = [item.name, item.description, item.author, ...item.tags]
        .join(" ")
        .toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
}

export default function MarketplacePage() {
    const navigate = useNavigate();
    const [sort, setSort] = useState<MarketplaceSort>("popular");
    const [query, setQuery] = useState("");
    const [votedIds, setVotedIds] = useState<Set<string>>(() => new Set());
    const [installedThemeIds, setInstalledThemeIds] = useState<Set<string>>(
        () => new Set(getInstalledMarketplaceThemes().map((theme) => theme.marketplaceId)),
    );
    const visibleItems = MARKETPLACE_ITEMS.filter((item) => matchesSearch(item, query)).sort(
        (a, b) => (sort === "popular" ? b.votes - a.votes : b.id.localeCompare(a.id)),
    );

    const handleVote = (itemId: string) => {
        setVotedIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const handleInstall = (itemId: string) => {
        if (!installMarketplaceTheme(itemId)) return;
        setInstalledThemeIds((current) => new Set(current).add(itemId));
    };

    const handleOpen = (itemId: string) => {
        const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === itemId);
        if (!item) return;
        navigate(ROUTES.presentation, {
            state: { presentation: createMarketplacePreviewPresentation(item) },
        });
    };

    return (
        <div className="min-h-screen bg-transparent text-white">
            <Header />
            <main className="overflow-hidden pb-20">
                <section className="px-4 py-8 md:px-8 md:py-12">
                    <div className="mx-auto max-w-7xl">
                        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h1 className="font-serif text-3xl text-[#f3ead5] md:text-4xl">
                                    Theme marketplace
                                </h1>
                                <p className="mt-2 text-sm text-white/40">
                                    Community-made systems for complete presentations.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    disabled
                                    title="Theme editor coming soon"
                                    className="flex h-10 items-center justify-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-4 text-sm font-medium text-amber-100/70 disabled:cursor-not-allowed"
                                >
                                    <Palette className="h-4 w-4" />
                                    Contribute a theme
                                    <span className="text-[9px] uppercase tracking-wider text-amber-100/40">
                                        Soon
                                    </span>
                                </button>
                                <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/15 px-4 text-white/40 focus-within:border-white/25 sm:w-72">
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
                                <label className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/15 px-4 text-sm text-white/55">
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    <span className="sr-only">Sort marketplace</span>
                                    <select
                                        value={sort}
                                        onChange={(event) =>
                                            setSort(event.target.value as MarketplaceSort)
                                        }
                                        className="bg-transparent text-sm text-white/70 outline-none [&>option]:bg-[#172033]"
                                    >
                                        <option value="popular">Most upvoted</option>
                                        <option value="newest">Newest</option>
                                    </select>
                                </label>
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

                        <p className="mt-12 border-t border-white/10 pt-5 text-xs leading-5 text-white/30">
                            Marketplace voting is an interactive preview and lasts for this page
                            session. Theme previews use SlideSage's current rendering system.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
