import * as mongoose from 'mongoose';
import { DecoratorKeys } from '../../src/internal/constants';
import { assertion, assignMetadata, createArrayFromDimensions, getName, mergeMetadata, mergeSchemaOptions } from '../../src/internal/utils';
import { logger } from '../../src/logSettings';
import {
  addModelToTypegoose,
  buildSchema,
  DocumentType,
  getModelForClass,
  getModelWithString,
  isDocumentArray,
  modelOptions,
  Passthrough,
  prop,
  queryMethod,
} from '../../src/typegoose';
import type { AsQueryMethod, QueryMethodMap, Ref, ReturnModelType } from '../../src/types';

// Note: this file is meant for github issue verification & test adding for these
// -> and when not an outsourced class(/model) is needed

it('should not error when trying to get model multiple times', () => {
  class TEST {}

  getModelForClass(TEST);
  getModelForClass(TEST);
});

it('should build multiple times', () => {
  class TEST {}

  buildSchema(TEST);
  buildSchema(TEST);
});

it('should make use of addModelToTypegoose', async () => {
  class TestAMTT {
    @prop({ required: true })
    public somevalue!: string;

    public somesecondvalue!: string;
  }

  const schema = buildSchema(TestAMTT);
  schema.add({ somesecondvalue: { type: String, required: true } });
  const model = addModelToTypegoose(mongoose.model(TestAMTT.name, schema), TestAMTT);
  const doc = await model.create({ somevalue: 'hello from SV', somesecondvalue: 'hello from SSV' } as TestAMTT);

  expect(doc).not.toBeUndefined();
  expect(doc.somevalue).toEqual('hello from SV');
  expect(doc.somesecondvalue).toEqual('hello from SSV');
});

it('should make use of Map default', async () => {
  class TestMapDefault {
    @prop({ type: String, default: new Map([['hello', 'hello']]) })
    public test?: Map<string, string>;

    @prop()
    public someother?: string;
  }

  const model = getModelForClass(TestMapDefault);
  const { _id: id } = await model.create({ someother: 'hi' });

  const found = await model.findById(id).orFail().exec();
  expect(found).not.toBeUndefined();
  expect(found.someother).toEqual('hi');
  expect(found.test instanceof Map).toBe(true);
  expect(new Map(found.test!)).toEqual(new Map([['hello', 'hello']]));
});

it('should work with Objects in Class [szokodiakos#54]', async () => {
  class TESTObject {
    @prop()
    public test: {
      anotherTest: string;
    };
  }

  logger.warn = jest.fn();

  const model = getModelForClass(TESTObject);
  const doc = await model.create({ test: { anotherTest: 'hello' } } as TESTObject);

  expect((logger.warn as any).mock.calls.length).toEqual(1);
  expect(doc).not.toBeUndefined();
  expect(typeof doc.test).toBe('object');
  expect(doc.test.anotherTest).toEqual('hello');
});

it('simple test for assignMetadata', () => {
  class TestAssignMetadata {}

  assignMetadata(DecoratorKeys.ModelOptions, { testOption: 'hello' }, TestAssignMetadata);

  const reflected = Reflect.getMetadata(DecoratorKeys.ModelOptions, TestAssignMetadata);

  expect(reflected).not.toBeUndefined();
  expect(reflected).toHaveProperty('testOption', 'hello');
});

it('should just run with an non existing value in "assignMetadata"', () => {
  class Dummy {}

  assignMetadata(DecoratorKeys.ModelOptions, { test: 'hello' }, Dummy);
  assignMetadata(DecoratorKeys.ModelOptions, undefined, Dummy);
  expect(Reflect.getMetadata(DecoratorKeys.ModelOptions, Dummy)).toEqual({ test: 'hello' });
});

it('should just run with an non existing value in "mergeMetadata"', () => {
  class Dummy {}

  assignMetadata(DecoratorKeys.ModelOptions, { schemaOptions: { _id: false } }, Dummy);
  expect(mergeMetadata(DecoratorKeys.ModelOptions, undefined, Dummy)).toEqual({ schemaOptions: { _id: false } });
});
it('should not modify current metadata object in "mergeMetadata"', () => {
  class Dummy {}

  const someData = { property: 'value' };
  Reflect.defineMetadata(DecoratorKeys.ModelOptions, someData, Dummy);
  mergeMetadata(DecoratorKeys.ModelOptions, { schemaOptions: { _id: false } }, Dummy);
  expect(someData).toEqual({ property: 'value' });
});

it('should just run with an non existing value in "mergeSchemaOptions"', () => {
  class Dummy {}

  assignMetadata(DecoratorKeys.ModelOptions, { schemaOptions: { _id: false } }, Dummy);
  expect(mergeSchemaOptions(undefined, Dummy)).toEqual({ _id: false });
});

it('merge options with assignMetadata', () => {
  @modelOptions({ schemaOptions: { timestamps: true, _id: false } })
  class TestAssignMetadata {}

  const model = getModelForClass(TestAssignMetadata, {
    schemaOptions: {
      _id: true,
      // @ts-expect-error because it is only there for tests and doesn't exists on type "SchemaOptions" (from mongoose)
      testOption: 'hello',
    },
  });

  const schemaOptions = (model.schema as any).options;

  expect(schemaOptions).toHaveProperty('testOption', 'hello');
  expect(schemaOptions).toHaveProperty('timestamps', true);
  expect(schemaOptions).toHaveProperty('_id', true);
});

it('should make use of "@prop({ _id: false })" and have no _id', async () => {
  class TestidFalseNested {
    @prop()
    public hi: number;
  }

  class TestidFalse {
    @prop({ _id: false })
    public someprop?: TestidFalseNested;
  }

  const model = getModelForClass(TestidFalse);
  const doc = await model.create({ someprop: { hi: 10 } } as TestidFalse);

  expect(doc).not.toBeUndefined();
  expect(doc.someprop).toHaveProperty('hi', 10);
  expect(doc.someprop).not.toHaveProperty('_id');
});

// it('should run with a self-containing-class [typegoose#42]', () => {
//   class SelfContaining {
//     @prop()
//     public nest?: SelfContaining;
//   }

//   getModelForClass(SelfContaining);
// });

it('should allow self-referencing classes', async () => {
  class SelfReference {
    @prop({ ref: () => SelfReference })
    public ref?: Ref<SelfReference>;
  }

  const SelfReferenceModel = getModelForClass(SelfReference);

  const doc1 = await SelfReferenceModel.create();
  const doc2 = await SelfReferenceModel.create({ ref: doc1 });

  const found = await SelfReferenceModel.findById(doc2).orFail().populate('ref').exec();

  expect(found.toJSON()).toEqual(doc2.toJSON());
  const schemaPath = SelfReferenceModel.schema.path('ref');
  expect(schemaPath).toBeInstanceOf(mongoose.Schema.Types.ObjectId);
  expect((schemaPath as any).options.ref).toEqual(getName(SelfReference));
});

it('should make use of required as function [szokodiakos#247]', async () => {
  class RequiredFunction {
    @prop({ required: true })
    public someProp!: number;

    @prop({
      required(this: DocumentType<RequiredFunction>) {
        return this.someProp > 0;
      },
    })
    public someRequired?: string;
  }

  const model = getModelForClass(RequiredFunction);

  // this should work because the length is not higher than 0
  await model.create({ someProp: 0 } as RequiredFunction);

  try {
    // this should not work because someProp is higher than 0
    await model.create({ someProp: 3 } as RequiredFunction);
    fail('Expected to throw an "ValidationError"');
  } catch (err) {
    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
  }
});

it('should use type "Buffer" [typegoose#88]', async () => {
  class TestBuffer {
    @prop({ required: true })
    public propy!: Buffer;
  }

  const model = getModelForClass(TestBuffer);

  expect(model.schema.path('propy')).toBeInstanceOf(mongoose.Schema.Types.Buffer);

  const { _id: id } = await model.create({ propy: Buffer.from('Hello') } as TestBuffer);

  const found = await model.findById(id).orFail().exec();
  expect(found).not.toBeUndefined();
  expect(found.propy).toBeInstanceOf(Buffer);
  expect(found.propy.toString()).toEqual('Hello');
});

it('should use "type" as a last resort', async () => {
  class TestPropOptionType {
    @prop({ type: mongoose.Schema.Types.Number })
    public propy: string;
  }

  const model = getModelForClass(TestPropOptionType);

  expect(model.schema.path('propy')).toBeInstanceOf(mongoose.Schema.Types.Number);

  const doc = new model({ propy: 100 });

  expect(doc).not.toBeUndefined();
  expect(doc.propy).toEqual(100);
});

it('should run with Custom Types', async () => {
  // this test is a modified version of https://mongoosejs.com/docs/customschematypes.html
  class CustomInt extends mongoose.SchemaType {
    constructor(key: string, options: any) {
      super(key, options, 'CustomInt');
    }

    public cast(val) {
      return Number(val);
    }
  }

  (mongoose.Schema.Types as any).CustomInt = CustomInt;

  class CustomIntClass {
    @prop({ required: true, type: CustomInt })
    public num: number;
  }

  const model = getModelForClass(CustomIntClass);

  const doc = new model({ num: 1 } as CustomIntClass);

  await doc.validate();

  expect(doc).not.toBeUndefined();
  const path = doc.schema.path('num');
  expect(path).not.toBeUndefined();
  expect(path).not.toBeInstanceOf(mongoose.Schema.Types.Mixed);
  expect(path).toBeInstanceOf(CustomInt);
});

it('should return the correct model "getModelWithString"', () => {
  class GetModelWithStringClass {
    @prop()
    public hi: string;
  }

  const model = getModelForClass(GetModelWithStringClass);
  const gotModel = getModelWithString<typeof GetModelWithStringClass>(model.modelName);

  expect(model).not.toBeUndefined();
  expect(gotModel).not.toBeUndefined();
  expect(gotModel).toEqual(model);
});

it('should return undefined if model does not exists (getModelWithString)', () => {
  const type = getModelWithString('someTestyString');

  expect(type).toBeUndefined();
});

it('should also allow "mongoose.Types.Array<string>" as possible type', () => {
  class TypesArray {
    @prop({ type: String })
    public someString: mongoose.Types.Array<string>;
  }

  const schema = buildSchema(TypesArray);

  expect(schema.path('someString')).toBeInstanceOf(mongoose.Schema.Types.Array);
  expect((schema.path('someString') as any).caster).toBeInstanceOf(mongoose.Schema.Types.String);
});

it('should give a warning [typegoose/typegoose#152]', () => {
  logger.warn = jest.fn();

  class TestANY {
    @prop()
    public someANY: any;
  }

  const schema = buildSchema(TestANY);
  expect((logger.warn as any).mock.calls.length).toEqual(1);
  expect(schema.path('someANY')).toBeInstanceOf(mongoose.Schema.Types.Mixed);
});

it('should create 1D Array (createArrayFromDimensions)', () => {
  const should = [{ someThing: true }];
  expect(createArrayFromDimensions({}, { someThing: true }, '', '')).toEqual(should);
});

it('should create 5D Array (createArrayFromDimensions)', () => {
  const should = [[[[[{ someThing: true }]]]]];
  expect(createArrayFromDimensions({ dim: 5 }, { someThing: true }, '', '')).toEqual(should);
});

it('should not add another array if "extra" is already an array (createArrayFromDimensions)', () => {
  const should = [{ someThing: true }];
  expect(createArrayFromDimensions({}, [{ someThing: true }], '', '')).toEqual(should);
});

it('should add "null" to the enum (addNullToEnum)', async () => {
  enum SomeNumberEnum {
    one = 1,
    two = 2,
    three = 3,
  }

  class AddNullToEnum {
    @prop({ enum: SomeNumberEnum, addNullToEnum: true, type: Number })
    public value?: SomeNumberEnum | null;
  }

  const AddNullToEnumModel = getModelForClass(AddNullToEnum);

  const doc = new AddNullToEnumModel({ value: null } as AddNullToEnum);
  await doc.validate();

  const path: any = AddNullToEnumModel.schema.path('value');
  expect(path).toBeInstanceOf(mongoose.Schema.Types.Number);
  expect(path.options.enum).toEqual([1, 2, 3, null]);
});

it('should add query Methods', async () => {
  interface FindHelpers {
    findByName: AsQueryMethod<typeof findByName>;
    findByLastname: AsQueryMethod<typeof findByLastname>;
  }

  function findByName(this: ReturnModelType<typeof QueryMethodsClass, FindHelpers>, name: string) {
    return this.find({ name });
  }

  function findByLastname(this: ReturnModelType<typeof QueryMethodsClass, FindHelpers>, lastname: string) {
    return this.find({ lastname });
  }

  @queryMethod(findByName)
  @queryMethod(findByLastname)
  class QueryMethodsClass {
    @prop({ required: true })
    public name: string;

    @prop({ required: true })
    public lastname: string;
  }

  const QueryMethodsModel = getModelForClass<typeof QueryMethodsClass, FindHelpers>(QueryMethodsClass);

  const metadata: QueryMethodMap = Reflect.getMetadata(DecoratorKeys.QueryMethod, QueryMethodsClass);
  expect(Array.from(metadata)).toEqual(
    expect.arrayContaining([['findByName', findByName]]) && expect.arrayContaining([['findByLastname', findByLastname]])
  );

  const doc = await QueryMethodsModel.create({ name: 'hello', lastname: 'world' });

  const found = await QueryMethodsModel.find().findByName('hello').findByLastname('world').orFail().exec();
  assertion(isDocumentArray(found), new Error('Found is not an document array'));
  expect(found[0].toObject()).toEqual(doc.toObject());
});

it('should be map none/array/map correctly if using get/set options [typegoose#422]', async () => {
  class TestGetSetOptions {
    @prop({ get: () => 0, set: () => 1 })
    public normal?: number;

    @prop({ type: Number, get: () => [0], set: () => [1] })
    public array?: number[];

    @prop({ type: Number, get: () => new Map([['0', 0]]), set: () => new Map([['1', 1]]) })
    public map?: Map<string, number>;
  }

  const schema = buildSchema(TestGetSetOptions);
  expect(schema.path('normal')).toBeInstanceOf(mongoose.Schema.Types.Number);
  expect(schema.path('normal') as any).not.toHaveProperty('caster');
  expect(schema.path('array')).toBeInstanceOf(mongoose.Schema.Types.Array);
  expect((schema.path('array') as any).caster).toBeInstanceOf(mongoose.Schema.Types.Number);
  expect(schema.path('map')).toBeInstanceOf(mongoose.Schema.Types.Map);
  expect((schema.path('map') as any).$__schemaType).toBeInstanceOf(mongoose.Schema.Types.Number);
  expect(schema.path('map') as any).not.toHaveProperty('caster');
});

it('should not Error if get/set options are used and type is an class and is an array [typegoose#478]', async () => {
  class SubGetSetClassArray {
    @prop()
    public dummy?: string;
  }

  class ParentGetSetClassArray {
    @prop({ get: (v) => v, set: (v) => v, type: () => [SubGetSetClassArray] })
    public nested?: SubGetSetClassArray[];
  }

  buildSchema(ParentGetSetClassArray);
});

it('should make use of the "Passthrough" class', async () => {
  const alsoSchema = new mongoose.Schema({
    something: { type: { somePath: String } },
    somethingExtra: { type: { someExtraPath: [String] } },
  });

  class SomeTestClass {
    @prop({ type: () => new Passthrough({ somePath: String }) })
    public something?: { somePath: string };

    @prop({ type: new Passthrough({ someExtraPath: [String] }) })
    public somethingExtra?: { someExtraPath: string[] };
  }

  const sch = buildSchema(SomeTestClass);
  const somethingPath = sch.path('something');
  const somethingExtraPath = sch.path('somethingExtra');
  const alsoSomethingPath = alsoSchema.path('something');
  const alsoSomethingExtraPath = alsoSchema.path('somethingExtra');

  expect(somethingPath).toBeInstanceOf(mongoose.Schema.Types.Mixed);
  expect(somethingExtraPath).toBeInstanceOf(mongoose.Schema.Types.Mixed);
  expect(somethingPath).toStrictEqual(alsoSomethingPath);
  expect(somethingExtraPath).toStrictEqual(alsoSomethingExtraPath);

  expect(somethingPath).toEqual(
    expect.objectContaining({
      options: { type: { somePath: String } },
    })
  );
  expect(somethingExtraPath).toEqual(
    expect.objectContaining({
      options: { type: { someExtraPath: [String] } },
    })
  );
});
