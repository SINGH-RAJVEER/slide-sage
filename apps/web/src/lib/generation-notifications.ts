export function requestGenerationNotificationPermission() {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    void Notification.requestPermission().catch(() => undefined);
}

export function showGenerationCompleteNotification({
    presentationId,
    title,
    onActivate,
}: {
    presentationId: string;
    title: string;
    onActivate: () => void;
}) {
    if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) {
        return;
    }

    const notification = new Notification("Presentation ready", {
        body: title || "Your presentation has finished generating.",
        icon: "/icon.png",
        tag: `slide-sage-generation-${presentationId}`,
    });
    notification.onclick = () => {
        window.focus();
        notification.close();
        onActivate();
    };
}
