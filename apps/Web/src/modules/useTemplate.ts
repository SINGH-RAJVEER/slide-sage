import { useState } from "react";

export const useTemplate = (initialTemplate: string = "corporate-blue") => {
    const [currentTemplate, setCurrentTemplate] = useState(initialTemplate);

    const changeTemplate = (templateId: string) => {
        setCurrentTemplate(templateId);
    };

    return {
        currentTemplate,
        changeTemplate,
        isLoading: false,
    };
};
