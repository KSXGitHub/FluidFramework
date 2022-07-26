/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generate packageVersion.ts files from the name and version info from package.json
 * Assume to be invoked in the package root (where package.json is located), and
 * The output is in ./src/packageVersion.ts.
 */
const fs = require("fs");
const path = require("path");

const packageFile = path.resolve("./package.json");
const pkg = require(packageFile);

const outDir = "./src";
const outFile = `${outDir}/packageVersion.ts`;

const license = pkg.license === "MIT" ? " Licensed under the MIT License.\n *" : "";
const pkgName = pkg.name;

// For test builds, the package version starts with 0.0.0.  Code need to know the original version.
// CI build create one with original version prefix is emitted into the environment for code logic to be used here.
// See tools/pipelines/scripts/build-version.js
const pkgVersion = process.env.SETVERSION_CODEVERSION
    ? process.env.SETVERSION_CODEVERSION
    : pkg.version;

// Make sure the output directory exists
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

// The code to write to packageVersion.ts
const output = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 *${license}
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
 */

export const pkgName = "${pkgName}";
export const pkgVersion = "${pkgVersion}";
`;

// Only update the file if it has changed.
if (fs.existsSync(outFile)) {
    const orig = fs.readFileSync(outFile, { encoding: "utf-8" });
    const orig_nocrlf = orig.replace(/(\r\n|\n|\r)/gm, "");
    const output_nocrlf = output.replace(/(\r\n|\n|\r)/gm, "");
    if (orig_nocrlf === output_nocrlf) {
        console.log(`${outFile} unchanged.`);

        // Done! Exit!
        process.exit();
    }
}

// Write out the file.
fs.writeFileSync(outFile, output);
console.log(`${outFile} written.`);
