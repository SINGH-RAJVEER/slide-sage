import type React from "react";
import { AVAILABLE_TEMPLATES } from "../../lib/templates";

interface TemplateApplierProps {
    templateId: string;
    children: React.ReactNode;
    className?: string;
}

const TemplateApplier: React.FC<TemplateApplierProps> = ({
    templateId,
    children,
    className = "",
}) => {
    const template =
        AVAILABLE_TEMPLATES.find((item) => item.id === templateId) ||
        AVAILABLE_TEMPLATES.find((item) => item.id === "corporate-blue");
    const styles = template?.styles.slideContent;

    return (
        <div
            data-pdf-slide
            className={`template-applier w-full h-full ${template?.backgroundClass || ""} ${className}`}
            style={{
                ...styles,
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
            }}
        >
            {children}
        </div>
    );
};

export default TemplateApplier;
