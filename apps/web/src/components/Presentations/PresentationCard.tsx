import type { PresentationSummary } from "@slide-sage/types";
import { Button } from "@slide-sage/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@slide-sage/ui/components/card";
import { Spinner } from "@slide-sage/ui/components/spinner";
import { Calendar, RotateCcw, Trash2 } from "lucide-react";
import type React from "react";

interface PresentationCardProps {
    presentation: PresentationSummary;
    isDeleting: boolean;
    isOpening: boolean;
    onCardClick: (id: string) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    formatDate: (date: string) => string;
}

export const PresentationCard: React.FC<PresentationCardProps> = ({
    presentation,
    isDeleting,
    isOpening,
    onCardClick,
    onDelete,
    formatDate,
}) => {
    return (
        <Card
            className={`group flex h-full cursor-pointer flex-col border bg-black/20 transition-colors hover:bg-white/5 ${
                presentation.status === "failed" ? "border-red-300/20" : "border-white/10"
            }`}
            onClick={() => !isOpening && onCardClick(presentation.id)}
        >
            <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2 text-lg text-white">
                    <span className="min-w-0 flex-1">
                        {presentation.status === "failed" && (
                            <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-300">
                                {isOpening ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" />}
                                Ready to retry
                            </span>
                        )}
                        <span className="line-clamp-2 block font-light opacity-90">
                            {presentation.title}
                        </span>
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 ml-2 -mt-0.5"
                        onClick={(e) => onDelete(e, presentation.id)}
                        disabled={isDeleting}
                    >
                        {isDeleting ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-3">
                <p className="text-white/40 text-sm line-clamp-3 mt-auto font-light">
                    {presentation.prompt}
                </p>
                <div className="flex items-center gap-2 border-t border-white/10 pt-3 text-xs uppercase text-white/30">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(presentation.created_at)}</span>
                </div>
            </CardContent>
        </Card>
    );
};
