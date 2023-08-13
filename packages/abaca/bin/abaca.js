#!/usr/bin/env node

import {mainCommand} from '../lib/index.js';

mainCommand().parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
