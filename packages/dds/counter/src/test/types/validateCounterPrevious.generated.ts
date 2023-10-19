/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "@fluidframework/counter-previous";
import type * as current from "../../index";


// See 'build-tools/src/type-test-generator/compatibility.ts' for more information.
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: T extends boolean | bigint | symbol
	? T
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCounter": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISharedCounter():
    TypeOnly<old.ISharedCounter>;
declare function use_current_InterfaceDeclaration_ISharedCounter(
    use: TypeOnly<current.ISharedCounter>);
use_current_InterfaceDeclaration_ISharedCounter(
    get_old_InterfaceDeclaration_ISharedCounter());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCounter": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISharedCounter():
    TypeOnly<current.ISharedCounter>;
declare function use_old_InterfaceDeclaration_ISharedCounter(
    use: TypeOnly<old.ISharedCounter>);
use_old_InterfaceDeclaration_ISharedCounter(
    get_current_InterfaceDeclaration_ISharedCounter());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCounterEvents": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISharedCounterEvents():
    TypeOnly<old.ISharedCounterEvents>;
declare function use_current_InterfaceDeclaration_ISharedCounterEvents(
    use: TypeOnly<current.ISharedCounterEvents>);
use_current_InterfaceDeclaration_ISharedCounterEvents(
    get_old_InterfaceDeclaration_ISharedCounterEvents());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCounterEvents": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISharedCounterEvents():
    TypeOnly<current.ISharedCounterEvents>;
declare function use_old_InterfaceDeclaration_ISharedCounterEvents(
    use: TypeOnly<old.ISharedCounterEvents>);
use_old_InterfaceDeclaration_ISharedCounterEvents(
    get_current_InterfaceDeclaration_ISharedCounterEvents());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedCounter": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SharedCounter():
    TypeOnly<old.SharedCounter>;
declare function use_current_ClassDeclaration_SharedCounter(
    use: TypeOnly<current.SharedCounter>);
use_current_ClassDeclaration_SharedCounter(
    get_old_ClassDeclaration_SharedCounter());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedCounter": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SharedCounter():
    TypeOnly<current.SharedCounter>;
declare function use_old_ClassDeclaration_SharedCounter(
    use: TypeOnly<old.SharedCounter>);
use_old_ClassDeclaration_SharedCounter(
    get_current_ClassDeclaration_SharedCounter());
