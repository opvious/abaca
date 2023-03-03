import {ResponseCode} from 'yasdk-openapi/preamble';

// Response code matching

type Prefix = '2' | '3' | '4' | '5';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type ResponseCodeString<
  P extends Prefix = Prefix,
  D1 extends Digit = Digit,
  D2 extends Digit = Digit
> = `${P}${D1}${D2}`;

type ResponseCodeRangeFor<P extends Prefix> = `${P}XX`;

export type ResponseCodesMatching<C extends ResponseCode> = C extends number
  ? `${C}` extends ResponseCodeString
    ? C
    : never
  : C extends ResponseCodeRangeFor<infer P>
  ? ResponseCodeString<P> extends `${infer N extends number}`
    ? N
    : never
  : never;
