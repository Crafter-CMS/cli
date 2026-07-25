#!/usr/bin/env node

const { execute } = require("@oclif/core");

execute({ dir: __dirname })
  .then(require("@oclif/core/handle"))
  .catch(require("@oclif/core/handle"));
