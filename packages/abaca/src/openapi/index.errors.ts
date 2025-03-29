import {mergeErrorCodes} from '@mtth/stl-errors';

import {errorCodes as compatibility} from './compatibility.js';
import document, {DocumentValidationIssue} from './document/index.errors.js';
import resolvable, {ResolutionIssue} from './resolvable/index.errors.js';

export {DocumentValidationIssue, ResolutionIssue};

export default mergeErrorCodes({...document, ...resolvable, ...compatibility});
