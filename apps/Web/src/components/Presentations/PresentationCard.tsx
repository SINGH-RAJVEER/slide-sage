import { Calendar, Loader2, Trash2 } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Presentation {
    id: number;
    title: string;
    prompt: string;
    created_at: string;
    updated_at: string;
}

interface PresentationCardProps {
    presentation: Presentation;
    isDeleting: boolean;
    onCardClick: (id: number) => void;
    onDelete: (e: React.MouseEvent, id: number) => void;
    formatDate: (date: string) => string;
}

export const PresentationCard: React.FC<PresentationCardProps> = ({
    presentation,
    isDeleting,
    onCardClick,
    onDelete,
    formatDate,
}) => {
    return (
        <Card
            className="group flex h-full cursor-pointer flex-col border border-white/10 bg-black/20 transition-colors hover:bg-white/5"
            onClick={() => onCardClick(presentation.id)}
        >
            <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between text-lg text-white gap-2">
                    <span className="flex-1 font-light opacity-90 line-clamp-2">
                        {presentation.title}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 ml-2 -mt-0.5"
                        onClick={(e) => onDelete(e, presentation.id)}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="h-4 w-4" />
                        )}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-3">
                <p className="text-white/40 text-sm line-clamp-3 mt-auto font-light">
                    {presentation.prompt}
                </p>
                <div className="flex items-center gap-2 border-t border-white/10 pt-3 text-xs uppercase tracking-wider text-white/30">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(presentation.created_at)}</span>
                </div>
            </CardContent>
        </Card>
    );
};
