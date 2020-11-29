/* imports */
import * as mongoose from 'mongoose';
import 'reflect-metadata';
import * as semver from 'semver';

import { assertion, assertionIsClass, getName, isNullOrUndefined, mergeMetadata, mergeSchemaOptions } from './internal/utils';

/* istanbul ignore next */
if (!isNullOrUndefined(process?.version) && !isNullOrUndefined(mongoose?.version)) { // for usage on client side
  /* istanbul ignore next */
  if (semver.lt(mongoose?.version, '5.9.14')) {
    throw new Error('Please use mongoose 5.9.14 or higher [E001]');
  }

  /* istanbul ignore next */
  if (semver.lt(process.version.slice(1), '10.15.0')) {
    throw new Error('You are using a NodeJS Version below 10.15.0, Please Upgrade! [E002]');
  }
}

import { parseENV, setGlobalOptions } from './globalOptions';
import { DecoratorKeys } from './internal/constants';
import { constructors, models } from './internal/data';
import { _buildSchema } from './internal/schema';
import { logger } from './logSettings';
import { isModel } from './typeguards';
import type {
  AnyParamConstructor,
  DocumentType,
  IModelOptions,
  Ref,
  ReturnModelType
} from './types';

/* exports */
// export the internally used "mongoose", to not need to always import it
export { mongoose, setGlobalOptions };
export { setLogLevel, LogLevels } from './logSettings';
export * from './prop';
export * from './hooks';
export * from './plugin';
export * from './index';
export * from './modelOptions';
export * from './queryMethod';
export * from './typeguards';
export * as defaultClasses from './defaultClasses';
export * as errors from './internal/errors';
export * as types from './types';
export { DocumentType, Ref, ReturnModelType };
export { getClassForDocument, getClass, getName } from './internal/utils';
export { Severity } from './internal/constants';

parseENV(); // call this before anything to ensure they are applied

/**
 * Get a Model for a Class
 * Executes .setModelForClass if it can't find it already
 * @param cl The uninitialized Class
 * @returns The Model
 * @public
 * @example
 * ```ts
 * class Name {}
 *
 * const NameModel = getModelForClass(Name);
 * ```
 */
export function getModelForClass<U extends AnyParamConstructor<any>, QueryHelpers = {}>(cl: U, options?: IModelOptions) {
  assertionIsClass(cl);
  options = typeof options === 'object' ? options : {};

  const roptions: IModelOptions = mergeMetadata(DecoratorKeys.ModelOptions, options, cl);
  const name = getName(cl);

  if (models.has(name)) {
    return models.get(name) as ReturnModelType<U, QueryHelpers>;
  }

  const model =
    roptions?.existingConnection?.model.bind(roptions.existingConnection) ??
    roptions?.existingMongoose?.model.bind(roptions.existingMongoose) ??
    mongoose.model.bind(mongoose);

  const compiledmodel: mongoose.Model<any> = model(name, buildSchema(cl, roptions.schemaOptions));
  const refetchedOptions = (Reflect.getMetadata(DecoratorKeys.ModelOptions, cl) as IModelOptions) ?? {};

  if (refetchedOptions?.options?.runSyncIndexes) {
    // no async/await, to wait for execution on connection in the background
    compiledmodel.syncIndexes();
  }

  return addModelToTypegoose<U, QueryHelpers>(compiledmodel, cl);
}

/**
 * Get Model from internal cache
 * @param key ModelName key
 * @example
 * ```ts
 * class Name {}
 * getModelForClass(Name); // build the model
 * const NameModel = getModelWithString<typeof Name>("Name");
 * ```
 */
export function getModelWithString<U extends AnyParamConstructor<any>>(key: string): undefined | ReturnModelType<U> {
  assertion(typeof key === 'string', TypeError(`Expected "key" to be a string, got "${key}"`));

  return models.get(key) as any;
}

/**
 * Generates a Mongoose schema out of class props, iterating through all parents
 * @param cl The not initialized Class
 * @returns Returns the Build Schema
 * @example
 * ```ts
 * class Name {}
 * const NameSchema = buildSchema(Name);
 * const NameModel = mongoose.model("Name", NameSchema);
 * ```
 */
export function buildSchema<U extends AnyParamConstructor<any>>(cl: U, options?: mongoose.SchemaOptions) {
  assertionIsClass(cl);

  logger.debug('buildSchema called for "%s"', getName(cl));

  const mergedOptions = mergeSchemaOptions(options, cl);

  let sch: mongoose.Schema<U>;
  /** Parent Constructor */
  let parentCtor = Object.getPrototypeOf(cl.prototype).constructor;
  const parentClasses: AnyParamConstructor<any>[] = [];

  // iterate trough all parents
  while (parentCtor?.name !== 'Object') {
    // add parent class to the beginning of the array if not added yet.
    parentClasses.unshift(parentCtor);

    // set next parent
    parentCtor = Object.getPrototypeOf(parentCtor.prototype).constructor;
  }

  // iterate and build parent class schemas
  for (const parentClass of parentClasses) {
    // extend schema
    sch = _buildSchema(parentClass, sch!, mergedOptions, false);
  }

  // get schema of current model
  sch = _buildSchema(cl, sch!, mergedOptions);

  return sch;
}

/**
 * This can be used to add custom Models to Typegoose, with the type information of cl
 * Note: no gurantee that the type information is fully correct
 * @param model The model to store
 * @param cl The Class to store
 * @example
 * ```ts
 * class Name {}
 *
 * const schema = buildSchema(Name);
 * // modifications to the schame can be done
 * const model = addModelToTypegoose(mongoose.model("Name", schema), Name);
 * ```
 */
export function addModelToTypegoose<U extends AnyParamConstructor<any>, QueryHelpers = {}>(model: mongoose.Model<any>, cl: U) {
  assertion(model.prototype instanceof mongoose.Model, new TypeError(`"${model}" is not a valid Model!`));
  assertionIsClass(cl);

  const name = getName(cl);

  assertion(
    !models.has(name),
    new Error(
      'It seems like "addModelToTypegoose" got called twice\n' +
      'Or multiple classes with the same name are used, which is not supported!' +
      `(Model Name: "${name}") [E003]`
    )
  );

  if (constructors.get(name)) {
    logger.info('Class "%s" already existed in the constructors Map', name);
  }

  models.set(name, model);
  constructors.set(name, cl);

  return models.get(name) as ReturnModelType<U, QueryHelpers>;
}

/**
 * Deletes an existing model so that it can be overwritten
 * with another model
 * (deletes from mongoose.connection & typegoose models cache & typegoose constructors cache)
 * @param key
 * @example
 * ```ts
 * class Name {}
 * const NameModel = getModelForClass(Name);
 * deleteModel("Name");
 * ```
 */
export function deleteModel(name: string) {
  assertion(typeof name === 'string', new TypeError('name is not an string! (deleteModel)'));
  assertion(models.has(name), new Error(`Model "${name}" could not be found`));

  logger.debug('Deleting Model "%s"', name);

  models.get(name)!.db.deleteModel(name);

  models.delete(name);
  constructors.delete(name);
}

/**
 * Delete a model, with the given class
 * Same as "deleteModel", only that it can be done with the class instead of the name
 * @param cl The Class
 * @example
 * ```ts
 * class Name {}
 * const NameModel = getModelForClass(Name);
 * deleteModelWithClass(Name);
 * ```
 */
export function deleteModelWithClass<U extends AnyParamConstructor<any>>(cl: U) {
  assertionIsClass(cl);

  return deleteModel(getName(cl));
}

/**
 * Build a Model from a given class and return the model
 * @param from The Model to build From
 * @param cl The Class to make a model out
 * @param value The Identifier to use to differentiate documents (default: cl.name)
 * @example
 * ```ts
 * class C1 {}
 * class C2 extends C1 {}
 *
 * const C1Model = getModelForClass(C1);
 * const C2Model = getDiscriminatorModelForClass(C1Model, C1);
 * ```
 */
export function getDiscriminatorModelForClass<U extends AnyParamConstructor<any>, QueryHelpers = {}>(
  from: mongoose.Model<any>,
  cl: U,
  value?: string
) {
  assertion(isModel(from), new TypeError(`"${from}" is not a valid Model!`));
  assertionIsClass(cl);

  const name = getName(cl);
  if (models.has(name)) {
    return models.get(name) as ReturnModelType<U, QueryHelpers>;
  }

  const sch = buildSchema(cl) as mongoose.Schema & { paths: any; };

  const discriminatorKey = sch.get('discriminatorKey');
  if (sch.path(discriminatorKey)) {
    (sch.paths[discriminatorKey] as any).options.$skipDiscriminatorCheck = true;
  }

  const model = from.discriminator(name, sch, value ? value : name);

  return addModelToTypegoose<U, QueryHelpers>(model, cl);
}
