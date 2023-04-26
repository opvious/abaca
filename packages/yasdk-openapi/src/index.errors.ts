import {mergeErrorCodes} from '@opvious/stl-errors';

import {errorCodes as parse} from './parse.js';
import {errorCodes as resolve} from './resolve.js';
import {errorCodes as validate} from './validate.js';

export default mergeErrorCodes({...parse, ...resolve, ...validate});
