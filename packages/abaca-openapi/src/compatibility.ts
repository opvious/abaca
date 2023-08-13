import {
  assert,
  errorFactories,
  ErrorStatus,
  StandardErrorForCode,
  statusError,
} from '@opvious/stl-errors';
import {ifPresent} from '@opvious/stl-utils/functions';
import {default as ajv, ErrorObject, ValidateFunction} from 'ajv';

import {OpenapiDocument} from './document/index.js';

type Ajv = ajv.default;
const Ajv = ajv.default ?? ajv;

const [errors, codes] = errorFactories({
  definitions: {
    incompatibleValue: (errs: ReadonlyArray<ErrorObject>, val?: unknown) => ({
      message: 'Value is not compatible with its schema: ' + formatErrors(errs),
      tags: {errors: [...errs], value: val},
    }),
  },
});

export const errorCodes = codes;

/**
 * Creates a new schema validator factory.
 *
 * Sample usage:
 *
 *    const {isOutline} = schemaCompatibilityPredicates<Schemas>({document});
 *    isOutline(arg); // Predicate
 *    assertValue(isOutline, arg); // Assertion
 */
export function schemaCompatibilityPredicates<
  S,
  N extends keyof S & string
>(args: {
  readonly document: OpenapiDocument<S>;
  /**
   * Schema names for which to generate predicates. By default all schemas are
   * used.
   */
  readonly names?: ReadonlyArray<N>;
}): CompatibilityPredicatesFor<S, N> {
  const doc = args.document;
  const checker = RealSchemaCompatibilityChecker.create<S>(doc);
  const names: any = args.names ?? Object.keys(documentSchemas(doc));
  return checker.predicates(names);
}

function documentSchemas(doc: any): {readonly [name: string]: any} {
  const version = doc.openapi;
  return (
    (version?.startsWith('2') ? doc.definitions : doc.components?.schemas) ?? {}
  );
}

/** Schema validator factory. */
interface SchemaCompatibilityChecker<S> {
  /** Creates predicates for the requested type names */
  predicates<N extends keyof S & string>(
    // Use an array instead of varargs to allow better auto-complete (otherwise
    // only names that have already been typed will be suggested.
    names: ReadonlyArray<N>
  ): CompatibilityPredicatesFor<S, N>;
}

/** Schema predicates. */
export type CompatibilityPredicatesFor<S, N extends keyof S = keyof S> = {
  readonly [K in N & string as `is${K}`]: CompatibilityPredicate<S[K]>;
};

export interface CompatibilityPredicate<V> {
  (arg: unknown): arg is V;
  readonly errors?: ReadonlyArray<ErrorObject> | null;
}

class RealSchemaCompatibilityChecker<S>
  implements SchemaCompatibilityChecker<S>
{
  private constructor(
    private readonly document: OpenapiDocument,
    private readonly ajv: Ajv
  ) {}

  static create<S>(doc: OpenapiDocument): SchemaCompatibilityChecker<S> {
    return new RealSchemaCompatibilityChecker(doc, new Ajv());
  }

  predicates<N extends keyof S & string>(
    names: ReadonlyArray<N>
  ): CompatibilityPredicatesFor<S, N> {
    const predicates: any = {};
    for (const name of names) {
      const validate = this.validator(name);
      predicates['is' + name] = validate;
    }
    return predicates;
  }

  private validator(name: string): ValidateFunction {
    let fn = this.ajv.getSchema(name);
    if (!fn) {
      const schema = documentSchemas(this.document)[name];
      this.ajv.addSchema(schema, name);
      fn = this.ajv.getSchema(name);
      assert(fn, 'Missing validation function for %s', name);
    }
    return fn;
  }
}

/**
 * Returns an `ERR_INCOMPATIBLE_VALUE` error if the input predicate has any
 * errors. The `value` option can be used to execute the predicate beforehand.
 */
export function incompatibleValueError(
  fn: CompatibilityPredicate<unknown>,
  opts?: {
    /**
     * Value to call the predicate with. If unspecified, errors from the
     * predicate's last validation call will be used. This value will also be
     * used to decorate any returned error.
     */
    readonly value?: unknown;
    /**
     * Do not call the predicate on the value. This is useful if you would like
     * to include the value in the returned error and you known the predicate
     * has already been called with it.
     */
    readonly skipValidation?: boolean;
  }
): IncompatibleValueError | undefined {
  if (opts && !opts.skipValidation && 'value' in opts) {
    fn(opts.value);
  }
  return fn.errors?.length
    ? errors.incompatibleValue(fn.errors, opts?.value)
    : undefined;
}

/** Schema mismatch error */
export type IncompatibleValueError = StandardErrorForCode<
  typeof codes.IncompatibleValue
>;

function formatErrors(errs: ReadonlyArray<ErrorObject>): string {
  return errs.map((e) => `path $${e.instancePath} ${e.message}`).join(', ');
}

/**
 * Asserts that a value satisfies the provided predicate, throwing
 * `ERR_INCOMPATIBLE_VALUE` if not, optionally decorated with a status.
 */
export function assertCompatible<V>(
  val: unknown,
  pred: CompatibilityPredicate<V>,
  opts?: {
    /** Optional status for any thrown errors */
    readonly status?: ErrorStatus;
  }
): asserts val is V {
  const err = incompatibleValueError(pred, {value: val});
  if (!err) {
    return;
  }
  throw ifPresent(opts?.status, (s) => statusError(s, err)) ?? err;
}
