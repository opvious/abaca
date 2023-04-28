import {mergeErrorCodes} from '@opvious/stl-errors';

import document, {DocumentValidationIssue} from './document/index.errors.js';
import resolvable, {ResolutionIssue} from './resolvable/index.errors.js';
import {errorCodes as validate} from './validate.js';

export {DocumentValidationIssue, ResolutionIssue};

export default mergeErrorCodes({...document, ...resolvable, ...validate});
