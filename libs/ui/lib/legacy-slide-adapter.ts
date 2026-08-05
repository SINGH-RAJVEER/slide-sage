import type {
	ContentSlide,
	LegacyHtmlSlide,
	SlideBlock,
	SlideLayout,
	SlideRegion,
} from "@slidesage/types";

function cleanText(value: string | null | undefined, maximum = 1200): string {
	return (value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function safeImageUrl(value: string | null): string {
	if (!value) return "";
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : "";
	} catch {
		return "";
	}
}

function layoutForSlide(slide: LegacyHtmlSlide, root: Element): SlideLayout {
	if (root.classList.contains("layout-title") || slide.type === "title") return "cover";
	if (
		root.classList.contains("layout-highlight") ||
		slide.type === "quote" ||
		slide.type === "conclusion"
	) {
		return "quote";
	}
	if (root.classList.contains("layout-image-right")) return "media-right";
	if (root.classList.contains("layout-two-col") || root.querySelector(":scope > .two-column")) {
		return "split";
	}
	return "body";
}

function tableBlock(element: Element, region: SlideRegion): SlideBlock | null {
	const headers = Array.from(element.querySelectorAll("thead th")).map((cell) =>
		cleanText(cell.textContent, 120),
	);
	const fallbackHeaders = Array.from(element.querySelectorAll("tr:first-child th")).map((cell) =>
		cleanText(cell.textContent, 120),
	);
	const normalizedHeaders = (headers.length > 0 ? headers : fallbackHeaders).slice(0, 6);
	if (normalizedHeaders.length === 0) return null;

	const rows = Array.from(element.querySelectorAll("tbody tr"))
		.slice(0, 8)
		.map((row) =>
			Array.from(row.querySelectorAll("td"))
				.slice(0, normalizedHeaders.length)
				.map((cell) => cleanText(cell.textContent, 180)),
		);
	return { type: "table", region, headers: normalizedHeaders, rows };
}

function elementBlocks(element: Element, region: SlideRegion): SlideBlock[] {
	if (element.matches("script, style, iframe, object, embed")) return [];

	if (element.matches("ul, ol")) {
		const items = Array.from(element.children)
			.filter((child) => child.tagName === "LI")
			.slice(0, 8)
			.map((item) => cleanText(item.textContent, 350))
			.filter(Boolean);
		return items.length > 0
			? [{ type: "bullets", region, items, ordered: element.tagName === "OL" }]
			: [];
	}
	if (element.tagName === "TABLE") {
		const block = tableBlock(element, region);
		return block ? [block] : [];
	}
	if (element.tagName === "IMG") {
		const url = safeImageUrl(element.getAttribute("src"));
		return url
			? [
					{
						type: "image",
						region,
						url,
						alt: cleanText(element.getAttribute("alt"), 240) || "Presentation image",
						caption: "",
					},
				]
			: [];
	}
	if (element.matches("blockquote, #slide-quote")) {
		const text = cleanText(element.textContent, 800);
		return text ? [{ type: "quote", region, text, attribution: "" }] : [];
	}
	if (element.id === "slide-stats") {
		const items = Array.from(element.children)
			.slice(0, 6)
			.map((item) => {
				const value = cleanText(item.querySelector("strong, h3, h4")?.textContent, 80);
				const label = cleanText(item.textContent, 160).replace(value, "").trim();
				return { value, label };
			})
			.filter((item) => item.value || item.label);
		return items.length > 0 ? [{ type: "stats", region, items }] : [];
	}
	if (element.matches("#slide-highlight, #slide-keypoint")) {
		const heading = cleanText(element.querySelector("h3, h4, strong")?.textContent, 180);
		const text = cleanText(element.textContent, 700).replace(heading, "").trim();
		return text ? [{ type: "callout", region, heading, text }] : [];
	}
	if (element.matches("p, h3, h4, h5, span")) {
		const text = cleanText(element.textContent);
		return text ? [{ type: "paragraph", region, text }] : [];
	}

	return Array.from(element.children).flatMap((child) => elementBlocks(child, region));
}

export function adaptLegacyHtmlSlide(slide: LegacyHtmlSlide): ContentSlide {
	const document = new DOMParser().parseFromString(slide.html, "text/html");
	const root = document.querySelector("#slide-content") || document.body;
	const layout = layoutForSlide(slide, root);
	const titleElement = root.querySelector("#slide-title, h1, h2");
	const subtitleElement = root.querySelector("#slide-subtitle");
	const title = cleanText(titleElement?.textContent, 240) || "Untitled Slide";
	const subtitle = cleanText(subtitleElement?.textContent, 400);
	const twoColumn = root.querySelector(":scope > .two-column");

	let blocks: SlideBlock[];
	if (twoColumn) {
		const columns = Array.from(twoColumn.children).filter((child) =>
			child.classList.contains("column"),
		);
		blocks = columns.flatMap((column, index) =>
			Array.from(column.children).flatMap((child) =>
				child === subtitleElement
					? []
					: elementBlocks(child, index === 0 ? "primary" : "secondary"),
			),
		);
	} else {
		blocks = Array.from(root.children).flatMap((child) => {
			if (child === titleElement || child === subtitleElement) return [];
			const region: SlideRegion =
				layout === "media-right" && child.tagName === "IMG" ? "media" : "main";
			return elementBlocks(child, region);
		});
	}

	return {
		id: slide.id,
		type: "content",
		layout,
		title,
		subtitle,
		tone: "default",
		density: "standard",
		pattern: "none",
		blocks: blocks.slice(0, 12).map((block, index) => ({
			...block,
			id: `${slide.id}-block-${index + 1}`,
			sourceIds: [],
		})),
		transition: slide.transition,
		effects: slide.effects,
	};
}
