import { AlertCircle, Home, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { ROUTES } from "@/router/paths";

interface PresentationErrorPageProps {
    presentationId?: number;
    error?: string;
    onDelete?: () => void;
}

export default function PresentationErrorPage({
    presentationId: propPresentationId,
    error: propError,
    onDelete,
}: PresentationErrorPageProps = {}) {
    const navigate = useNavigate();
    const location = useLocation();

    // Get data from route state or props
    const presentationId = location.state?.presentationId || propPresentationId;
    const error =
        location.state?.error ||
        propError ||
        "This presentation has no content or failed to generate.";

    const handleGoHome = () => {
        navigate(ROUTES.presentations);
    };

    const handleDelete = async () => {
        if (onDelete) {
            onDelete();
        } else if (presentationId) {
            // Default delete behavior
            try {
                const response = await fetch(`${API_URL}/api/presentations/${presentationId}`, {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    navigate(ROUTES.presentations);
                }
            } catch (err) {
                console.error("Failed to delete presentation:", err);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <Header />
            <div className="flex items-center justify-center p-4 min-h-[calc(100vh-64px)]">
                <Card className="max-w-2xl w-full bg-white/10 backdrop-blur-md border-white/20 text-white shadow-2xl">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-red-500/20 p-3">
                                <AlertCircle className="h-12 w-12 text-red-500" />
                            </div>
                        </div>
                        <CardTitle className="text-2xl text-white">Presentation Error</CardTitle>
                        <CardDescription className="text-base mt-2 text-white/70">
                            {error}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                            <h3 className="font-semibold text-sm text-white/90 mb-2">
                                What could have happened?
                            </h3>
                            <ul className="text-sm text-white/60 space-y-1 list-disc list-inside">
                                <li>The AI service failed to generate content</li>
                                <li>Network connection was interrupted during generation</li>
                                <li>The presentation generation timed out</li>
                                <li>Invalid API key or insufficient quota</li>
                            </ul>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <Button
                                onClick={handleGoHome}
                                variant="outline"
                                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                            >
                                <Home className="mr-2 h-4 w-4" />
                                My Presentations
                            </Button>

                            {presentationId && (
                                <Button
                                    onClick={handleDelete}
                                    variant="destructive"
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete & Return
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
