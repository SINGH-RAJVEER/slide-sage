import { useCallback, useState } from "react";

export const useSemanticTheme = (initialTheme: string = "corporate-blue") => {
	const [currentSemanticTheme, setCurrentSemanticTheme] = useState(initialTheme);

	// Stable identity so effects depending on it don't re-run every render.
	const changeSemanticTheme = useCallback((themeId: string) => {
		setCurrentSemanticTheme(themeId);
	}, []);

	return {
		currentSemanticTheme,
		changeSemanticTheme,
		isLoading: false,
	};
};
