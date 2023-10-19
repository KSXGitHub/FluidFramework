/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PackageJson } from "./npmPackage";

/**
 * Task definitions (type `TaskDefinitions`) is an object describing build tasks for fluid-build.
 * Task names are represented as property name on the object and the value the task configuration
 * (type `TaskConfig`). Task configuration can a plain array of string, presenting the task's
 * dependencies or a full description (type `TaskConfigFull`).
 */

export type TaskDependencies = string[];
export interface TaskConfig {
	/**
	 * Task dependencies as a plain string array.
	 * The strings specify dependencies for the task
	 * - "<name>": another task within the package
	 * - "^<name>": all the task with the name in dependent packages.
	 *
	 * When task definition is augmented in the package.json itself, the dependencies can also be:
	 * - "<package>#<name>": specific dependent package's task
	 * - "...": expand to the dependencies in global fluidBuild config (default is override)
	 */
	dependsOn: TaskDependencies;
	/**
	 * Specify whether this is a script task or not. Default to true when this is omitted
	 * in the config file, or the task's config is just a plain string array.
	 *
	 * If true, the task will match with the script it the package.json and invoke
	 * the command once all the task's dependencies are satisfied.
	 *
	 * If false, the task will only trigger the dependencies (and not look for the script in package.json).
	 * It can be used as an alias to a group of tasks.
	 */
	script: boolean;
	/**
	 * Tasks that needs to run before the current task (example clean)
	 * - "<name>": another task within the package
	 * - "*": any other task within the package
	 *
	 * When task definition is augmented in the package.json itself, the dependencies can also be:
	 * - "...": expand to the "before" in the global fluidBuild config
	 *
	 * Note that this will only affect ordering if matched task is already scheduled. It won't
	 * get the matched tasks to be scheduled if it isn't already
	 */
	before: TaskDependencies;
}

export interface TaskDefinitions {
	[name: string]: TaskConfig;
}

// On file versions that allow fields to be omitted
export type TaskConfigOnDisk = TaskDependencies | Partial<TaskConfig>;
export interface TaskDefinitionsOnDisk {
	[name: string]: TaskConfigOnDisk;
}

/**
 * Convert and fill out default values from TaskConfigOnDisk to TaskConfig in memory
 * @param config TaskConfig info loaded from a file
 * @returns TaskConfig filled out with default values
 */
function getFullTaskConfig(config: TaskConfigOnDisk): TaskConfig {
	if (Array.isArray(config)) {
		return { dependsOn: config, script: true, before: [] };
	} else {
		return {
			dependsOn: config.dependsOn ?? [],
			script: config.script ?? true,
			before: config.before ?? [],
		};
	}
}

/**
 * Combine and fill in default values for task definitions for a package.
 * @param json package.json content for the package
 * @param root root for the Fluid repo
 * @returns full task definitions for the package.
 */
export function getTaskDefinitions(
	json: PackageJson,
	globalTaskDefinitions?: TaskDefinitionsOnDisk,
) {
	const packageTaskDefinitions = json.fluidBuild?.tasks;
	const taskConfig: TaskDefinitions = {};

	// Initialize from global TaskDefinition, taking targets and scripts that exist in the package.json
	if (globalTaskDefinitions) {
		for (const name in globalTaskDefinitions) {
			const config = globalTaskDefinitions[name];
			const full = getFullTaskConfig(config);
			if (full.script && json.scripts?.[name] === undefined) {
				// Skip script global task definition if the package doesn't have the script
				continue;
			}
			const invalidDependsOn = full.dependsOn.filter(
				(value) => value === "..." || value.includes("#"),
			);
			if (invalidDependsOn.length !== 0) {
				throw new Error(
					`Invalid global dependencies '${invalidDependsOn.join()}' for task definition ${name}`,
				);
			}
			const invalidBefore = full.before.filter((value) => value === "...");
			if (invalidBefore.length !== 0) {
				throw new Error(
					`Invalid before dependencies '${invalidBefore.join()}' for task definition ${name}`,
				);
			}
			taskConfig[name] = full;
		}
		// Only keep script that exists
		for (const name in taskConfig) {
			const config = taskConfig[name];
			config.dependsOn = config.dependsOn.filter(
				(value) =>
					value.startsWith("^") ||
					taskConfig[value] !== undefined ||
					json.scripts?.[value] !== undefined,
			);
			config.before = config.before.filter(
				(value) =>
					value === "*" ||
					taskConfig[value] !== undefined ||
					json.scripts?.[value] !== undefined,
			);
		}
	}
	// Override from the package.json, and resolve "..." to the global dependencies if any
	if (packageTaskDefinitions) {
		for (const name in packageTaskDefinitions) {
			const config = packageTaskDefinitions[name];
			const full = getFullTaskConfig(config);
			if (full.script) {
				const script = json.scripts?.[name];
				if (script === undefined) {
					throw new Error(`Script not found for task definition '${name}'`);
				} else if (script.startsWith("fluid-build ")) {
					throw new Error(`Script task should not invoke 'fluid-build' in '${name}'`);
				}
			}

			const currentTaskConfig = taskConfig[name];
			const dependsOn = full.dependsOn.filter((value) => value !== "...");
			if (currentTaskConfig !== undefined && dependsOn.length !== full.dependsOn.length) {
				full.dependsOn = dependsOn.concat(currentTaskConfig.dependsOn);
			} else {
				full.dependsOn = dependsOn;
			}
			const before = full.before.filter((value) => value !== "...");
			if (currentTaskConfig !== undefined && before.length !== full.before.length) {
				full.before = before.concat(currentTaskConfig.before);
			} else {
				full.before = before;
			}

			taskConfig[name] = full;
		}
	}

	// Check to make sure all the dependencies either is an target or script
	for (const name in taskConfig) {
		const config = taskConfig[name];
		// Find any non-existent tasks or scripts in the dependencies
		const invalidDependsOn = config.dependsOn.filter(
			(value) =>
				!value.includes("#") &&
				!value.startsWith("^") &&
				taskConfig[value] === undefined &&
				json.scripts?.[value] === undefined,
		);
		if (invalidDependsOn.length !== 0) {
			throw new Error(
				`Invalid dependencies '${invalidDependsOn.join()}' for task definition ${name}`,
			);
		}

		const invalidBefore = config.before.filter(
			(value) =>
				value !== "*" &&
				taskConfig[value] === undefined &&
				json.scripts?.[value] === undefined,
		);
		if (invalidBefore.length !== 0) {
			throw new Error(
				`Invalid before dependencies '${invalidBefore.join()}' for task definition ${name}`,
			);
		}
	}
	return taskConfig;
}
