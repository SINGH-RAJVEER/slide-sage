import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export function useSlideNavigation({
    slideCount,
    slideContainerRef,
}: {
    slideCount: number;
    slideContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [visibleSlide, setVisibleSlide] = useState(0);

    // Keep indices within bounds as slide count changes
    useEffect(() => {
        if (slideCount <= 0) {
            setCurrentSlide(0);
            setVisibleSlide(0);
            return;
        }
        setCurrentSlide((prev) => clamp(prev, 0, slideCount - 1));
        setVisibleSlide((prev) => clamp(prev, 0, slideCount - 1));
    }, [slideCount]);

    const scrollToSlide = useCallback(
        (
            index: number,
            behavior: ScrollBehavior = "smooth",
            options: {
                inline?: ScrollLogicalPosition;
                block?: ScrollLogicalPosition;
            } = {},
        ) => {
            if (slideCount <= 0) return;
            const bounded = clamp(index, 0, slideCount - 1);
            setCurrentSlide(bounded);
            const slideElement = document.getElementById(`slide-${bounded}`);
            slideElement?.scrollIntoView({
                behavior,
                inline: options.inline ?? "center",
                block: options.block ?? "nearest",
            });
        },
        [slideCount],
    );

    const next = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            scrollToSlide(currentSlide + 1, behavior);
        },
        [currentSlide, scrollToSlide],
    );

    const prev = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            scrollToSlide(currentSlide - 1, behavior);
        },
        [currentSlide, scrollToSlide],
    );

    const first = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            scrollToSlide(0, behavior);
        },
        [scrollToSlide],
    );

    const lastIndex = useMemo(() => Math.max(slideCount - 1, 0), [slideCount]);
    const last = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            scrollToSlide(lastIndex, behavior);
        },
        [lastIndex, scrollToSlide],
    );

    // Track visible slide (for expensive chart animations)
    useEffect(() => {
        const container = slideContainerRef.current;
        if (!container) return;
        if (slideCount <= 0) return;

        const slideElements = container.querySelectorAll<HTMLElement>(".slide-carousel__item");
        if (!slideElements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.9) {
                        const id = (entry.target as HTMLElement).id;
                        const parsed = Number.parseInt(id.split("-")[1] ?? "", 10);
                        if (Number.isFinite(parsed)) setVisibleSlide(parsed);
                    }
                }
            },
            {
                root: container,
                threshold: [0.9],
                rootMargin: "0px",
            },
        );

        slideElements.forEach((el) => {
            observer.observe(el);
        });
        return () => observer.disconnect();
    }, [slideContainerRef, slideCount]);

    // Sync currentSlide based on scroll position (nearest slide to center)
    useEffect(() => {
        const container = slideContainerRef.current;
        if (!container || slideCount <= 0) return;

        let ticking = false;
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const children = Array.from(container.children) as HTMLElement[];
                if (!children.length) {
                    ticking = false;
                    return;
                }

                const containerRect = container.getBoundingClientRect();
                const containerCenter = (containerRect.left + containerRect.right) / 2;

                let nearestIndex = 0;
                let nearestDistance = Infinity;

                children.forEach((child, i) => {
                    const rect = child.getBoundingClientRect();
                    const childCenter = (rect.left + rect.right) / 2;
                    const distance = Math.abs(childCenter - containerCenter);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestIndex = i;
                    }
                });

                setCurrentSlide(nearestIndex);
                ticking = false;
            });
        };

        container.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        return () => container.removeEventListener("scroll", onScroll);
    }, [slideContainerRef, slideCount]);

    // Auto-scroll thumbnails when current slide changes
    const thumbnailScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (thumbnailScrollTimeoutRef.current) {
            clearTimeout(thumbnailScrollTimeoutRef.current);
        }

        thumbnailScrollTimeoutRef.current = setTimeout(() => {
            requestAnimationFrame(() => {
                const currentThumbnail = document.querySelector<HTMLElement>(
                    `[data-slide-index="${currentSlide}"]`,
                );
                currentThumbnail?.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                });
            });
        }, 50);

        return () => {
            if (thumbnailScrollTimeoutRef.current) {
                clearTimeout(thumbnailScrollTimeoutRef.current);
            }
        };
    }, [currentSlide]);

    return {
        currentSlide,
        setCurrentSlide,
        visibleSlide,
        scrollToSlide,
        next,
        prev,
        first,
        last,
    };
}
