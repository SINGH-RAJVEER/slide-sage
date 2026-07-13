import { ChevronDown, Globe } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface IterateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onIterate: (
        prompt: string,
        slideCount: number,
        detailLevel: string,
        tonality: string,
        useWebResearch: boolean,
    ) => void;
    isStreaming: boolean;
}

export default function IterateModal({
    open,
    onOpenChange,
    onIterate,
    isStreaming,
}: IterateModalProps) {
    const [iteratePrompt, setIteratePrompt] = useState("");
    const [slideCount, setSlideCount] = useState("5");
    const [slideCountMode, setSlideCountMode] = useState("preset");
    const [customSlideCount, setCustomSlideCount] = useState("5");
    const [detailLevel, setDetailLevel] = useState("balanced");
    const [tonality, setTonality] = useState("professional");
    const [useWebResearch, setUseWebResearch] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handlePromptChange = (value: string) => {
        setIteratePrompt(value);
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const maxHeight = 320;
        const nextHeight = Math.min(el.scrollHeight, maxHeight);
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    const handleSubmit = () => {
        if (iteratePrompt.trim()) {
            const count =
                slideCountMode === "preset"
                    ? parseInt(slideCount, 10)
                    : parseInt(customSlideCount, 10);
            onIterate(iteratePrompt, count, detailLevel, tonality, useWebResearch);
            setIteratePrompt("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl shadow-2xl border border-white/5 bg-black/50 backdrop-blur-2xl text-white text-[1.05rem] p-8">
                <DialogHeader className="space-y-3 pb-4">
                    <DialogTitle className="flex items-center gap-3 text-white/90 text-[1.9rem] font-light tracking-tight">
                        Iterate on Presentation
                    </DialogTitle>
                    <div className="h-px bg-white/5 w-full"></div>
                </DialogHeader>
                <div className="space-y-8">
                    <div className="space-y-3">
                        <label
                            htmlFor="iteratePrompt"
                            className="block text-lg font-light text-white/60"
                        >
                            Describe Your Changes
                        </label>
                        <Textarea
                            id="iteratePrompt"
                            ref={textareaRef}
                            placeholder="e.g., 'Add more details to slide 3', 'Make it more casual', 'Add charts'"
                            value={iteratePrompt}
                            onChange={(e) => handlePromptChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && iteratePrompt.trim()) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            className="text-xl bg-black/40 border-white/5 text-white placeholder:text-white/20 focus:border-white/20 focus:ring-0 min-h-[72px] resize-none rounded-xl p-4 shadow-inner"
                            disabled={isStreaming}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-2">
                        <div className="flex items-center gap-3">
                            <span className="text-white/40 text-sm uppercase tracking-wider font-medium">
                                Web
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isStreaming}
                                aria-pressed={useWebResearch}
                                onClick={() => setUseWebResearch((prev) => !prev)}
                                className={`w-28 bg-black/20 border-white/5 text-white/80 hover:bg-white/5 transition-all duration-200 hover:text-white justify-between rounded-lg h-10 ${
                                    useWebResearch
                                        ? "bg-blue-500/20 border-blue-500/30 text-blue-200"
                                        : ""
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <Globe
                                        className={`h-4 w-4 ${useWebResearch ? "text-blue-400" : "opacity-50"}`}
                                    />
                                    {useWebResearch ? "On" : "Off"}
                                </span>
                            </Button>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-white/40 text-sm uppercase tracking-wider font-medium">
                                Detail
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-40 bg-black/20 border-white/5 text-white/80 hover:bg-white/5 transition-all duration-200 hover:text-white justify-between rounded-lg h-10"
                                        disabled={isStreaming}
                                    >
                                        {detailLevel.charAt(0).toUpperCase() + detailLevel.slice(1)}
                                        <ChevronDown className="h-4 w-4 ml-2 opacity-30" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-40 border-white/5 bg-black/80 backdrop-blur-xl shadow-2xl text-white rounded-lg p-1">
                                    <DropdownMenuItem
                                        onClick={() => setDetailLevel("brief")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Brief
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setDetailLevel("concise")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Concise
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setDetailLevel("balanced")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Balanced
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setDetailLevel("detailed")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Detailed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setDetailLevel("comprehensive")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Comprehensive
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-white/40 text-sm uppercase tracking-wider font-medium">
                                Tone
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-36 bg-black/20 border-white/5 text-white/80 hover:bg-white/5 transition-all duration-200 hover:text-white justify-between rounded-lg h-10"
                                        disabled={isStreaming}
                                    >
                                        {tonality.charAt(0).toUpperCase() + tonality.slice(1)}
                                        <ChevronDown className="h-4 w-4 ml-2 opacity-30" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-36 border-white/5 bg-black/80 backdrop-blur-xl shadow-2xl text-white rounded-lg p-1">
                                    <DropdownMenuItem
                                        onClick={() => setTonality("professional")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Professional
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setTonality("casual")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Casual
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setTonality("enthusiastic")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Enthusiastic
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setTonality("persuasive")}
                                        className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                    >
                                        Persuasive
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-white/40 text-sm uppercase tracking-wider font-medium">
                                Slides
                            </span>
                            {slideCountMode === "preset" ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-24 bg-black/20 border-white/5 text-white/80 hover:bg-white/5 transition-all duration-200 hover:text-white justify-between rounded-lg h-10"
                                            disabled={isStreaming}
                                        >
                                            {slideCount}
                                            <ChevronDown className="h-4 w-4 ml-2 opacity-30" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-24 border-white/5 bg-black/80 backdrop-blur-xl shadow-2xl text-white rounded-lg p-1">
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("5");
                                                setCustomSlideCount("5");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            5
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("10");
                                                setCustomSlideCount("10");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            10
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("15");
                                                setCustomSlideCount("15");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            15
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("20");
                                                setCustomSlideCount("20");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            20
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("25");
                                                setCustomSlideCount("25");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            25
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setSlideCount("30");
                                                setCustomSlideCount("30");
                                                setSlideCountMode("preset");
                                            }}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            30
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setSlideCountMode("custom")}
                                            className="text-white/60 focus:text-white focus:bg-white/10 cursor-pointer rounded-md"
                                        >
                                            Custom
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <input
                                    type="number"
                                    min={1}
                                    max={35}
                                    value={customSlideCount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (/^\d{0,2}$/.test(val) && Number(val) <= 35) {
                                            setCustomSlideCount(val);
                                        }
                                    }}
                                    onBlur={() => {
                                        let val = Number(customSlideCount);
                                        if (Number.isNaN(val) || val < 1) val = 1;
                                        if (val > 35) val = 35;
                                        setCustomSlideCount(val.toString());
                                        setSlideCount(val.toString());
                                        setSlideCountMode("preset");
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            let val = Number(customSlideCount);
                                            if (Number.isNaN(val) || val < 1) val = 1;
                                            if (val > 35) val = 35;
                                            setCustomSlideCount(val.toString());
                                            setSlideCount(val.toString());
                                            setSlideCountMode("preset");
                                        } else if (e.key === "Escape") {
                                            setSlideCountMode("preset");
                                        }
                                    }}
                                    disabled={isStreaming}
                                    className="w-24 px-3 py-2 rounded-lg border border-white/5 bg-black/20 text-white focus:outline-none focus:ring-1 focus:ring-white/20 hide-number-spin disabled:opacity-50 disabled:cursor-not-allowed h-10"
                                    placeholder="1-35"
                                    inputMode="numeric"
                                    style={{ MozAppearance: "textfield" }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex justify-center pt-8 pb-4">
                        <Button
                            onClick={handleSubmit}
                            disabled={!iteratePrompt.trim() || isStreaming}
                            className="w-full max-w-sm bg-white/5 hover:bg-white/10 backdrop-blur-lg border border-white/10 text-white transition-all duration-300 h-14 text-lg font-light tracking-wide rounded-xl shadow-lg hover:shadow-white/5"
                        >
                            {isStreaming ? (
                                <>
                                    <Spinner className="mr-2 size-5" />
                                    Generating...
                                </>
                            ) : (
                                "Generate"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
