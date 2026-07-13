import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { StreamingProvider } from "@/modules/presentations";
import { router } from "@/router/router";

export default function App() {
    return (
        <StreamingProvider>
            <Suspense fallback={<LoadingScreen label="Loading page" />}>
                <RouterProvider router={router} />
            </Suspense>
        </StreamingProvider>
    );
}
