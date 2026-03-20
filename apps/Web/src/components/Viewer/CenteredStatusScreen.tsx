import { Spinner } from "@/components/ui/spinner";

export function CenteredStatusScreen({ message }: { message: string }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-white">
                <Spinner className="h-12 w-12" />
                <p className="text-lg">{message}</p>
            </div>
        </div>
    );
}
