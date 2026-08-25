export {
	EditorState,
	EditorSelection,
	Compartment,
	RangeSetBuilder,
	StateField,
	StateEffect,
	MapMode
} from "@codemirror/state";
export {
	EditorView,
	lineNumbers,
	highlightActiveLine,
	highlightActiveLineGutter,
	drawSelection,
	keymap,
	Decoration,
	ViewPlugin,
	WidgetType,
	gutter,
	GutterMarker
} from "@codemirror/view";
export {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	indentMore,
	indentLess,
	invertedEffects,
	undo,
	redo,
	undoDepth,
	redoDepth
} from "@codemirror/commands";
export {
	indentOnInput,
	syntaxHighlighting,
	HighlightStyle,
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentUnit
} from "@codemirror/language";
export { tags } from "@lezer/highlight";
export { html } from "@codemirror/lang-html";
export { css } from "@codemirror/lang-css";
export { javascript } from "@codemirror/lang-javascript";
export { json } from "@codemirror/lang-json";
export { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
export { indentationMarkers } from "@replit/codemirror-indentation-markers";
export { oneDarkTheme } from "@codemirror/theme-one-dark";
export * as acorn from "acorn";
export { default as jsBeautify } from "js-beautify";
