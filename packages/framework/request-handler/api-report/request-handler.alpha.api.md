## Alpha API Report File for "@fluidframework/request-handler"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { IContainerRuntime } from '@fluidframework/container-runtime-definitions/internal';
import { IRequest } from '@fluidframework/core-interfaces';
import { IResponse } from '@fluidframework/core-interfaces';
import { RequestParser } from '@fluidframework/runtime-utils/internal';

// @alpha @deprecated
export type RuntimeRequestHandler = (request: RequestParser, runtime: IContainerRuntime) => Promise<IResponse | undefined>;

// (No @packageDocumentation comment for this package)

```