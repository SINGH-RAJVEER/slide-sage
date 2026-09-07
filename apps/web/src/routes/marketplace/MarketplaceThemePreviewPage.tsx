import { ViewerHeaderControls } from "@slidesage/ui/components/Viewer/ViewerHeaderControls";
import { MARKETPLACE_ITEMS } from "@slidesage/ui/lib/catalog";
import { templateThumbnailUrl } from "@slidesage/ui/lib/template-thumbnails";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../../app/router/paths";

/**
 * Previews one marketplace template.
 *
 * The preview is the template's own cover slide, rendered from the package at
 * publication, rather than a mock deck styled to look like it. Showing the
 * cover alone also keeps the page cheap: a template package runs to tens of
 * megabytes, and nothing here needs the whole thing.
 */
export default function MarketplaceThemePreviewPage() {
	const navigate = useNavigate();
	const { marketplaceId } = useParams();
	const item = MARKETPLACE_ITEMS.find((candidate) => candidate.id === marketplaceId);

	if (!item) return <Navigate to={ROUTES.marketplace} replace />;

	return (
		<div className="flex h-dvh min-h-dvh max-h-dvh flex-col bg-transparent p-0">
			<div className="mx-auto flex h-full min-w-0 w-full max-w-[95vw] flex-1 flex-col pt-3">
				<ViewerHeaderControls
					title={item.name}
					canIterate={false}
					showIterate={false}
					templateLabel={item.aspectRatio.label}
					onBack={() => navigate(ROUTES.marketplace)}
					onIterate={() => undefined}
					onPresent={() => undefined}
					presentDisabled={true}
				/>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
					<img
						src={templateThumbnailUrl(item.thumbnailPath)}
						alt={`${item.name} cover slide`}
						className="max-h-[65vh] w-auto max-w-full rounded-xl border border-white/10 object-contain shadow-[0_24px_65px_rgba(0,0,0,0.28)]"
					/>
					<div className="max-w-2xl text-center">
						<p className="text-sm text-white/60">{item.description}</p>
						{!item.available && (
							<p className="mt-3 text-sm text-amber-200/70">
								This template is not published yet, so it cannot be used for generation.
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
