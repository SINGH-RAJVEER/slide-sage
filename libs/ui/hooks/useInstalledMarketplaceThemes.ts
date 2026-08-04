import { useEffect, useState } from "react";
import {
    getInstalledMarketplaceThemes,
    MARKETPLACE_THEMES_UPDATED_EVENT,
} from "../lib/marketplace-themes";

export function useInstalledMarketplaceThemes() {
    const [themes, setThemes] = useState(getInstalledMarketplaceThemes);

    useEffect(() => {
        const refresh = () => setThemes(getInstalledMarketplaceThemes());
        window.addEventListener(MARKETPLACE_THEMES_UPDATED_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(MARKETPLACE_THEMES_UPDATED_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);

    return themes;
}
