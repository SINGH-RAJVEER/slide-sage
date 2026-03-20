import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { StreamingProvider } from "@/modules/presentations";
import { router } from "@/router/router";

export default function App() {
    return (
        <StreamingProvider>
            <Suspense
                fallback={
                    <div className="min-h-screen bg-transparent flex items-center justify-center px-6">
                        <div className="text-center flex flex-col items-center gap-3">
                            <Spinner />
                            <div className="text-white text-xl font-semibold">Loading…</div>
                            <div className="text-white/60 mt-2">Loading the page</div>
                        </div>
                    </div>
                }
            >
                <RouterProvider router={router} />
            </Suspense>
        </StreamingProvider>
    );
}
