# Migrations

The runner applies every unapplied file in filename order, not just files
numbered above the last one applied. A file that lands out of order (a gap
filled later, or a branch merged after a higher number) still runs, so it
must never depend on a higher-numbered file having run first.
