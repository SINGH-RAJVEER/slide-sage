import { Outlet } from "react-router-dom";
import GenerationStatusIndicator from "@/components/GenerationStatusIndicator";

export default function RootLayout() {
    return (
        <>
            <Outlet />
            <GenerationStatusIndicator />
        </>
    );
}
