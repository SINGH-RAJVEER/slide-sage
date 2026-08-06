declare module "*.css" {
	const content: { [className: string]: string };
	export default content;
}

declare module "@slidesage/ui/styles/index.css";
