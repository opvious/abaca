import {assert, errorFactories} from '@mtth/stl-errors';
import * as gql from 'graphql';

const [errors, codes] = errorFactories({
  prefix: 'ERR_GRAPHQL_',
  definitions: {
    resultHasErrors: (res: gql.ExecutionResult<unknown>) => {
      const {errors} = res;
      assert(errors?.length, 'No errors in result');
      return {
        message:
          `GraphQL result had ${errors.length} error(s): ` +
          errors.map((e) => e.message).join(', '),
        tags: {result: res},
      };
    },
  },
});

export {errors};

export default codes;
