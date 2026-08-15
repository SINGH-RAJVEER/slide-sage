import type { BackgroundFocalPoint, ImageBlock, ImagePlaceholderBlock } from "@slidesage/types";
import { Button } from "@slidesage/ui/components/button";
import { Input } from "@slidesage/ui/components/input";
import { Label } from "@slidesage/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@slidesage/ui/components/select";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type BackgroundBlock = ImageBlock | ImagePlaceholderBlock;

interface BackgroundImageEditorProps {
	block: BackgroundBlock;
	onChange: (block: BackgroundBlock) => void;
	onClose: () => void;
}

function withUrl(block: BackgroundBlock, url: string): BackgroundBlock {
	const normalized = url.trim();
	if (normalized) return { ...block, type: "image", url: normalized };
	const { url: _url, ...placeholder } = block as ImageBlock;
	return { ...placeholder, type: "image-placeholder" };
}

function isSafeImageUrl(value: string) {
	if (!value.trim()) return true;
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export function BackgroundImageEditor({ block, onChange, onClose }: BackgroundImageEditorProps) {
	const [url, setUrl] = useState(block.type === "image" ? block.url : "");
	useEffect(() => {
		setUrl(block.type === "image" ? block.url : "");
	}, [block.id, block.type, block.type === "image" ? block.url : ""]);
	const validUrl = isSafeImageUrl(url);
	return (
		<div className="ss-background-editor">
			<div className="flex items-center justify-between gap-3">
				<strong className="text-sm font-semibold text-white">Background visual</strong>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 text-white/55 hover:bg-white/10 hover:text-white"
					onClick={onClose}
					aria-label="Close background editor"
				>
					<X className="size-4" />
				</Button>
			</div>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor={`background-url-${block.id}`}>Image URL</Label>
					<Input
						id={`background-url-${block.id}`}
						type="url"
						value={url}
						placeholder="https://example.com/image.jpg"
						aria-invalid={!validUrl}
						onChange={(event) => {
							const nextUrl = event.target.value;
							setUrl(nextUrl);
							if (isSafeImageUrl(nextUrl)) onChange(withUrl(block, nextUrl));
						}}
					/>
					{!validUrl && <p className="text-xs text-red-300">Use an HTTPS image URL.</p>}
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor={`background-alt-${block.id}`}>Description</Label>
					<Input
						id={`background-alt-${block.id}`}
						value={block.alt}
						onChange={(event) => onChange({ ...block, alt: event.target.value })}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label>Focal point</Label>
					<Select
						value={block.focalPoint || "center"}
						onValueChange={(focalPoint) =>
							onChange({ ...block, focalPoint: focalPoint as BackgroundFocalPoint })
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{["center", "top", "bottom", "left", "right"].map((point) => (
								<SelectItem key={point} value={point}>
									{point[0]?.toUpperCase()}
									{point.slice(1)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
