import { useCallback, useState } from "react";

export const useTemplate = (initialTemplate: string = "corporate-blue") => {
	const [currentTemplate, setCurrentTemplate] = useState(initialTemplate);

	// Stable identity so effects depending on it don't re-run every render.
	const changeTemplate = useCallback((templateId: string) => {
		setCurrentTemplate(templateId);
	}, []);

	return {
		currentTemplate,
		changeTemplate,
		isLoading: false,
	};
};
