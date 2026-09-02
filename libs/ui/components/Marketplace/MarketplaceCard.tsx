import type { Slide } from "@slidesage/types";
import { Plus, Trash2 } from "lucide-react";
import { ScaledSlide } from "../Viewer/ScaledSlide";
import { SlideRenderer } from "../Viewer/SlideRenderer";

export interface MarketplaceCardItem {
	id: string;
	name: string;
	description: string;
	previewThemeId: string;
	previewSlide: Slide;
}

interface MarketplaceCardProps {
	item: MarketplaceCardItem;
	installed: boolean;
	onOpen: (itemId: string) => void;
	onInstall: (itemId: string) => void;
	onRemove: (itemId: string) => void;
}

export default function MarketplaceCard({
	item,
	installed,
	onOpen,
	onInstall,
	onRemove,
}: MarketplaceCardProps) {
	return (
		<article className="group min-w-0 break-inside-avoid">
			<button
				type="button"
				onClick={() => onOpen(item.id)}
				aria-label={`Preview ${item.name} template`}
				className="relative block aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition duration-300 group-hover:-translate-y-1 group-hover:border-white/20 group-hover:shadow-[0_24px_65px_rgba(0,0,0,0.28)] focus:outline-none focus:ring-2 focus:ring-amber-100/35"
			>
				<ScaledSlide className="absolute inset-0" fit="width">
					<div className="h-full w-full">
						<SlideRenderer
							slide={item.previewSlide}
							currentTemplate={item.previewThemeId}
							isActive={false}
						/>
					</div>
				</ScaledSlide>
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111827]/70 via-transparent to-transparent opacity-60" />
			</button>

			<div className="flex items-start gap-3 px-1 pb-2 pt-4">
				<button
					type="button"
					onClick={() => onOpen(item.id)}
					className="min-w-0 flex-1 text-left focus:outline-none"
				>
					<h2 className="truncate text-base font-semibold text-white">{item.name}</h2>
					<p className="mt-0.5 line-clamp-2 text-sm text-white/45">{item.description}</p>
				</button>
				<button
					type="button"
					aria-label={`${installed ? "Remove" : "Install"} ${item.name}`}
					onClick={() => (installed ? onRemove(item.id) : onInstall(item.id))}
					className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-default disabled:border-emerald-300/20 disabled:bg-emerald-300/10 disabled:text-emerald-100"
				>
					{installed ? <Trash2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
					{installed ? "Remove" : "Install"}
				</button>
			</div>
		</article>
	);
}
