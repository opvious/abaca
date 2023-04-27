import {mergeErrorCodes} from '@opvious/stl-errors';

import resolvable, {ResolutionIssue} from './resolvable/index.errors.js';
import {errorCodes as validate} from './validate.js';

export {ResolutionIssue};

export default mergeErrorCodes({...resolvable, ...validate});
