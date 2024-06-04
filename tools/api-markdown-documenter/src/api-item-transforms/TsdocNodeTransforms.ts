/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApiItem } from "@microsoft/api-extractor-model";
import {
	type DocCodeSpan,
	type DocDeclarationReference,
	type DocEscapedText,
	type DocFencedCode,
	type DocHtmlEndTag,
	type DocHtmlStartTag,
	type DocLinkTag,
	type DocNode,
	DocNodeKind,
	type DocParagraph,
	type DocPlainText,
	type DocSection,
	type DocInlineTag,
} from "@microsoft/tsdoc";

import { type Link } from "../Link.js";
import {
	CodeSpanNode,
	type DocumentationNode,
	DocumentationNodeType,
	FencedCodeBlockNode,
	LineBreakNode,
	LinkNode,
	ParagraphNode,
	PlainTextNode,
	type SingleLineDocumentationNode,
	SingleLineSpanNode,
	SpanNode,
} from "../documentation-domain/index.js";
import { type ConfigurationBase } from "../ConfigurationBase.js";
import { getTsdocNodeTransformationOptions } from "./Utilities.js";
import { type ApiItemTransformationConfiguration } from "./configuration/index.js";

/**
 * Library of transformations from {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode}s
 * to {@link DocumentationNode}s.
 */

/**
 * Converts a {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode} to a
 * {@link DocumentationNode}.
 *
 * @remarks
 *
 * The set of supported `DocNode` kinds here is based on what appears in `ApiItem`s generated by API-Extractor.
 * This set may need to be updated if/when API-Extractor changes its output format.
 *
 * @returns The transformed `DocNode`, if it was of a kind we support.
 * Else, an error will be logged, and `undefined` will be returned.
 *
 * @public
 */
export function transformTsdocNode(
	node: DocNode,
	contextApiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): DocumentationNode | undefined {
	const transformOptions = getTsdocNodeTransformationOptions(contextApiItem, config);
	return _transformTsdocNode(node, transformOptions);
}

/**
 * Options for {@link @microsoft/tsdoc#DocNode} transformations.
 */
export interface TsdocNodeTransformOptions extends ConfigurationBase {
	/**
	 * The API item with which the documentation node(s) are associated.
	 */
	readonly contextApiItem: ApiItem;

	/**
	 * Callback for resolving symbolic links to API items.
	 *
	 * @param codeDestination - The referenced target.
	 * @param contextApiItem -
	 *
	 * @returns The appropriate URL target if the reference can be resolved. Otherwise, `undefined`.
	 */
	readonly resolveApiReference: (codeDestination: DocDeclarationReference) => Link | undefined;
}

/**
 * Converts a {@link @microsoft/tsdoc#DocNode} to a {@link DocumentationNode}.
 *
 * @remarks
 *
 * The set of supported `DocNode` kinds here is based on what appears in `ApiItem`s generated by API-Extractor.
 * This set may need to be updated if/when API-Extractor changes its output format.
 *
 * @returns The transformed `DocNode`, if it was of a kind we support.
 * Else, an error will be logged, and `undefined` will be returned.
 */
export function _transformTsdocNode(
	node: DocNode,
	options: TsdocNodeTransformOptions,
): DocumentationNode | undefined {
	switch (node.kind) {
		case DocNodeKind.CodeSpan: {
			return transformTsdocCodeSpan(node as DocCodeSpan, options);
		}
		case DocNodeKind.EscapedText: {
			return transformTsdocEscapedText(node as DocEscapedText, options);
		}
		case DocNodeKind.FencedCode: {
			return transformTsdocFencedCode(node as DocFencedCode, options);
		}
		case DocNodeKind.HtmlStartTag: {
			return transformTsdocHtmlTag(node as DocHtmlStartTag, options);
		}
		case DocNodeKind.HtmlEndTag: {
			return transformTsdocHtmlTag(node as DocHtmlEndTag, options);
		}
		case DocNodeKind.InheritDocTag: {
			options.logger?.error(
				`Encountered inheritDoc tag. This is not expected. Such tags should have already undergone content replacement.`,
			);
			return undefined;
		}
		case DocNodeKind.InlineTag: {
			return transformTsdocInlineTag(node as DocInlineTag);
		}
		case DocNodeKind.LinkTag: {
			return transformTsdocLinkTag(node as DocLinkTag, options);
		}
		case DocNodeKind.Paragraph: {
			return transformTsdocParagraph(node as DocParagraph, options);
		}
		case DocNodeKind.PlainText: {
			return transformTsdocPlainText(node as DocPlainText, options);
		}
		case DocNodeKind.Section: {
			return transformTsdocSection(node as DocSection, options);
		}
		case DocNodeKind.SoftBreak: {
			return LineBreakNode.Singleton;
		}
		default: {
			options.logger?.error(`Unsupported DocNode kind: "${node.kind}".`, node);
			return undefined;
		}
	}
}

/**
 * Converts a {@link @microsoft/tsdoc#DocCodeSpan} to a {@link CodeSpanNode}.
 */
export function transformTsdocCodeSpan(
	node: DocCodeSpan,
	options: TsdocNodeTransformOptions,
): CodeSpanNode {
	return CodeSpanNode.createFromPlainText(node.code.trim());
}

/**
 * Converts a {@link @microsoft/tsdoc#DocParagraph} to a {@link ParagraphNode}.
 */
export function transformTsdocParagraph(
	node: DocParagraph,
	options: TsdocNodeTransformOptions,
): ParagraphNode {
	return createParagraph(node.nodes, options);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocSection} to a {@link ParagraphNode}.
 *
 * @remarks
 *
 * We define "section" a bit differently from TSDoc's definition.
 * We align the concept of "section" with a level of hierarchy in the document, where TSDoc does not.
 * For that reason, their "section" concept gets mapped to a paragraph, rather than a section.
 * Consumers can wrap this in a section node as desired based on context.
 */
export function transformTsdocSection(
	node: DocSection,
	options: TsdocNodeTransformOptions,
): ParagraphNode {
	return createParagraph(node.nodes, options);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformTsdocPlainText(
	node: DocPlainText,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	return new PlainTextNode(node.text);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocEscapedText} to a {@link PlainTextNode}.
 */
export function transformTsdocEscapedText(
	node: DocEscapedText,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	return new PlainTextNode(node.encodedText, /* escaped: */ true);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocHtmlStartTag} | {@link @microsoft/tsdoc#DocHtmlEndTag} to a {@link PlainTextNode}.
 */
export function transformTsdocHtmlTag(
	node: DocHtmlStartTag | DocHtmlEndTag,
	options: TsdocNodeTransformOptions,
): PlainTextNode {
	// TODO: this really isn't right. Mapping this forward as plain text assumes that any output format can support embedded HTML.
	// That is valid for HTML and Markdown, but not necessarily for other formats.
	// Instead, we should map embedded HTML content forward in an encapsulated format, and let the renderer decide how to handle it.
	return new PlainTextNode(node.emitAsHtml(), /* escaped: */ true);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link PlainTextNode}.
 */
export function transformTsdocFencedCode(
	node: DocFencedCode,
	options: TsdocNodeTransformOptions,
): FencedCodeBlockNode {
	return FencedCodeBlockNode.createFromPlainText(node.code.trim(), node.language);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocPlainText} to a {@link SingleLineDocumentationNode}.
 */
export function transformTsdocLinkTag(
	input: DocLinkTag,
	options: TsdocNodeTransformOptions,
): SingleLineDocumentationNode {
	if (input.codeDestination !== undefined) {
		const link = options.resolveApiReference(input.codeDestination);

		if (link === undefined) {
			// If the code link could not be resolved, print the unresolved text in italics.
			const linkText = input.linkText?.trim() ?? input.codeDestination.emitAsTsdoc().trim();
			return SingleLineSpanNode.createFromPlainText(linkText, { italic: true });
		} else {
			const linkText = input.linkText?.trim() ?? link.text;
			const linkTarget = link.target;
			return LinkNode.createFromPlainText(linkText, linkTarget);
		}
	}

	if (input.urlDestination !== undefined) {
		// If link text was not provided, use the name of the referenced element.
		const linkText = input.linkText ?? input.urlDestination;

		return LinkNode.createFromPlainText(linkText, input.urlDestination);
	}

	throw new Error(
		`DocLinkTag contained neither a URL destination nor a code destination, which is not expected.`,
	);
}

/**
 * Converts a {@link @microsoft/tsdoc#DocInlineTag} to a {@link SpanNode} (or `undefined` if the input is a `{@label}` tag).
 *
 * @remarks
 * Custom inline tags are not something the system can do anything with inherently.
 * In the future, we may be able to add extensibility points for transforming custom inline tags.
 * But for now, we will simply emit them as italicized plain text in the output.
 *
 * Notes:
 *
 * * `{@link}` tags are handled separately via {@link transformTsdocLinkTag}.
 *
 * * `{@inheritDoc}` tags are resolved when loading the API model via simple content replacement.
 * We do not expect to see them at this stage.
 *
 * * `{@label}` tags aren't really intended to appear in output; they're used as extra metadata
 * for use in `{@link}` and `{@inheritDoc}` tags, so we will simply ignore them here. I.e. we
 * will return `undefined`.
 */
export function transformTsdocInlineTag(node: DocInlineTag): SpanNode | undefined {
	if (node.tagName === "@label") {
		return undefined;
	}

	// For all other inline tags, there isn't really anything we can do with them except emit them
	// as is. However, to help differentiate them in the output, we will italicize them.
	return SpanNode.createFromPlainText(`{${node.tagName} ${node.tagContent}}`, { italic: true });
}

/**
 * Helper function for creating {@link ParagraphNode}s from input nodes that simply wrap child contents.
 *
 * Also performs the following cleanup steps:
 *
 * 1. Remove leading and trailing line breaks within the paragraph (see
 * {@link trimLeadingAndTrailingLineBreaks}).
 *
 * 2. Trim leading whitespace from first child if it is plain-text, and trim trailing whitespace from
 * last child if it is plain-text.
 *
 * 3. If there is only a single resulting child and it is a paragraph, return it rather than wrapping
 * it in another paragraph.
 */
function createParagraph(
	children: readonly DocNode[],
	options: TsdocNodeTransformOptions,
): ParagraphNode {
	// Note: transformChildren does some of its own cleanup on the initial transformed contents
	let transformedChildren = transformChildren(children, options);

	// Trim leading and trailing line breaks, which are effectively redundant
	transformedChildren = trimLeadingAndTrailingLineBreaks(transformedChildren);

	// Trim leading whitespace from first child if it is plain text,
	// and trim trailing whitespace from last child if it is plain text.
	if (transformedChildren.length > 0) {
		if (transformedChildren[0].type === DocumentationNodeType.PlainText) {
			const plainTextNode = transformedChildren[0] as PlainTextNode;
			transformedChildren[0] = new PlainTextNode(
				plainTextNode.value.trimStart(),
				plainTextNode.escaped,
			);
		}
		if (
			transformedChildren[transformedChildren.length - 1].type ===
			DocumentationNodeType.PlainText
		) {
			const plainTextNode = transformedChildren[
				transformedChildren.length - 1
			] as PlainTextNode;
			transformedChildren[transformedChildren.length - 1] = new PlainTextNode(
				plainTextNode.value.trimEnd(),
				plainTextNode.escaped,
			);
		}
	}

	// To reduce unnecessary hierarchy, if the only child of this paragraph is a single paragraph,
	// return it, rather than wrapping it.
	if (
		transformedChildren.length === 1 &&
		transformedChildren[0].type === DocumentationNodeType.Paragraph
	) {
		return transformedChildren[0] as ParagraphNode;
	}

	return new ParagraphNode(transformedChildren);
}

/**
 * Transforms the provided list of child elements, and performs the following cleanup steps:
 *
 * 1. Collapses groups of adjacent newline nodes to reduce clutter.
 *
 * 2. Remove line break nodes adjacent to paragraph nodes.
 */
function transformChildren(
	children: readonly DocNode[],
	options: TsdocNodeTransformOptions,
): DocumentationNode[] {
	// TODO: HTML contents come in as a start tag, followed by the content, followed by an end tag, rather than something with hierarchy.
	// To ensure we map the content correctly, we should scan the child list for matching open/close tags,
	// and map the subsequence to an "html" node.

	// Transform child items into Documentation domain
	const transformedChildren = children.map((child) => _transformTsdocNode(child, options));

	// Filter out `undefined` values resulting from transformation errors.
	let filteredChildren = transformedChildren.filter(
		(child) => child !== undefined && !child.isEmpty,
	) as DocumentationNode[];

	// Collapse groups of adjacent line breaks to reduce unnecessary clutter in the output.
	filteredChildren = collapseAdjacentLineBreaks(filteredChildren);

	// Remove line breaks adjacent to paragraphs, as they are redundant
	filteredChildren = filterNewlinesAdjacentToParagraphs(filteredChildren);

	return filteredChildren;
}

/**
 * Collapses adjacent groups of 1+ line break nodes into a single line break node to reduce clutter
 * in output tree.
 */
function collapseAdjacentLineBreaks(nodes: readonly DocumentationNode[]): DocumentationNode[] {
	if (nodes.length === 0) {
		return [];
	}

	const result: DocumentationNode[] = [];
	let onNewline = false;
	for (const node of nodes) {
		if (node.type === DocumentationNodeType.LineBreak) {
			if (onNewline) {
				continue;
			} else {
				onNewline = true;
				result.push(node);
			}
		} else {
			onNewline = false;
			result.push(node);
		}
	}

	return result;
}

/**
 * Trims an line break nodes found at the beginning or end of the list.
 *
 * @remarks Useful for cleaning up {@link ParagraphNode} child contents, since leading and trailing
 * newlines are effectively redundant.
 */
function trimLeadingAndTrailingLineBreaks(
	nodes: readonly DocumentationNode[],
): DocumentationNode[] {
	if (nodes.length === 0) {
		return [];
	}

	let startIndex = 0;
	let endIndex = nodes.length - 1;

	for (const node of nodes) {
		if (node.type === DocumentationNodeType.LineBreak) {
			startIndex++;
		} else {
			break;
		}
	}

	for (let i = nodes.length - 1; i > startIndex; i--) {
		if (nodes[i].type === DocumentationNodeType.LineBreak) {
			endIndex--;
		} else {
			break;
		}
	}

	return nodes.slice(startIndex, endIndex + 1);
}

/**
 * Filters out line break nodes that are adjacent to paragraph nodes.
 * Since paragraph nodes inherently create line breaks on either side, these nodes are redundant and
 * clutter the output tree.
 */
function filterNewlinesAdjacentToParagraphs(
	nodes: readonly DocumentationNode[],
): DocumentationNode[] {
	if (nodes.length === 0) {
		return [];
	}

	const result: DocumentationNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i].type === DocumentationNodeType.LineBreak) {
			const previousIsParagraph =
				i > 0 ? nodes[i - 1].type === DocumentationNodeType.Paragraph : false;
			const nextIsParagraph =
				i < nodes.length - 1
					? nodes[i + 1].type === DocumentationNodeType.Paragraph
					: false;
			if (previousIsParagraph || nextIsParagraph) {
				continue;
			}
		}
		result.push(nodes[i]);
	}
	return result;
}
