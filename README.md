# options
Node options parser that looks at argv, environment variables and a config file.

## install
```
npm i -S @jhanssen/options
```

## usage

```javascript
const option = require("@jhanssen/options")(prefix);
const valueString = option("key");
const valueInt = option.int("key", 42);
const valueJson = option.json("key", {test:123});
```
