/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";

import { SharedTreeTestFactory, validateTreeConsistency } from "../../utils.js";

import {
	EditGeneratorOpWeights,
	FuzzTestState,
	makeOpGenerator,
	viewFromState,
} from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	deterministicIdCompressorFactory,
	failureDirectory,
	populatedInitialState,
} from "./fuzzUtils.js";
import { Operation } from "./operationTypes.js";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

describe("Fuzz - move", () => {
	const runsPerBatch = 50;
	const opsPerRun = 30;
	const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
		intraFieldMove: 1,
		crossFieldMove: 3,
		fieldSelection: {
			optional: 0,
			required: 0,
			sequence: 1,
			recurse: 2,
		},
	};
	const generatorFactory = () => takeAsync(opsPerRun, makeOpGenerator(editGeneratorOpWeights));

	const model: DDSFuzzModel<
		SharedTreeTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeTestFactory>
	> = {
		workloadName: "move",
		factory: new SharedTreeTestFactory(() => undefined),
		generatorFactory,
		reducer: fuzzReducer,
		validateConsistency: validateTreeConsistency,
	};

	const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
	emitter.on("testStart", (state: FuzzTestState) => {
		viewFromState(state, state.clients[0], populatedInitialState);
	});

	const options: Partial<DDSFuzzSuiteOptions> = {
		emitter,
		numberOfClients: 1,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 1,
		},
		defaultTestCount: runsPerBatch,
		saveFailures: {
			directory: failureDirectory,
		},
		detachedStartOptions: {
			numOpsBeforeAttach: 5,
			rehydrateDisabled: true,
		},
		reconnectProbability: 0.1,
		idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
	};
	createDDSFuzzSuite(model, options);
});