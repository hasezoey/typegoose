---
title: "Get Model For Class"
redirect_from:
  - /docs/functions/getmodelforclass
---

`getModelForClass(class)` is used to get a model for a given class  
If no Mongoose model exists for this class yet, one will be created automatically  

## Example

```ts
class Kitten {
  @prop()
  public name?: string;
}
```
