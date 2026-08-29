import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "slidesage-vim-mode";

interface VimModeContextValue {
	isVimMode: boolean;
	setVimMode: (enabled: boolean) => void;
}

const VimModeContext = createContext<VimModeContextValue>({
	isVimMode: false,
	setVimMode: () => {},
});

export function VimModeProvider({ children }: { children: React.ReactNode }) {
	const [isVimMode, setIsVimMode] = useState(false);

	useEffect(() => {
		setIsVimMode(window.localStorage.getItem(STORAGE_KEY) === "true");
	}, []);

	useEffect(() => {
		document.documentElement.toggleAttribute("data-vim-mode", isVimMode);
		return () => document.documentElement.removeAttribute("data-vim-mode");
	}, [isVimMode]);

	const setVimMode = (enabled: boolean) => {
		setIsVimMode(enabled);
		window.localStorage.setItem(STORAGE_KEY, String(enabled));
	};

	return <VimModeContext value={{ isVimMode, setVimMode }}>{children}</VimModeContext>;
}

export function useVimMode() {
	return useContext(VimModeContext);
}
