/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-validator in @fluidframework/build-tools.
 */
import * as old from "@fluidframework/data-object-base-previous";
import * as current from "../../index";

type TypeOnly<T> = {
    [P in keyof T]: TypeOnly<T[P]>;
};

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_LazyLoadedDataObject": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_LazyLoadedDataObject():
    TypeOnly<old.LazyLoadedDataObject>;
declare function use_current_ClassDeclaration_LazyLoadedDataObject(
    use: TypeOnly<current.LazyLoadedDataObject>);
use_current_ClassDeclaration_LazyLoadedDataObject(
    get_old_ClassDeclaration_LazyLoadedDataObject());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_LazyLoadedDataObject": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_LazyLoadedDataObject():
    TypeOnly<current.LazyLoadedDataObject>;
declare function use_old_ClassDeclaration_LazyLoadedDataObject(
    use: TypeOnly<old.LazyLoadedDataObject>);
use_old_ClassDeclaration_LazyLoadedDataObject(
    get_current_ClassDeclaration_LazyLoadedDataObject());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_LazyLoadedDataObjectFactory": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_LazyLoadedDataObjectFactory():
    TypeOnly<old.LazyLoadedDataObjectFactory<any>>;
declare function use_current_ClassDeclaration_LazyLoadedDataObjectFactory(
    use: TypeOnly<current.LazyLoadedDataObjectFactory<any>>);
use_current_ClassDeclaration_LazyLoadedDataObjectFactory(
    get_old_ClassDeclaration_LazyLoadedDataObjectFactory());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_LazyLoadedDataObjectFactory": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_LazyLoadedDataObjectFactory():
    TypeOnly<current.LazyLoadedDataObjectFactory<any>>;
declare function use_old_ClassDeclaration_LazyLoadedDataObjectFactory(
    use: TypeOnly<old.LazyLoadedDataObjectFactory<any>>);
use_old_ClassDeclaration_LazyLoadedDataObjectFactory(
    get_current_ClassDeclaration_LazyLoadedDataObjectFactory());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_RuntimeFactory": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_RuntimeFactory():
    TypeOnly<old.RuntimeFactory>;
declare function use_current_ClassDeclaration_RuntimeFactory(
    use: TypeOnly<current.RuntimeFactory>);
use_current_ClassDeclaration_RuntimeFactory(
    get_old_ClassDeclaration_RuntimeFactory());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_RuntimeFactory": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_RuntimeFactory():
    TypeOnly<current.RuntimeFactory>;
declare function use_old_ClassDeclaration_RuntimeFactory(
    use: TypeOnly<old.RuntimeFactory>);
use_old_ClassDeclaration_RuntimeFactory(
    get_current_ClassDeclaration_RuntimeFactory());
