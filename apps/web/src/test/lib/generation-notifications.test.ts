/// <reference lib="dom" />

import { afterEach, describe, expect, it, mock } from "bun:test";
import {
    requestGenerationNotificationPermission,
    showGenerationCompleteNotification,
} from "@/lib/generation-notifications";

const originalNotification = globalThis.Notification;
const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
const createdNotifications: MockNotification[] = [];

class MockNotification {
    static permission: NotificationPermission = "default";
    static requestPermission = mock(() => Promise.resolve<NotificationPermission>("granted"));
    onclick: (() => void) | null = null;
    close = mock(() => {});
    readonly title: string;
    readonly options?: NotificationOptions;

    constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        this.options = options;
        createdNotifications.push(this);
    }
}

afterEach(() => {
    globalThis.Notification = originalNotification;
    if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
    createdNotifications.length = 0;
    MockNotification.permission = "default";
    MockNotification.requestPermission.mockClear();
});

describe("generation notifications", () => {
    it("requests permission from the generation action when undecided", () => {
        globalThis.Notification = MockNotification as unknown as typeof Notification;

        requestGenerationNotificationPermission();

        expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("shows a clickable completion notification while the tab is hidden", () => {
        globalThis.Notification = MockNotification as unknown as typeof Notification;
        MockNotification.permission = "granted";
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        const onActivate = mock(() => {});

        showGenerationCompleteNotification({
            presentationId: "presentation_1",
            title: "Quarterly plan",
            onActivate,
        });

        expect(createdNotifications).toHaveLength(1);
        expect(createdNotifications[0]?.title).toBe("Presentation ready");
        expect(createdNotifications[0]?.options).toEqual(
            expect.objectContaining({
                body: "Quarterly plan",
                tag: "slidesage-generation-presentation_1",
            }),
        );
        createdNotifications[0]?.onclick?.();
        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it("uses the in-app indicator instead of duplicating visible-tab notifications", () => {
        globalThis.Notification = MockNotification as unknown as typeof Notification;
        MockNotification.permission = "granted";
        Object.defineProperty(document, "hidden", { configurable: true, value: false });

        showGenerationCompleteNotification({
            presentationId: "presentation_1",
            title: "Quarterly plan",
            onActivate: mock(() => {}),
        });

        expect(createdNotifications).toHaveLength(0);
    });
});
