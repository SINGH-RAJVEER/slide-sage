import { LoadingScreen } from "@slidesage/ui/components/loading-screen";

export function CenteredStatusScreen({ message }: { message: string }) {
	return <LoadingScreen label={message} />;
}
