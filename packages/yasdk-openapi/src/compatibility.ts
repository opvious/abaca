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
 *    const checker = schemaCompatibilityChecker<Schemas>(doc);
 *    const {isOutline, isSummary} = checker.validators('Outline', 'Summary');
 *
 *    isOutline(arg); // Predicate
 *    assertValue(isOutline, arg); // Assertion
 */
export function schemaCompatibilityChecker<S>(
  doc: OpenapiDocument
): SchemaCompatibilityChecker<S> {
  return RealSchemaCompatibilityChecker.create(doc);
}

/** Schema validator factory. */
export interface SchemaCompatibilityChecker<S> {
  /** Creates validators for the requested type names */
  validators<N extends keyof S & string>(
    ...names: N[]
  ): ValidatorsFor<Pick<S, N>>;
}

/** Schema validators. */
export type ValidatorsFor<S> = {
  readonly [K in keyof S & string as `is${K}`]: ValidationPredicate<S[K]>;
};

export interface ValidationPredicate<V> {
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

  validators<N extends keyof S & string>(
    ...names: N[]
  ): ValidatorsFor<Pick<S, N>> {
    const validators: any = {};
    for (const name of names) {
      const validate = this.validator(name);
      validators['is' + name] = validate;
    }
    return validators;
  }

  private validator(name: string): ValidateFunction {
    let fn = this.ajv.getSchema(name);
    if (!fn) {
      const schema = (this.document as any).components.schemas[name];
      this.ajv.addSchema(schema, name);
      fn = this.ajv.getSchema(name);
      assert(fn, 'Missing validation function for %s', name);
    }
    return fn;
  }
}

/**
 * Returns an `ERR_INCOMPATIBLE_VALUE` error, decorated with the input
 * validation errors. The validation errors must not be null or empty (they are
 * accepted as typed for ease of use).
 */
export function incompatibleValueError(
  errs: ReadonlyArray<ErrorObject> | null | undefined,
  val?: unknown
): IncompatibleValueError {
  assert(errs?.length, 'Empty errors');
  return errors.incompatibleValue(errs, val);
}

/** Schema mismatch error */
export type IncompatibleValueError = StandardErrorForCode<
  typeof codes.IncompatibleValue
>;

function formatErrors(errs: ReadonlyArray<ErrorObject>): string {
  return errs.map((e) => `path $${e.instancePath} ${e.message}`).join(', ');
}

/**
 * Asserts that a value satisfies the provided validator, throwing
 * `ERR_INCOMPATIBLE_VALUE` if not.
 */
export function assertValue<V>(
  pred: ValidationPredicate<V>,
  val: unknown,
  opts?: {
    /** Optional status for any thrown errors */
    readonly status?: ErrorStatus;
  }
): asserts val is V {
  if (pred(val)) {
    return;
  }
  const err = incompatibleValueError(pred.errors, val);
  throw ifPresent(opts?.status, (s) => statusError(s, err)) ?? err;
}
