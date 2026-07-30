export default function NotFoundPage() {
    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center px-6">
            <div className="max-w-xl w-full text-center border border-white/10 bg-white/5 backdrop-blur-md rounded-2xl p-10 shadow-2xl">
                <div className="text-white text-5xl font-bold">404</div>
                <div className="text-white/80 text-lg mt-3">Page not found</div>
                <p className="text-white/60 mt-4">
                    The page you’re looking for doesn’t exist or was moved.
                </p>
            </div>
        </div>
    );
}
