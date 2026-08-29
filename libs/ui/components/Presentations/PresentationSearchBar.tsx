import { Input } from "@slidesage/ui/components/input";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface SearchFilters {
	query: string;
}

interface PresentationSearchBarProps {
	onSearch: (filters: SearchFilters) => void;
}

export function PresentationSearchBar({ onSearch }: PresentationSearchBarProps) {
	const [filters, setFilters] = useState<SearchFilters>({
		query: "",
	});

	const handleFilterChange = (field: keyof SearchFilters, value: string) => {
		const updatedFilters = { ...filters, [field]: value };
		setFilters(updatedFilters);
		onSearch(updatedFilters);
	};

	const clearFilters = () => {
		const emptyFilters: SearchFilters = {
			query: "",
		};
		setFilters(emptyFilters);
		onSearch(emptyFilters);
	};

	const hasActiveFilters = filters.query.length > 0;

	return (
		<div className="w-full min-w-0">
			<div className="relative w-full">
				<div className="relative flex items-center rounded-lg border border-white/10 bg-black/20 px-4 py-2.5 transition-colors focus-within:border-white/25">
					<Search className="h-5 w-5 text-white/40 transition-colors group-focus-within:text-white/70" />
					<Input
						id="presentation-search"
						type="text"
						placeholder="Search by title, prompt, or date..."
						value={filters.query}
						onChange={(e) => handleFilterChange("query", e.target.value)}
						className="h-auto flex-1 border-0 bg-transparent px-3 text-base text-white placeholder:text-white/35 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
					/>
					{hasActiveFilters && (
						<button
							type="button"
							onClick={clearFilters}
							className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/60 transition-all hover:bg-white/20 hover:text-white"
							aria-label="Clear search"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
