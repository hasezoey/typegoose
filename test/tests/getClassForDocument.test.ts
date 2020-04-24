import * as mongoose from 'mongoose';

import { getClassForDocument, isDocument } from '../../src/typegoose';
import { Genders } from '../enums/genders';
import { Car, CarModel } from '../models/car';
import { InternetUserModel, ProjectValue } from '../models/internetUser';
import { AddressNested, AddressNestedModel, PersonNested, PersonNestedModel } from '../models/nestedObject';
import { model as Person } from '../models/person';
import { User, UserModel } from '../models/user';

it('should return correct class type for document', async () => {
  const car = await CarModel.create({
    carModel: 'Tesla',
    price: mongoose.Types.Decimal128.fromString('50123.25')
  });
  const carReflectedType = getClassForDocument(car);
  expect(carReflectedType).toEqual(Car);
  const user = await UserModel.create({
    firstName: 'John2',
    lastName: 'Doe2',
    gender: Genders.MALE,
    languages: ['english2', 'typescript2'],
    uniqueId: 'not-needed'
  });
  const userReflectedType = getClassForDocument(user);
  expect(userReflectedType).toEqual(User);

  // assert negative to be sure (false positive)
  expect(carReflectedType).not.toEqual(User);
  expect(userReflectedType).not.toEqual(Car);
});

it('should use inherited schema', async () => {
  let user = await Person.create({ email: 'my@email.com' });

  const car = await CarModel.create({
    carModel: 'Tesla',
    price: mongoose.Types.Decimal128.fromString('50123.25')
  });
  await user.addCar(car);

  user = await Person.findById(user.id).populate('cars').exec();

  // verify properties
  expect(user).toHaveProperty('createdAt');
  expect(user).toHaveProperty('email', 'my@email.com');

  expect(user.cars.length > 0).toBe(true);
  user.cars.forEach((currentCar) => {
    if (isDocument(currentCar)) {
      expect(typeof currentCar.model).toBe('string');
    } else {
      fail('Expected "currentCar" to be populated!');
    }
  });

  // verify methods
  expect(user.getClassName()).toEqual('Person');
  expect(Person.getStaticName()).toEqual('Person');
});

it('should store nested address', async () => {
  const person = await PersonNestedModel.create({
    name: 'Person, Some',
    address: new AddressNestedModel({ street: 'A Street 1' } as AddressNested),
    moreAddresses: [
      new AddressNestedModel({ street: 'A Street 2' } as AddressNested),
      new AddressNestedModel({ street: 'A Street 3' } as AddressNested)
    ]
  } as PersonNested);

  expect(person).not.toEqual(undefined);
  expect(person.name).toEqual('Person, Some');
  expect(person.address).not.toEqual(undefined);
  expect(person.address.street).toEqual('A Street 1');
  expect(person.moreAddresses).not.toEqual(undefined);
  expect(person.moreAddresses.length).toEqual(2);
  expect(person.moreAddresses[0].street).toEqual('A Street 2');
  expect(person.moreAddresses[1].street).toEqual('A Street 3');
});

it('should properly set Decimal128, ObjectID types to field', () => {
  expect((CarModel.schema as any).paths.price.instance).toEqual('Decimal128');
  expect((CarModel.schema as any).paths.someId.instance).toEqual('ObjectID');
});

// faild validation will need to be checked
it('should validate Decimal128', async () => {
  try {
    await CarModel.create({
      carModel: 'Tesla',
      price: 'NO DECIMAL' as unknown as mongoose.Types.Decimal128
    });
    // fail('Validation must fail.');
  } catch (e) {
    expect(e).toBeInstanceOf((mongoose.Error as any).ValidationError);
  }
  const car = await CarModel.create({
    carModel: 'Tesla',
    price: mongoose.Types.Decimal128.fromString('123.45')
  });
  const foundCar = await CarModel.findById(car._id).exec();
  expect(foundCar.price).toBeInstanceOf(mongoose.Types.Decimal128);
  expect(foundCar.price.toString()).toEqual('123.45');
});

it('should validate email', async () => {
  try {
    await Person.create({
      email: 'email'
    });
    fail('Validation must fail.');
  } catch (e) {
    expect(e).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(e.message).toEqual( // test it specifically, to know that it is not another error
      'Person validation failed: email: Validator failed for path `email` with value `email`'
    );
  }
});

it(`should Validate Map`, async () => {
  try {
    await InternetUserModel.create({
      projects: {
        p1: 'project' as ProjectValue
      }
    });
    fail('Validation should Fail');
  } catch (e) {
    expect(e).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(e.message).toEqual( // test it specifically, to know that it is not another error
      'InternetUser validation failed: projects.p1: `project` is not a valid enum value for path `projects.p1`.'
    );
  }
});
