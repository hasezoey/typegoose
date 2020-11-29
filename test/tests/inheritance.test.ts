import { Skyscraper, SkyscraperModel } from '../models/inheritanceClass';

it('should set all direct parent props', async () => {
  const instance = await SkyscraperModel.create({});
  expect(instance.name).toEqual('Some cool string');
  expect(instance.doors).toEqual(4);
  expect(instance.width).toEqual(100);
});

it('should merge all parent schema options', async () => {
  const instance = await SkyscraperModel.create({});
  expect(instance.schema.get('collection')).toEqual('skyscrapers');
  expect(instance.schema.get('discriminatorKey')).toEqual('width');
});

it('should set all parent props for nested schemas', async () => {
  const input = {
    mainGarage: {
      slotsForCars: 3
    }
  } as Skyscraper;
  const instance = await SkyscraperModel.create(input);

  expect(instance.mainGarage!.slotsForCars).toEqual(3);
  expect(instance.mainGarage!.width).toEqual(100);
  // this has an any type assertion, because it shouldnt exists on this type, what is tested here
  expect((instance.mainGarage as any).doors).toBeUndefined();

  // sanity check
  expect(instance.mainGarage).not.toHaveProperty('_id');
});

it('should set all parent props for nested array items', async () => {
  const input = {
    garagesInArea: [
      {
        slotsForCars: 2
      }
    ]
  } as Skyscraper;
  const instance = await SkyscraperModel.create(input);

  expect(instance.garagesInArea).toHaveLength(1);
  const firstGarage = instance.garagesInArea!.pop();
  expect(firstGarage!.slotsForCars).toEqual(2);
  expect(firstGarage!.width).toEqual(100);
  // this has an any type assertion, because it shouldnt exists on this type, what is tested here
  expect((firstGarage as any).doors).toBeUndefined();

  // sanity check
  expect(firstGarage).not.toHaveProperty('_id');
});

it('should override inherited property accessor', () => {
  const instance = new SkyscraperModel();

  expect(instance.calculatedWidth).toEqual(400);
  expect(instance.assignedGardenArea).toEqual(300);
});
