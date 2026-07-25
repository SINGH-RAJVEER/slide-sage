import { ArrowUp, Check, Palette, Plus } from "lucide-react";
import { SlideRenderer } from "@/components/Viewer/SlideRenderer";
import { cn } from "@/lib/utils";
import type { MarketplaceItem } from "@/modules/marketplace/catalog";

interface MarketplaceCardProps {
    item: MarketplaceItem;
    voted: boolean;
    installed: boolean;
    onOpen: (itemId: string) => void;
    onVote: (itemId: string) => void;
    onInstall: (itemId: string) => void;
}

export default function MarketplaceCard({
    item,
    voted,
    installed,
    onOpen,
    onVote,
    onInstall,
}: MarketplaceCardProps) {
    return (
        <article className="group min-w-0 break-inside-avoid">
            <button
                type="button"
                onClick={() => onOpen(item.id)}
                aria-label={`Preview ${item.name} theme`}
                className="relative block aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition duration-300 group-hover:-translate-y-1 group-hover:border-white/20 group-hover:shadow-[0_24px_65px_rgba(0,0,0,0.28)] focus:outline-none focus:ring-2 focus:ring-amber-100/35"
            >
                <div className="absolute inset-0">
                    <div className="absolute left-0 top-0 h-[720px] w-[1280px] origin-top-left scale-[var(--marketplace-preview-scale)] [--marketplace-preview-scale:calc((100vw-2rem)/1280)] sm:[--marketplace-preview-scale:calc((50vw-2.75rem)/1280)] lg:[--marketplace-preview-scale:calc((min(100vw,80rem)/3-1rem)/1280)]">
                        <SlideRenderer
                            slide={item.previewSlide}
                            currentTemplate={item.themeId}
                            isActive={false}
                        />
                    </div>
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111827]/70 via-transparent to-transparent opacity-60" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#111827]/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
                    <Palette className="h-3 w-3" />
                    Theme
                </span>
            </button>

            <div className="flex items-start gap-3 px-1 pb-2 pt-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-white/75">
                    {item.authorInitials}
                </div>
                <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="min-w-0 flex-1 text-left focus:outline-none"
                >
                    <h2 className="truncate text-base font-semibold text-white">{item.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-white/45">by {item.author}</p>
                </button>
                <button
                    type="button"
                    aria-label={`${installed ? "Added" : "Add theme"} ${item.name}`}
                    disabled={installed}
                    onClick={() => onInstall(item.id)}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:border-emerald-300/20 disabled:bg-emerald-300/10 disabled:text-emerald-100"
                >
                    {installed ? (
                        <Check className="h-3.5 w-3.5" />
                    ) : (
                        <Plus className="h-3.5 w-3.5" />
                    )}
                    {installed ? "Added" : "Add theme"}
                </button>
                <button
                    type="button"
                    aria-label={`${voted ? "Remove upvote from" : "Upvote"} ${item.name}`}
                    aria-pressed={voted}
                    onClick={() => onVote(item.id)}
                    className={cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white/30",
                        voted
                            ? "border-amber-300/35 bg-amber-300/15 text-amber-100"
                            : "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                >
                    <ArrowUp className="h-3.5 w-3.5" />
                    {item.votes + (voted ? 1 : 0)}
                </button>
            </div>
        </article>
    );
}
