import { Outlet } from "react-router-dom";
import { GenerationStatusIndicator } from "@slidesage/ui";

export default function RootLayout() {
    return (
        <>
            <Outlet />
            <GenerationStatusIndicator />
        </>
    );
}
