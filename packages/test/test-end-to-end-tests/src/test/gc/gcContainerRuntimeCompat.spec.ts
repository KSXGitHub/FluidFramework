/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
	ITestFluidObject,
	ITestObjectProvider,
	TestFluidObjectFactory,
	mockConfigProvider,
	createSummarizerFromFactory,
	waitForContainerConnection,
	summarizeNow,
} from "@fluidframework/test-utils";
import { describeCompat, getContainerRuntimeApi } from "@fluid-private/test-version-utils";
import { pkgVersion } from "../../packageVersion.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * These tests validate the compatibility of the GC data in the summary tree across the past 2 container runtime
 * versions. A version of container runtime generates the summary and then we validate that another version can
 * read and process it successfully.
 */
// Issue #10053
describeCompat.skip("GC summary compatibility tests", "FullCompat", (getTestObjectProvider) => {
	const currentVersionNumber = 0;
	const oldVersionNumbers = [-1, -2];
	const dataObjectFactory = new TestFluidObjectFactory([]);

	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let dataStoreA: ITestFluidObject;

	async function createContainer(): Promise<IContainer> {
		const runtimeOptions: IContainerRuntimeOptions = {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions: { gcAllowed: true },
		};
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataObjectFactory,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			runtimeOptions,
		});
		return provider.createContainer(runtimeFactory, { configProvider: mockConfigProvider() });
	}

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
		mainContainer = await createContainer();
		dataStoreA = (await mainContainer.getEntryPoint()) as ITestFluidObject;
		await waitForContainerConnection(mainContainer);
	});

	async function createSummarizer(version: number, summaryVersion?: string) {
		const createSummarizerResult = await createSummarizerFromFactory(
			provider,
			mainContainer,
			dataObjectFactory,
			summaryVersion,
			getContainerRuntimeApi(pkgVersion, version).ContainerRuntimeFactoryWithDefaultDataStore,
		);
		return createSummarizerResult.summarizer;
	}

	// Set up the tests that will run against the different versions of the container runtime.
	const tests = (version1: number, version2: number) => {
		// Version strings to be used in tests descriptions;
		const v1Str = version1 === 0 ? `N` : `N${version1}`;
		const v2Str = version2 === 0 ? `N` : `N${version2}`;

		/**
		 * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
		 * referenced, the unreferenced timestamp is undefined.
		 * @returns a map of nodeId to its unreferenced timestamp.
		 */
		async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			const nodeTimestamps: Map<string, number | undefined> = new Map();
			for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
				nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
			}
			return nodeTimestamps;
		}

		/**
		 * This test validates that the unreferenced timestamp in the summary generated by a container runtime can
		 * be read by older / newer versions of the container runtime.
		 */
		it(`runtime version ${v2Str} validates unreferenced timestamp from summary by version ${v1Str}`, async () => {
			// Create a new summarizer running version 1. This client will generate a summary which will be used to load
			// a new client using the runtime factory version 2.
			const summarizer1 = await createSummarizer(version1);

			// Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
			const dataStoreB = await dataStoreA.context.containerRuntime.createDataStore(
				dataObjectFactory.type,
			);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			dataStoreA.root.set("dataStoreB", dataObjectB.handle);

			// Validate that the new data store does not have unreferenced timestamp.
			await provider.ensureSynchronized();
			const summaryResult1 = await summarizeNow(summarizer1);
			const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
			const dsBTimestamp1 = timestamps1.get(dataObjectB.context.id);
			assert(
				dsBTimestamp1 === undefined,
				`new data store should not have unreferenced timestamp`,
			);

			// Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has
			// an unreferenced timestamp.
			dataStoreA.root.delete("dataStoreB");
			await provider.ensureSynchronized();
			const summaryResult2 = await summarizeNow(summarizer1);
			const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
			const dsBTimestamp2 = timestamps2.get(dataObjectB.context.id);
			assert(
				dsBTimestamp2 !== undefined,
				`new data store should have unreferenced timestamp`,
			);

			// Create a new summarizer running version 2 from the summary generated by the client running version 1.
			summarizer1.close();
			const summarizer2 = await createSummarizer(version2);

			await provider.ensureSynchronized();
			const summaryResult3 = await summarizeNow(summarizer2);
			const timestamps3 = await getUnreferencedTimestamps(summaryResult3.summaryTree);
			const dsBTimestamp3 = timestamps3.get(dataObjectB.context.id);
			assert(
				dsBTimestamp3 !== undefined,
				`new data store should still have unreferenced timestamp`,
			);
			assert.strictEqual(
				dsBTimestamp3,
				dsBTimestamp2,
				"The unreferenced timestamp should not have changed",
			);
		});
	};

	// Run the tests for combinations of new version with each older version.
	for (const oldVersion of oldVersionNumbers) {
		tests(currentVersionNumber, oldVersion);
		tests(oldVersion, currentVersionNumber);
	}
});
