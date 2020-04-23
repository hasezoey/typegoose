import * as mongoose from 'mongoose';

import { arrayProp, buildSchema, getClass, getName, isDocumentArray, prop, Ref } from '../../src/typegoose';
import { Genders } from '../enums/genders';
import { Alias, model as AliasModel } from '../models/alias';
import { GetClassTestParent, GetClassTestParentModel, GetClassTestSub } from '../models/getClass';
import { GetSet, GetSetModel } from '../models/getSet';
import { InternetUserModel } from '../models/internetUser';
import { Beverage, BeverageModel, InventoryModel, ScooterModel } from '../models/inventory';
import { OptionsClass, OptionsModel } from '../models/options';
import { UserModel } from '../models/user';
import {
  NonVirtual,
  NonVirtualGS,
  NonVirtualGSModel,
  NonVirtualModel,
  Virtual,
  VirtualModel,
  VirtualSub,
  VirtualSubModel
} from '../models/virtualprop';

it('should add a language and job using instance methods', async () => {
  const user = await UserModel.create({
    firstName: 'harry',
    lastName: 'potter',
    gender: Genders.MALE,
    languages: ['english'],
    uniqueId: 'unique-id'
  });
  await user.addJob({ position: 'Dark Wizzard', title: 'Archmage' });
  await user.addJob();
  const savedUser = await user.addLanguage();

  expect(savedUser.languages.includes('Hungarian')).toBe(true);
  expect(savedUser.previousJobs.length > 0).toBe(true);
  savedUser.previousJobs.map((prevJob) => {
    expect(prevJob.startedAt instanceof Date).toBe(true);
  });
});

it('should add and populate the virtual properties', async () => {
  const virtual1 = await VirtualModel.create({ dummyVirtual: 'dummyVirtual1' } as Virtual);
  const virtualsub1 = await VirtualSubModel.create({
    dummy: 'virtualSub1',
    virtual: virtual1._id
  } as Partial<VirtualSub>);
  const virtualsub2 = await VirtualSubModel.create({
    dummy: 'virtualSub2',
    virtual: mongoose.Types.ObjectId() as Ref<any>
  } as Partial<VirtualSub>);
  const virtualsub3 = await VirtualSubModel.create({
    dummy: 'virtualSub3',
    virtual: virtual1._id
  } as Partial<VirtualSub>);

  const newfound = await VirtualModel.findById(virtual1._id).populate('virtualSubs').exec();

  expect(newfound.dummyVirtual).toEqual('dummyVirtual1');
  expect(newfound.virtualSubs).not.toEqual(undefined);
  if (isDocumentArray(newfound.virtualSubs)) {
    expect(newfound.virtualSubs[0].dummy).toEqual('virtualSub1');
    expect(newfound.virtualSubs[0]._id.toString()).toEqual(virtualsub1._id.toString());
    expect(newfound.virtualSubs[1].dummy).toEqual('virtualSub3');
    expect(newfound.virtualSubs[1]._id.toString()).toEqual(virtualsub3._id.toString());
    expect(newfound.virtualSubs.includes(virtualsub2)).not.toBe(true);
  } else {
    fail('Expected "newfound.virtualSubs" to be populated');
  }
});

it('should make use of nonVirtual set pre-processor', async () => {
  {
    // test if everything works
    const doc = await NonVirtualModel.create({ non: 'HELLO THERE' } as Partial<NonVirtual>);

    expect(doc.non).not.toEqual(undefined);
    expect(doc.non).toEqual('hello there');
  }
  {
    // test if other options work too
    const doc = await NonVirtualModel.create({});

    expect(doc.non).not.toEqual(undefined);
    expect(doc.non).toEqual('hello_default');
  }
});

it(`should add dynamic fields using map`, async () => {
  const user = await InternetUserModel.create({
    socialNetworks: {
      twitter: 'twitter account',
      facebook: 'facebook account'
    },
    sideNotes: {
      day1: {
        content: 'day1',
        link: 'url'
      },
      day2: {
        content: 'day2',
        link: 'url//2'
      }
    },
    projects: {}
  });
  expect(user).not.toEqual(undefined);
  expect(user).toHaveProperty('socialNetworks');
  expect(user.socialNetworks).toBeInstanceOf(Map);
  expect(user.socialNetworks.get('twitter')).toEqual('twitter account');
  expect(user.socialNetworks.get('facebook')).toEqual('facebook account');
  expect(user).toHaveProperty('sideNotes');
  expect(user.sideNotes).toBeInstanceOf(Map);
  expect(user.sideNotes.get('day1')).toHaveProperty('content', 'day1');
  expect(user.sideNotes.get('day1')).toHaveProperty('link', 'url');
  expect(user.sideNotes.has('day2')).toEqual(true);

  expect(user.sideNotes.get('day1')).not.toHaveProperty('_id');
  expect(user.sideNotes.get('day2')).not.toHaveProperty('_id');
});

it('Should support dynamic references via refPath', async () => {
  const sprite = await BeverageModel.create({
    isDecaf: true,
    isSugarFree: false
  });

  await BeverageModel.create({
    isDecaf: false,
    isSugarFree: true
  });

  const vespa = await ScooterModel.create({
    makeAndModel: 'Vespa'
  });

  await InventoryModel.create({
    refItemPathName: 'Beverage',
    kind: sprite,
    count: 10,
    value: 1.99
  });

  await InventoryModel.create({
    refItemPathName: 'Scooter',
    kind: vespa,
    count: 1,
    value: 1099.98
  });

  // I should now have two "inventory" items, with different embedded reference documents.
  const items = await InventoryModel.find({}).populate('kind').exec();
  expect((items[0].kind as Beverage).isDecaf).toEqual(true);

  // wrong type to make TypeScript happy
  expect((items[1].kind as Beverage).isDecaf).toEqual(undefined);
});

it('it should alias correctly', () => {
  const created = new AliasModel({ alias: 'hello from aliasProp', normalProp: 'hello from normalProp' } as Alias);

  expect(created).not.toEqual(undefined);
  expect(created).toHaveProperty('normalProp', 'hello from normalProp');
  expect(created).toHaveProperty('alias', 'hello from aliasProp');
  expect(created).toHaveProperty('aliasProp');

  // include virtuals
  {
    const toObject = created.toObject({ virtuals: true });
    expect(toObject).not.toEqual(undefined);
    expect(toObject).toHaveProperty('normalProp', 'hello from normalProp');
    expect(toObject).toHaveProperty('alias', 'hello from aliasProp');
    expect(toObject).toHaveProperty('aliasProp', 'hello from aliasProp');
  }
  // do not include virtuals
  {
    const toObject = created.toObject();
    expect(toObject).not.toEqual(undefined);
    expect(toObject).toHaveProperty('normalProp', 'hello from normalProp');
    expect(toObject).toHaveProperty('alias', 'hello from aliasProp');
    expect(toObject).not.toHaveProperty('aliasProp');
  }
});

it('should add model with createdAt and updatedAt', async () => {
  const { id: createdId } = await OptionsModel.create({ someprop: 10 } as OptionsClass);

  const found = await OptionsModel.findById(createdId).exec();

  expect(found).not.toEqual(undefined);
  expect(found).toHaveProperty('someprop', 10);
  expect(found.createdAt).toBeInstanceOf(Date);
  expect(found.updatedAt).toBeInstanceOf(Date);
});

it('should make use of non-virtuals with pre- and post-processors', async () => {
  const doc = await NonVirtualGSModel.create({ non: ['hi', 'where?'] } as NonVirtualGS);
  // stored gets { non: 'hi where?' }

  expect(doc.non).not.toEqual(undefined);
  expect(doc.non).toEqual(['hi', 'where?']);
});

it('should add options to ref [szokodiakos#379]', () => {
  class T { }
  class TestRef {
    @prop({ ref: T, customoption: 'custom' })
    public someprop: Ref<T>;
  }

  const schema = buildSchema(TestRef);
  const someprop = schema.path('someprop');
  expect(schema).not.toEqual(undefined);
  expect(someprop).not.toEqual(undefined);
  // @ts-ignore
  const opt: any = someprop.options;
  expect(typeof opt.type).toEqual('function');
  expect(opt.ref).toEqual('T');
  expect(opt).toHaveProperty('customoption', 'custom');
});

it('should add options to refPath [szokodiakos#379]', () => {
  class T { }
  class TestRefPath {
    @prop({ default: 'T' })
    public something: string;

    @prop({ refPath: 'something', customoption: 'custom' })
    public someprop: Ref<T>;
  }

  const schema = buildSchema(TestRefPath);
  const someprop = schema.path('someprop');
  expect(schema).not.toEqual(undefined);
  expect(someprop).not.toEqual(undefined);
  // @ts-ignore
  const opt: any = someprop.options;
  expect(typeof opt.type).toEqual('function');
  expect(opt.refPath).toEqual('something');
  expect(opt).toHaveProperty('customoption', 'custom');
});

it('should add options to array-ref [szokodiakos#379]', () => {
  class T { }
  class TestArrayRef {
    @arrayProp({ ref: T, customoption: 'custom' })
    public someprop: Ref<T>[];
  }

  const schema = buildSchema(TestArrayRef);
  const someprop = schema.path('someprop');
  expect(schema).not.toEqual(undefined);
  expect(someprop).not.toEqual(undefined);
  // @ts-ignore
  const opt: any = someprop.options.type[0];
  expect(typeof opt.type).toEqual('function');
  expect(opt.ref).toEqual('T');
  expect(opt).toHaveProperty('customoption', 'custom');
});

it('should add options to array-refPath [szokodiakos#379]', () => {
  class T { }
  class TestArrayRefPath {
    @prop({ default: 'T' })
    public something: string;

    @arrayProp({ refPath: 'something', customoption: 'custom' })
    public someprop: Ref<T>;
  }

  const schema = buildSchema(TestArrayRefPath);
  const someprop = schema.path('someprop');
  expect(schema).not.toEqual(undefined);
  expect(someprop).not.toEqual(undefined);
  // @ts-ignore
  const opt: any = someprop.options.type[0];
  expect(typeof opt.type).toEqual('function');
  expect(opt.refPath).toEqual('something');
  expect(opt).toHaveProperty('customoption', 'custom');
});

it('should make use of virtual get- & set-ters', async () => {
  {
    const doc = await GetSetModel.create({ actualProp: 'hello1' } as GetSet);
    expect(doc).not.toEqual(undefined);
    expect(doc.actualProp).toEqual('hello1');
    expect(doc.some).toEqual('hello1');
  }
  {
    const doc = await GetSetModel.create({ some: 'hello2' } as GetSet);
    expect(doc).not.toEqual(undefined);
    expect(doc.actualProp).toEqual('hello2');
    expect(doc.some).toEqual('hello2');
  }
});

it('should add schema paths when there is a virtual called `name`', () => {
  class TestName {
    @prop()
    public something: string;

    public get name() {
      return 'TestNameNOT';
    }
  }

  const schema = buildSchema(TestName);
  const someprop = schema.path('something');

  expect(getName(TestName)).toEqual('TestName');
  expect(schema).not.toEqual(undefined);
  expect(someprop).not.toEqual(undefined);
});

describe('utils.getClass', () => {
  it('should get class by string', () => {
    const doc = new GetClassTestParentModel({ testy: { test: 'hi' } });

    expect(getClass(doc.typegooseName())).toEqual(GetClassTestParent);
    expect(getClass((doc.testy as any).typegooseName())).toEqual(GetClassTestSub);
  });

  it('should get class by Document / Embedded', () => {
    const doc = new GetClassTestParentModel({ testy: { test: 'hi' } });

    expect(getClass(doc)).toEqual(GetClassTestParent);
    expect(getClass(doc.testy)).toEqual(GetClassTestSub);
  });

  it('should get class by typegooseString', () => {
    const doc = { typegooseName: getName(GetClassTestParent), testy: { typegooseName: getName(GetClassTestSub) } };

    expect(getClass(doc)).toEqual(GetClassTestParent);
    expect(getClass(doc.testy)).toEqual(GetClassTestSub);
  });
});
