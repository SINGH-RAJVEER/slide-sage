import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export default function RouteErrorPage() {
    const error = useRouteError();

    const title = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : "Something went wrong";

    const message = isRouteErrorResponse(error)
        ? typeof error.data === "string"
            ? error.data
            : "The page failed to load."
        : error instanceof Error
          ? error.message
          : "Unexpected error.";

    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center px-6">
            <div className="max-w-2xl w-full border border-white/10 bg-white/5 backdrop-blur-md rounded-2xl p-10 shadow-2xl">
                <div className="text-white text-2xl font-semibold">{title}</div>
                <p className="text-white/70 mt-3 break-words">{message}</p>

                <div className="mt-8 flex items-center gap-3">
                    <Link
                        to="/"
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition"
                    >
                        Back to Home
                    </Link>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition"
                    >
                        Reload
                    </button>
                </div>
            </div>
        </div>
    );
}
