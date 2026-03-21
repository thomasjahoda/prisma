# Type Benchmark Tests

This package contains type benchmarks tests using [attest](https://github.com/arktypeio/arktype).

These were initially developed together with [David Blass](https://github.com/ssalbdivad).

This test suite shall ensure that we are not running into regressions with our type checking performance.

## Usage

- Make sure the overall monorepo has dependency installed (`pnpm install` in root) and is build (`pnpm build` in root).
- Run `pnpm test` to run the test suite
- Run `pnpm test:update` to update snapshot recordings
- Run `pnpm test <filter>` to run only files including <filter> in their filename
- Run `pnpm test:update <filter>` to only update snapshots of files including <filter> in their filename

## Structure

- Each folder in this directory contains a different schema.
- Folders suffixed with `-js-simplified` use `provider = "prisma-client-js"` and generate with `PRISMA_HACK_GENERATOR_CONFIG_DISABLETYPINGSUPPORTFORHEAVYFEATURES=true`.
- Each schema can be tested with multiple `*.bench.ts` files.
- Each `*.bench.ts` file can contain multiple attest benchmarks and a dedicated baseline.
- Each schema can also contain multiple `*.type-check-benchmark.ts` entrypoint files, which are measured via `tsc --extendedDiagnostics`.
- Each `*.type-check-benchmark.ts` file stores its reference total as `// type-check-benchmark-instantiations: <count>`.
- The generated prisma client for each schema can be found in the `generated` subfolder after a test run.

## What The Files Measure

### `*.bench.ts`

These files run attest expression benchmarks. They are useful for comparing the type-instantiation cost of individual operations or small benchmark groups inside the same generated client.

Common patterns in this directory:

- `basic.bench.ts`: several single-operation microbenchmarks for the schema.
- `ops.bench.ts`: grouped operation benchmarks such as `1 op`, `5 ops`, or `10 ops`.
- `xops.bench.ts`: fixed-size groups of repeated operations for the basic schema.
- `client-options.bench.ts`: constructor option typing microbenchmarks.

### `*.type-check-benchmark.ts`

These files run `tsc --extendedDiagnostics` against one benchmark entrypoint file at a time. They measure whole-file type checking for that entrypoint, and the harness records:

- `Instantiations`
- `Total time`

Common patterns in this directory:

- `client.type-check-benchmark.ts`: intended to expose the cost of bringing the generated Prisma client types into the type-checking program, plus a minimal operation that forces the client shape to be used.
- `10-ops.type-check-benchmark.ts`: type-checks a file containing a fixed set of ten operations so the total compiler work for that entrypoint can be compared between TS and `-js-simplified`.

## Warning

`*.bench.ts` files do **not** measure the largest chunk of typing work by far: the PrismaClient types themselves.

Those benchmarks focus on the expression being benchmarked after applying their local baseline strategy. That makes them useful for comparing operation-specific typing cost, but it also means they do **not** represent total type-checking cost for a file or for the generated client as a whole.

If you want to measure the full compiler-visible cost, especially the PrismaClient type surface and its effect on total type-check duration, use the `*.type-check-benchmark.ts` files instead.
