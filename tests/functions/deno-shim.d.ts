// The small slice of the Deno runtime the Edge Functions use, so `tsc`
// can type-check them without Deno installed (see tsconfig.json here).
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
