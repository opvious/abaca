import {
  assert,
  errorFactories,
  ErrorStatus,
  StandardErrorForCode,
  statusError,
} from '@opvious/stl-errors';
import {default as ajv, ErrorObject, ValidateFunction} from 'ajv';

import {OpenapiDocument} from './load.js';
import {ReferenceResolver} from './resolve.js';

type Ajv = ajv.default;
const Ajv = ajv.default ?? ajv;

const [errors, codes] = errorFactories({
  definitions: {
    invalidValue: (errs: ReadonlyArray<ErrorObject>, val?: unknown) => ({
      message: 'Value does not match its schema: ' + formatErrors(errs),
      tags: {errors: [...errs], value: val},
    }),
  },
  prefix: 'ERR_OPENAPI_',
});

export const validateErrorCodes = codes;

/** Throws if errors is null or empty. */
export function invalidValueError(
  errs: ReadonlyArray<ErrorObject> | null | undefined,
  val?: unknown
): InvalidValueError {
  assert(errs?.length, 'Missing validation errors');
  return errors.invalidValue(errs, val);
}

export type InvalidValueError = StandardErrorForCode<typeof codes.InvalidValue>;

function formatErrors(errs: ReadonlyArray<ErrorObject>): string {
  return errs.map((e) => `path $${e.instancePath} ${e.message}`).join(', ');
}

/**
 * Creates a new schema validator factory.
 *
 * Sample usage:
 *
 *    const validators = schemaEnforcer<Schemas>(doc).validators({
 *      names: ['Outline', 'Summary'],
 *    });
 *    validators.isOutline(arg);
 *    validators.assertOutline(arg, status?:);
 */
export function schemaEnforcer<S>(doc: OpenapiDocument): SchemaEnforcer<S> {
  return RealSchemaEnforcer.create(doc);
}

/** Schema validator factory. */
export interface SchemaEnforcer<S> {
  validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): ValidatorsFor<Pick<S, N>>;
}

/** Schema validators. */
export type ValidatorsFor<S> = {
  readonly [K in keyof S & string as `is${K}`]: ValidationPredicate<S[K]>;
} & {
  readonly [K in keyof S & string as `assert${K}`]: ValidationAssertion<S[K]>;
};

export type ValidationPredicate<V> = (arg: unknown) => arg is V;

export type ValidationAssertion<V> = (
  arg: unknown,
  status?: ErrorStatus
) => asserts arg is V;

function asserting<V>(pred: ValidateFunction<V>): ValidationAssertion<V> {
  return (arg: unknown, status?: ErrorStatus) => {
    if (pred(arg)) {
      return;
    }
    const err = invalidValueError(pred.errors, arg);
    throw status == null ? err : statusError(status, err);
  };
}

class RealSchemaEnforcer<S> implements SchemaEnforcer<S> {
  private constructor(
    private readonly ajv: Ajv,
    private readonly resolver: ReferenceResolver
  ) {}

  static create<S>(doc: OpenapiDocument): SchemaEnforcer<S> {
    return new RealSchemaEnforcer(new Ajv(), ReferenceResolver.create(doc));
  }

  validators<N extends keyof S & string>(args: {
    readonly names: ReadonlyArray<N>;
  }): ValidatorsFor<Pick<S, N>> {
    const validators: any = {};
    for (const name of args.names) {
      const validate = this.validator(name);
      validators['is' + name] = validate;
      validators['assert' + name] = asserting(validate);
    }
    return validators;
  }

  private validator<N extends keyof S & string>(
    name: N
  ): ValidateFunction<S[N]> {
    const schema = this.resolver.resolve('#/components/schemas/' + name);
    return this.ajv.compile(schema);
  }
}
