/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EOL as newline } from "node:os";
import { Handler, readFile, writeFile } from "./common";

const copyrightText = `Copyright (c) Microsoft Corporation and contributors. All rights reserved.${newline}Licensed under the MIT License.`;
const autoGenText = `${newline}THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY`;

/* eslint-disable tsdoc/syntax */
interface IFileConfig {
	/**
	 * File type reported in error message (e.g., 'Html')
	 */
	type: string;
	/**
	 * Regex matching header prefix (e.g. '/*!\r?\n')
	 */
	headerStart?: RegExp;
	/**
	 * Regex matching beginning of each line (e.g. ' * ')
	 */
	lineStart: RegExp;
	/**
	 * Regex matching the end of each line (e.g., '\r?\n')
	 */
	lineEnd: RegExp;
	/**
	 * Regex matching the header postfix.
	 */
	headerEnd?: RegExp;
}
/* eslint-enable tsdoc/syntax */

/**
 * Given an 'IFileConfig' produces a function that detects correct copyright headers
 * and returns an error string if the header is missing or incorrect.
 */
function makeHandler(config: IFileConfig): (file: string) => Promise<string | undefined> {
	const pre = config.headerStart?.source ?? "";
	const start = config.lineStart.source;
	const end = config.lineEnd.source;
	const post = config.headerEnd?.source ?? "";

	// Helper which constructs a matching RegExp from a given multiline strings.
	// (See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping)
	const toRegex = (text: string): string =>
		text
			.split(newline)
			.map((line) => `${start}${line.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}${end}`)
			.join("")
			.replace(/\s*\\r\?\\n/, "\\r?\\n"); // Trim trailing spaces at end-of-line.

	// Detection regex matches the header start (if any), followed by lines in 'copyrightText',
	// optionally followed by lines in the 'autoGenText', and finally the header end (if any).
	const regex = new RegExp(
		`^${pre}${toRegex(copyrightText)}(${toRegex(autoGenText)})?${post}`,
	);

	return async (file: string): Promise<string | undefined> => {
		// TODO: Consider reading only the first 512B or so since copyright headers are required
		//       to appear at the beginning of the file.
		const content = readFile(file);
		if (!regex.test(content)) {
			return `${config.type} file missing copyright header`;
		}
	};
}

export const handlers: Handler[] = [
	{
		name: "html-copyright-file-header",
		match: /(^|\/)[^/]+\.html$/i,
		handler: makeHandler({
			type: "Html",
			lineStart: /<!-- /, // Lines begin with '<!-- '
			lineEnd: / -->\r?\n/, // Lines end with ' -->' followed by CRLF or LF
		}),
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const prevContent = readFile(file);

			const newContent = `<!-- ${copyrightText.replace(
				newline,
				` -->${newline}<!-- `,
			)} -->${newline}${newline}${prevContent}`;

			writeFile(file, newContent);

			return { resolved: true };
		},
	},
	{
		name: "dockerfile-copyright-file-header",
		match: /(^|\/)dockerfile$/i,
		handler: makeHandler({
			type: "Dockerfile",
			lineStart: /# /, // Lines begin with '# '
			lineEnd: /\r?\n/, // Lines end with CRLF or LF
		}),
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const prevContent = readFile(file);

			// prepend copyright header to existing content
			const newContent = `# ${copyrightText.replace(
				newline,
				`${newline}# `,
			)}${newline}${newline}${prevContent}`;

			writeFile(file, newContent);

			return { resolved: true };
		},
	},
	{
		name: "js-ts-copyright-file-header",
		match: /(^|\/)[^/]+\.c?[jt]sx?$/i,
		handler: makeHandler({
			type: "JavaScript/TypeScript",
			headerStart: /(#![^\n]*\r?\n)?\/\*!\r?\n/, // Begins with optional hashbang followed by '/*!'
			lineStart: / \* /, // Subsequent lines begins with ' * '
			lineEnd: /\r?\n/, // Subsequent lines end with CRLF or LF
			headerEnd: / \*\/\r?\n\r?\n/, // Header ends with ' */' on a line by itself, followed by another newline
		}),
		resolver: (file: string): { resolved: boolean; message?: string } => {
			const prevContent = readFile(file);

			// prepend copyright header to existing content
			const separator =
				prevContent.startsWith("\r") || prevContent.startsWith("\n")
					? newline
					: newline + newline;
			const newContent = `/*!${newline} * ${copyrightText.replace(
				newline,
				`${newline} * `,
			)}${newline} */${separator}${prevContent}`;

			writeFile(file, newContent);

			return { resolved: true };
		},
	},
];
