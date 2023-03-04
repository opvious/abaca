import {errorFactories} from '@opvious/stl-errors';
import {Resolver} from '@stoplight/json-ref-resolver';

import {OpenapiDocument} from './load.js';

const [errors] = errorFactories({
  definitions: {
    unresolvableReference: (ref: string, issues: ReadonlyArray<Issue>) => ({
      message:
        `Reference ${ref} could not be resolved: ` +
        issues.map(formatIssue).join(', '),
      tags: {ref, issues},
    }),
    unresolvable: (issues: ReadonlyArray<Issue>) => ({
      message:
        'Input could not be fully dereferenced: ' +
        issues.map(formatIssue).join(', '),
      tags: {issues},
    }),
  },
});

interface Issue {
  readonly message: string;
  readonly path: ReadonlyArray<number | string>;
}

function formatIssue(i: Issue): string {
  return `[$${i.path.join('.')}] ${i.message}`;
}

/** Dereference all inline values in the input argument. */
export async function resolveAll<V>(arg: V): Promise<V> {
  const resolver = new Resolver();
  const res = await resolver.resolve(arg);
  if (res.errors.length) {
    throw errors.unresolvable(res.errors);
  }
  return res.result;
}

export class RefResolver {
  private readonly resolver = new Resolver();
  private constructor(private readonly doc: OpenapiDocument) {}

  static create(doc: OpenapiDocument): RefResolver {
    return new RefResolver(doc);
  }

  async resolve<V = unknown>(ref: string): Promise<V> {
    const r = await this.resolver.resolve(this.doc, {jsonPointer: ref});
    if (r.errors.length) {
      throw errors.unresolvableReference(ref, r.errors);
    }
    return r.result;
  }
}
