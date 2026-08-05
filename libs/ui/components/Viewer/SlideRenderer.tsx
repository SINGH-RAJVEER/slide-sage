import {
	type ContentSlide,
	isChartSlide,
	isLegacyHtmlSlide,
	isSceneSlide,
	type Slide,
	type SlideBlock,
	type SlideRegion,
} from "@slidesage/types";
import { Image as ImageIcon } from "lucide-react";
import React from "react";
import { adaptLegacyHtmlSlide } from "../../lib/legacy-slide-adapter";
import { tweenNumber } from "../../lib/presentation-motion";
import { AVAILABLE_TEMPLATES, type TemplateStyles } from "../../lib/templates";
import { isWidgetBlock, type WidgetWidth } from "../../lib/widget-scene";
import ChartRenderer from "../Charts/ChartRenderer";
import { SceneRenderer } from "./SceneRenderer";
import TemplateApplier from "./TemplateApplier";
import { WidgetRenderer } from "./WidgetRenderer";

function keyed<T>(items: T[], keyFor: (item: T) => string): Array<{ item: T; key: string }> {
	const occurrences = new Map<string, number>();
	return items.map((item) => {
		const base = keyFor(item);
		const occurrence = occurrences.get(base) || 0;
		occurrences.set(base, occurrence + 1);
		return { item, key: occurrence === 0 ? base : `${base}-${occurrence}` };
	});
}

function safeImageUrl(value: string): string | undefined {
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function isVisualBlock(block: SlideBlock): boolean {
	return block.type === "image" || block.type === "image-placeholder";
}

function AnimatedStatValue({ value, active }: { value: string; active: boolean }) {
	const [display, setDisplay] = React.useState(value);
	React.useEffect(() => {
		const match = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
		if (!active || !match) {
			setDisplay(value);
			return;
		}
		const target = Number(match[2]?.replaceAll(",", ""));
		if (!Number.isFinite(target)) {
			setDisplay(value);
			return;
		}
		const decimals = match[2]?.split(".")[1]?.length || 0;
		return tweenNumber({
			from: 0,
			to: target,
			durationMs: 700,
			onUpdate: (current) => {
				const formatted = current.toLocaleString(undefined, {
					minimumFractionDigits: decimals,
					maximumFractionDigits: decimals,
				});
				setDisplay(`${match[1] || ""}${formatted}${match[3] || ""}`);
			},
		});
	}, [active, value]);
	return display;
}

function BlockRenderer({
	block,
	styles,
	isActive,
	editing,
	onEdit,
	widthMode,
	media,
}: {
	block: SlideBlock;
	styles: TemplateStyles;
	isActive: boolean;
	editing?: boolean;
	onEdit?: (block: SlideBlock) => void;
	widthMode: WidgetWidth;
	media?: boolean;
}) {
	const textArea = (value: string, update: (value: string) => SlideBlock, rows = 3) =>
		editing ? (
			<textarea
				value={value}
				rows={rows}
				onChange={(event) => onEdit?.(update(event.target.value))}
				className="ss-inplace-text"
			/>
		) : null;

	if (isWidgetBlock(block)) {
		return <WidgetRenderer block={block} styles={styles} widthMode={widthMode} />;
	}

	switch (block.type) {
		case "paragraph":
			if (editing) return textArea(block.text, (text) => ({ ...block, text }));
			return <p className="ss-editorial-paragraph">{block.text}</p>;
		case "bullets": {
			if (editing) {
				return textArea(
					block.items.join("\n"),
					(value) => ({ ...block, items: value.split("\n").slice(0, 8) }),
					Math.max(3, block.items.length),
				);
			}
			const List = block.ordered ? "ol" : "ul";
			return (
				<List className="ss-editorial-list" style={{ ...styles.slideList }}>
					{keyed(block.items, (item) => item).map(({ item, key }) => (
						<li key={key}>{item}</li>
					))}
				</List>
			);
		}
		case "table":
			if (editing) {
				return textArea(
					[block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join("\n"),
					(value) => {
						const lines = value.split("\n").slice(0, 9);
						const headers = (lines.shift() || "")
							.split("|")
							.map((item) => item.trim())
							.slice(0, 6);
						return {
							...block,
							headers,
							rows: lines.map((line) =>
								headers.map((_, index) => line.split("|")[index]?.trim() || ""),
							),
						};
					},
					Math.max(4, block.rows.length + 1),
				);
			}
			return (
				<div className="ss-slide-table-scroll">
					<table className="ss-editorial-table" style={{ ...styles.slideTable }}>
						<thead className="ss-slide-table-head">
							<tr>
								{keyed(block.headers, (header) => header).map(({ item, key }) => (
									<th key={key} style={styles.slideTableTh}>
										{item}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{keyed(block.rows, (row) => JSON.stringify(row)).map(({ item: row, key: rowKey }) => (
								<tr key={rowKey}>
									{keyed(block.headers, (header) => header).map(({ key }, cellIndex) => (
										<td key={`${rowKey}-${key}`} style={styles.slideTableTd}>
											{row[cellIndex] || ""}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		case "image": {
			const url = safeImageUrl(block.url);
			return url ? (
				<figure className={`ss-editorial-figure${media ? " ss-editorial-figure--cover" : ""}`}>
					<img
						src={url}
						alt={block.alt}
						loading="lazy"
						referrerPolicy="no-referrer"
						style={{ ...styles.slideImage }}
					/>
					{block.caption && <figcaption>{block.caption}</figcaption>}
				</figure>
			) : (
				<ImagePlaceholder alt={block.alt} caption={block.caption} media={media} />
			);
		}
		case "image-placeholder":
			return <ImagePlaceholder alt={block.alt} caption={block.caption} media={media} />;
		case "quote":
			if (editing) return textArea(block.text, (text) => ({ ...block, text }), 4);
			return (
				<figure className="ss-editorial-quote">
					<blockquote style={{ ...styles.slideQuote }}>{block.text}</blockquote>
					{block.attribution && <figcaption>{block.attribution}</figcaption>}
				</figure>
			);
		case "callout":
			if (editing) return textArea(block.text, (text) => ({ ...block, text }), 3);
			return (
				<div className="ss-editorial-callout">
					{block.heading && <strong>{block.heading}</strong>}
					<p>{block.text}</p>
				</div>
			);
		case "stats":
			if (editing) {
				return (
					<div className="ss-editorial-stats">
						{block.items.map((item, index) => (
							<div key={`${item.value}-${item.label}`} className="ss-editorial-stat">
								<input
									className="ss-inplace-input"
									value={item.value}
									onChange={(event) =>
										onEdit?.({
											...block,
											items: block.items.map((entry, itemIndex) =>
												itemIndex === index ? { ...entry, value: event.target.value } : entry,
											),
										})
									}
								/>
								<input
									className="ss-inplace-input"
									value={item.label}
									onChange={(event) =>
										onEdit?.({
											...block,
											items: block.items.map((entry, itemIndex) =>
												itemIndex === index ? { ...entry, label: event.target.value } : entry,
											),
										})
									}
								/>
							</div>
						))}
					</div>
				);
			}
			return (
				<div className="ss-editorial-stats">
					{keyed(block.items, (item) => `${item.value}-${item.label}`).map(({ item, key }) => (
						<div key={key} className="ss-editorial-stat">
							<strong>
								<AnimatedStatValue value={item.value} active={isActive} />
							</strong>
							<span>{item.label}</span>
						</div>
					))}
				</div>
			);
	}
}

function ImagePlaceholder({
	alt,
	caption,
	media,
}: {
	alt: string;
	caption: string;
	media?: boolean;
}) {
	return (
		<figure
			role="img"
			aria-label={alt}
			className={`ss-editorial-placeholder${media ? " ss-editorial-placeholder--cover" : ""}`}
		>
			<ImageIcon aria-hidden="true" />
			<strong>{alt}</strong>
			{caption && <figcaption>{caption}</figcaption>}
		</figure>
	);
}

interface RegionProps {
	blocks: SlideBlock[];
	region: SlideRegion;
	label?: string;
	styles: TemplateStyles;
	isActive: boolean;
	onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
	onEditBlock?: (block: SlideBlock) => void;
	editingTarget?: string;
	widthMode: WidgetWidth;
	className?: string;
	media?: boolean;
}

function Region({
	blocks,
	region,
	label,
	styles,
	isActive,
	onSelectBlock,
	onEditBlock,
	editingTarget,
	widthMode,
	className = "",
	media,
}: RegionProps) {
	const interactionProps = (item: SlideBlock): React.HTMLAttributes<HTMLDivElement> =>
		onSelectBlock
			? {
					role: "button",
					tabIndex: 0,
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onSelectBlock(item, event.currentTarget);
						}
					},
					onClick: (event) => {
						event.stopPropagation();
						onSelectBlock(item, event.currentTarget);
					},
				}
			: {};
	return (
		<section className={`ss-editorial-region ${className}`} data-region={region}>
			{label && <p className="ss-editorial-region-label">{label}</p>}
			<div className="ss-editorial-region-content">
				{keyed(blocks, (block) => block.id || JSON.stringify(block)).map(({ item, key }, index) => (
					<div
						key={key}
						data-edit-block-id={item.id}
						data-block-kind={item.type}
						data-emphasis={item.emphasis || "standard"}
						data-treatment={item.treatment || "plain"}
						data-block-index={index}
						{...interactionProps(item)}
						className={`ss-editorial-block${onSelectBlock ? " ss-editable-object" : ""}`}
					>
						<BlockRenderer
							block={item}
							styles={styles}
							isActive={isActive}
							editing={editingTarget === item.id}
							onEdit={onEditBlock}
							widthMode={widthMode}
							media={media}
						/>
					</div>
				))}
			</div>
		</section>
	);
}

interface EditorialContentProps {
	slide: ContentSlide;
	styles: TemplateStyles;
	isActive: boolean;
	onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
	onSelectTitle?: () => void;
	onSelectSubtitle?: () => void;
	onEditTitle?: (title: string) => void;
	onEditSubtitle?: (subtitle: string) => void;
	onEditBlock?: (block: SlideBlock) => void;
	editingTarget?: string;
}

function EditorialHeader({
	slide,
	styles,
	onSelectTitle,
	onSelectSubtitle,
	onEditTitle,
	onEditSubtitle,
	editingTarget,
}: Pick<
	EditorialContentProps,
	| "slide"
	| "styles"
	| "onSelectTitle"
	| "onSelectSubtitle"
	| "onEditTitle"
	| "onEditSubtitle"
	| "editingTarget"
>) {
	return (
		<header className="ss-editorial-header">
			{slide.eyebrow && <p className="ss-editorial-eyebrow">{slide.eyebrow}</p>}
			{editingTarget === "title" ? (
				<input
					value={slide.title}
					onChange={(event) => onEditTitle?.(event.target.value)}
					className="ss-inplace-input ss-editorial-title"
					style={{ ...styles.slideTitle }}
				/>
			) : (
				<h1
					role={onSelectTitle ? "button" : undefined}
					tabIndex={onSelectTitle ? 0 : undefined}
					onKeyDown={(event) => {
						if (onSelectTitle && (event.key === "Enter" || event.key === " ")) {
							onSelectTitle();
						}
					}}
					onClick={(event) => {
						if (!onSelectTitle) return;
						event.stopPropagation();
						onSelectTitle();
					}}
					className={`ss-editorial-title${onSelectTitle ? " ss-editable-object" : ""}`}
					style={{ ...styles.slideTitle }}
				>
					{slide.title}
				</h1>
			)}
			{editingTarget === "subtitle" ? (
				<input
					value={slide.subtitle}
					onChange={(event) => onEditSubtitle?.(event.target.value)}
					className="ss-inplace-input ss-editorial-subtitle"
					style={{ ...styles.slideSubtitle }}
					placeholder="Add subtitle"
				/>
			) : (
				slide.subtitle && (
					<p
						role={onSelectSubtitle ? "button" : undefined}
						tabIndex={onSelectSubtitle ? 0 : undefined}
						onKeyDown={(event) => {
							if (onSelectSubtitle && (event.key === "Enter" || event.key === " ")) {
								onSelectSubtitle();
							}
						}}
						onClick={(event) => {
							if (!onSelectSubtitle) return;
							event.stopPropagation();
							onSelectSubtitle();
						}}
						className={`ss-editorial-subtitle${onSelectSubtitle ? " ss-editable-object" : ""}`}
						style={{ ...styles.slideSubtitle }}
					>
						{slide.subtitle}
					</p>
				)
			)}
		</header>
	);
}

function EditorialContent(props: EditorialContentProps) {
	const { slide, styles, isActive } = props;
	const byRegion = (region: SlideRegion) => slide.blocks.filter((block) => block.region === region);
	const main = byRegion("main");
	const primary = byRegion("primary");
	const secondary = byRegion("secondary");
	const media = byRegion("media");
	const regionProps = (region: SlideRegion, blocks: SlideBlock[]): RegionProps => ({
		blocks,
		region,
		label: slide.regionLabels?.[region],
		styles,
		isActive,
		onSelectBlock: props.onSelectBlock,
		onEditBlock: props.onEditBlock,
		editingTarget: props.editingTarget,
		widthMode: region === "main" ? "full" : "column",
	});
	const all = slide.blocks;
	const hasAuthoredPair = primary.length > 0 && secondary.length > 0;
	const pairedPrimary = hasAuthoredPair ? primary : all.filter((_, index) => index % 2 === 0);
	const pairedSecondary = hasAuthoredPair ? secondary : all.filter((_, index) => index % 2 === 1);
	const content = primary.length ? primary : main.filter((block) => !isVisualBlock(block));
	const visual = media.length
		? media
		: main.filter((block) => block.type === "image" || block.type === "image-placeholder");
	const support = secondary.length
		? secondary
		: all.filter((block) => !content.includes(block) && !visual.includes(block));
	const header = <EditorialHeader {...props} />;

	let composition: React.ReactNode;
	switch (slide.layout) {
		case "cover":
			composition = (
				<div className="ss-composition ss-composition--cover">
					{header}
					<Region {...regionProps("main", main.length ? main : all)} />
				</div>
			);
			break;
		case "section":
			composition = (
				<div className="ss-composition ss-composition--section">
					<span className="ss-editorial-section-mark" aria-hidden="true" />
					{header}
					<Region {...regionProps("main", main.length ? main : all)} />
				</div>
			);
			break;
		case "split":
			composition = (
				<div className="ss-composition ss-composition--split">
					{header}
					<Region {...regionProps("primary", pairedPrimary)} />
					<Region {...regionProps("secondary", pairedSecondary)} />
				</div>
			);
			break;
		case "comparison":
			composition = (
				<div className="ss-composition ss-composition--comparison">
					{header}
					<Region {...regionProps("primary", pairedPrimary)} className="ss-editorial-panel" />
					<Region {...regionProps("secondary", pairedSecondary)} className="ss-editorial-panel" />
				</div>
			);
			break;
		case "sidebar":
			composition = (
				<div className="ss-composition ss-composition--sidebar">
					{header}
					<Region {...regionProps("primary", primary.length ? primary : main)} />
					<Region {...regionProps("secondary", secondary)} className="ss-editorial-rail" />
				</div>
			);
			break;
		case "media-left":
		case "media-right":
			composition = (
				<div className={`ss-composition ss-composition--${slide.layout}`}>
					{header}
					<Region {...regionProps("media", visual)} media={true} />
					<Region {...regionProps("primary", content)} />
					{support.length > 0 && (
						<Region {...regionProps("secondary", support)} className="ss-media-support" />
					)}
				</div>
			);
			break;
		case "quote":
			composition = (
				<div className="ss-composition ss-composition--quote">
					{header}
					<Region {...regionProps("main", main.length ? main : all)} />
				</div>
			);
			break;
		case "spotlight": {
			const hero = all.find((block) => block.emphasis === "hero") || primary[0] || all[0];
			const heroBlocks = hero ? [hero] : [];
			const supportBlocks = all.filter((block) => block !== hero);
			composition = (
				<div className="ss-composition ss-composition--spotlight">
					{header}
					<Region {...regionProps(hero?.region || "primary", heroBlocks)} />
					<Region {...regionProps("secondary", supportBlocks)} className="ss-spotlight-support" />
				</div>
			);
			break;
		}
		case "canvas":
			composition = (
				<div className="ss-composition ss-composition--canvas">
					{header}
					<Region {...regionProps("main", all)} />
				</div>
			);
			break;
		case "body":
			composition = (
				<div className="ss-composition ss-composition--body">
					{header}
					<Region {...regionProps("main", main.length ? main : all)} />
				</div>
			);
			break;
	}

	const backgroundUrl = slide.backgroundImage ? safeImageUrl(slide.backgroundImage.url) : undefined;
	return (
		<div
			className={`ss-editorial-slide ss-tone-${slide.tone || "default"} ss-density-${
				slide.density || "standard"
			} ss-pattern-${slide.pattern || "none"}`}
			data-layout={slide.layout}
		>
			{backgroundUrl && (
				<div
					className="ss-editorial-background"
					role="img"
					aria-label={slide.backgroundImage?.alt || ""}
					data-overlay={slide.backgroundImage?.overlay || "none"}
					style={{
						backgroundImage: `url(${JSON.stringify(backgroundUrl)})`,
						backgroundPosition: slide.backgroundImage?.focalPoint || "center",
					}}
				/>
			)}
			<div className="ss-editorial-pattern" aria-hidden="true" />
			{composition}
		</div>
	);
}

export const SlideRenderer = React.memo(
	({
		slide,
		currentTemplate,
		isActive,
		onSelectBlock,
		onSelectTitle,
		onSelectSubtitle,
		onEditTitle,
		onEditSubtitle,
		onEditBlock,
		editingTarget,
	}: {
		slide: Slide;
		currentTemplate: string;
		isActive: boolean;
		onSelectBlock?: (block: SlideBlock, element: HTMLElement) => void;
		onSelectTitle?: () => void;
		onSelectSubtitle?: () => void;
		onEditTitle?: (title: string) => void;
		onEditSubtitle?: (subtitle: string) => void;
		onEditBlock?: (block: SlideBlock) => void;
		editingTarget?: string;
	}) => {
		if (isSceneSlide(slide)) {
			return <SceneRenderer slide={slide} currentTemplate={currentTemplate} isActive={isActive} />;
		}
		const template =
			AVAILABLE_TEMPLATES.find((item) => item.id === currentTemplate) ||
			AVAILABLE_TEMPLATES.find((item) => item.id === "corporate-blue");
		if (!template) return null;

		if (isChartSlide(slide)) {
			return (
				<TemplateApplier templateId={currentTemplate} className="w-full h-full">
					<div className="w-full h-full flex items-center justify-center">
						<ChartRenderer
							chartConfig={slide.chartConfig}
							className="w-full h-full"
							textColor={String(template.styles.slideContent.color || "white")}
							isActive={isActive}
						/>
					</div>
				</TemplateApplier>
			);
		}

		const contentSlide = isLegacyHtmlSlide(slide) ? adaptLegacyHtmlSlide(slide) : slide;
		return (
			<TemplateApplier templateId={currentTemplate} className="w-full h-full">
				<EditorialContent
					slide={contentSlide}
					styles={template.styles}
					isActive={isActive}
					onSelectBlock={onSelectBlock}
					onSelectTitle={onSelectTitle}
					onSelectSubtitle={onSelectSubtitle}
					onEditTitle={onEditTitle}
					onEditSubtitle={onEditSubtitle}
					onEditBlock={onEditBlock}
					editingTarget={editingTarget}
				/>
			</TemplateApplier>
		);
	},
	(previous, next) =>
		previous.currentTemplate === next.currentTemplate &&
		previous.slide === next.slide &&
		previous.isActive === next.isActive &&
		previous.onSelectBlock === next.onSelectBlock &&
		previous.onSelectTitle === next.onSelectTitle &&
		previous.onSelectSubtitle === next.onSelectSubtitle &&
		previous.onEditTitle === next.onEditTitle &&
		previous.onEditSubtitle === next.onEditSubtitle &&
		previous.onEditBlock === next.onEditBlock &&
		previous.editingTarget === next.editingTarget,
);
