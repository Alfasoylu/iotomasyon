export type ActionResult<TFieldNames extends string = string> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<TFieldNames, string[]>>;
  redirectTo?: string;
};
