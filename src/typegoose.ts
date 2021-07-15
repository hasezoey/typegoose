/* imports */
import * as mongoose from 'mongoose';
import 'reflect-metadata';
import * as semver from 'semver';
import { assertion, assertionIsClass, getName, isNullOrUndefined, mergeMetadata, mergeSchemaOptions } from './internal/utils';

/* istanbul ignore next */
if (!isNullOrUndefined(process?.version) && !isNullOrUndefined(mongoose?.version)) {
  // for usage on client side
  /* istanbul ignore next */
  if (semver.lt(mongoose?.version, '5.12.14')) {
    throw new Error(`Please use mongoose 5.12.14 or higher (Current mongoose: ${mongoose.version}) [E001]`);
  }

  /* istanbul ignore next */
  if (semver.lt(process.version.slice(1), '12.22.0')) {
    throw new Error('You are using a NodeJS Version below 12.22.0, Please Upgrade! [E002]');
  }
}

import { parseENV, setGlobalOptions } from './globalOptions';
import { DecoratorKeys } from './internal/constants';
import { constructors, models } from './internal/data';
import { _buildSchema } from './internal/schema';
import { logger } from './logSettings';
import { isModel } from './typeguards';
import type { AnyParamConstructor, BeAnObject, DocumentType, IModelOptions, Ref, ReturnModelType } from './types';

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
 * @param cl The uninitialized Class
 * @returns The Model
 * @public
 * @example
 * ```ts
 * class ClassName {}
 *
 * const NameModel = getModelForClass(ClassName);
 * ```
 */
export function getModelForClass<U extends AnyParamConstructor<any>, QueryHelpers = BeAnObject>(cl: U, options?: IModelOptions) {
  assertionIsClass(cl);
  options = typeof options === 'object' ? options : {};

  const roptions: IModelOptions = mergeMetadata(DecoratorKeys.ModelOptions, options, cl);
  const name = getName(cl, options);

  if (models.has(name)) {
    return models.get(name) as ReturnModelType<U, QueryHelpers>;
  }

  const model =
    roptions?.existingConnection?.model.bind(roptions.existingConnection) ??
    roptions?.existingMongoose?.model.bind(roptions.existingMongoose) ??
    mongoose.model.bind(mongoose);

  const compiledmodel: mongoose.Model<any> = model(name, buildSchema(cl, roptions.schemaOptions, options));
  const refetchedOptions = (Reflect.getMetadata(DecoratorKeys.ModelOptions, cl) as IModelOptions) ?? {};

  if (refetchedOptions?.options?.runSyncIndexes) {
    // no async/await, to wait for execution on connection in the background
    compiledmodel.syncIndexes();
  }

  return addModelToTypegoose<U, QueryHelpers>(compiledmodel, cl, {
    existingMongoose: roptions?.existingMongoose,
    existingConnection: roptions?.existingConnection,
  });
}

/**
 * Get Model from internal cache
 * @param key ModelName key
 * @example
 * ```ts
 * class ClassName {}
 * getModelForClass(ClassName); // build the model
 * const NameModel = getModelWithString<typeof ClassName>("ClassName");
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
 * class ClassName {}
 * const NameSchema = buildSchema(ClassName);
 * const NameModel = mongoose.model("Name", NameSchema);
 * ```
 */
export function buildSchema<U extends AnyParamConstructor<any>>(
  cl: U,
  options?: mongoose.SchemaOptions,
  overwriteOptions?: IModelOptions
): mongoose.Schema<DocumentType<U>> {
  assertionIsClass(cl);

  logger.debug('buildSchema called for "%s"', getName(cl, overwriteOptions));

  const mergedOptions = mergeSchemaOptions(options, cl);

  let sch: mongoose.Schema<DocumentType<U>> | undefined = undefined;
  /** Parent Constructor */
  let parentCtor = Object.getPrototypeOf(cl.prototype).constructor;
  // iterate trough all parents
  while (parentCtor?.name !== 'Object') {
    // extend schema
    sch = _buildSchema(parentCtor, sch, mergedOptions, false, overwriteOptions);
    // set next parent
    parentCtor = Object.getPrototypeOf(parentCtor.prototype).constructor;
  }
  // get schema of current model
  sch = _buildSchema(cl, sch, mergedOptions, true, overwriteOptions);

  return sch;
}

/**
 * This can be used to add custom Models to Typegoose, with the type information of cl
 * Note: no gurantee that the type information is fully correct
 * @param model The model to store
 * @param cl The Class to store
 * @param options? Optional param for existingMongoose or existingConnection
 * @example
 * ```ts
 * class ClassName {}
 *
 * const schema = buildSchema(ClassName);
 * // modifications to the schame can be done
 * const model = addModelToTypegoose(mongoose.model("Name", schema), ClassName);
 * ```
 */
export function addModelToTypegoose<U extends AnyParamConstructor<any>, QueryHelpers = BeAnObject>(
  model: mongoose.Model<any>,
  cl: U,
  options?: { existingMongoose?: mongoose.Mongoose; existingConnection?: any }
) {
  const mongooseModel = options?.existingMongoose?.Model || options?.existingConnection?.base?.Model || mongoose.Model;

  assertion(model.prototype instanceof mongooseModel, new TypeError(`"${model}" is not a valid Model!`));
  assertionIsClass(cl);

  const name = model.modelName;

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
 * Deletes an existing model so that it can be overwritten with another model
 * (deletes from mongoose.connection & typegoose models cache & typegoose constructors cache)
 * @param key
 * @example
 * ```ts
 * class ClassName {}
 * const NameModel = getModelForClass(ClassName);
 * deleteModel("ClassName");
 * ```
 */
export function deleteModel(name: string) {
  assertion(typeof name === 'string', new TypeError('name is not an string! (deleteModel)'));
  const model = models.get(name);
  assertion(model, new Error(`Model "${name}" could not be found`));

  logger.debug('Deleting Model "%s"', name);

  model.db.deleteModel(name);

  models.delete(name);
  constructors.delete(name);
}

/**
 * Delete a model, with the given class
 * Same as "deleteModel", only that it can be done with the class instead of the name
 * @param cl The Class
 * @example
 * ```ts
 * class ClassName {}
 * const NameModel = getModelForClass(ClassName);
 * deleteModelWithClass(ClassName);
 * ```
 */
export function deleteModelWithClass<U extends AnyParamConstructor<any>>(cl: U) {
  assertionIsClass(cl);

  let name = getName(cl);

  if (!models.has(name)) {
    logger.debug(`Class "${name}" is not in "models", trying to find in "constructors"`);
    let found = false;

    for (const [cname, constructor] of constructors) {
      if (constructor === cl) {
        logger.debug(`Found Class in "constructors" with class name "${name}" and entered name "${cname}""`);
        name = cname;
        found = true;
      }
    }

    if (!found) {
      logger.debug(`Could not find class "${name}" in constructors`);

      return;
    }
  }

  return deleteModel(name);
}

/**
 * Build a Model from a given class and return the model
 * @param from The Model to build From
 * @param cl The Class to make a model out
 * @param value The Identifier to use to differentiate documents (default: cl.name)
 * @example
 * ```ts
 * class Class1 {}
 * class Class2 extends Class1 {}
 *
 * const Class1Model = getModelForClass(Class1);
 * const Class2Model = getDiscriminatorModelForClass(Class1Model, Class1);
 * ```
 */
export function getDiscriminatorModelForClass<U extends AnyParamConstructor<any>, QueryHelpers = BeAnObject>(
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

  const sch: mongoose.Schema<any> = buildSchema(cl);

  const discriminatorKey = sch.get('discriminatorKey');

  if (sch.path(discriminatorKey)) {
    (sch.paths[discriminatorKey] as any).options.$skipDiscriminatorCheck = true;
  }

  const model = from.discriminator(name, sch, value ? value : name);

  return addModelToTypegoose<U, QueryHelpers>(model, cl);
}

/**
 * Use this class if raw mongoose for this path is wanted
 * It is still recommended to use the typegoose classes directly for full type and validation support
 * Note: using this, paths are of type "Mixed" (with some validation)
 * @example
 * ```ts
 * class Dummy {
 *   @prop({ type: () => new Passthrough({ somePath: String }) })
 *   public somepath: { somePath: string };
 * }
 * ```
 */
// Note: for "SchemaDefinitionType", i have no clue what it does, but it is also defined on "mongoose.Schema" and kinda required for "mongoose.DocumentDefinition"
export class Passthrough<SchemaDefinitionType = undefined> {
  public raw: mongoose.SchemaDefinition<mongoose.DocumentDefinition<SchemaDefinitionType>>;

  /**
   * Use this like `new mongoose.Schema()`
   * @param raw the Schema definition
   */
  constructor(raw: mongoose.SchemaDefinition<mongoose.DocumentDefinition<SchemaDefinitionType>>) {
    this.raw = raw;
  }
}
