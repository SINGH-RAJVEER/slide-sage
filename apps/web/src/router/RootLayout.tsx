import { Outlet } from "react-router-dom";
import GenerationStatusIndicator from "@/modules/GenerationStatusIndicator";

export default function RootLayout() {
    return (
        <>
            <Outlet />
            <GenerationStatusIndicator />
        </>
    );
}
