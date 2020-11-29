import { getModelForClass, modelOptions, prop } from '../../src/typegoose';

@modelOptions({
  schemaOptions: {
    discriminatorKey: 'width',
    collection: 'buildings'
  }
})
export class Building {
  @prop({ default: 100 })
  public width?: number;

  public get calculatedWidth() {
    return this.width;
  }

  public get assignedGardenArea() {
    return 300;
  }
}

export class OfficeBuilding extends Building {
  @prop({ default: 4 })
  public doors?: number;
}

export class Garage extends Building {
  @prop({ default: 10 })
  public slotsForCars?: number;
}

@modelOptions({
  schemaOptions: {
    collection: 'skyscrapers'
  }
})
export class Skyscraper extends OfficeBuilding {
  @prop({ default: 'Some cool string' })
  public name?: string;

  @prop({ _id: false })
  public mainGarage?: Garage;

  @prop({ type: Garage, _id: false })
  public garagesInArea?: Garage[];

  public get calculatedWidth() {
    return this.width! * this.doors!;
  }
}

export const SkyscraperModel = getModelForClass(Skyscraper);
